package handlers

import (
	"database/sql"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
)

func (a *App) RequestPickupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.Auth.UserFromRequest(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != "user" {
		httpx.SendResponse(w, "error", "Akses ditolak. Pengajuan penjemputan hanya dapat dibuat oleh Eco Warrior.", nil, http.StatusForbidden)
		return
	}

	data := pickupRequestData(r)

	requiredFields := []string{"item_description", "pickup_address", "contact_phone", "weight_kg", "category"}
	for _, field := range requiredFields {
		if data[field] == "" {
			httpx.SendResponse(w, "error", fmt.Sprintf("Field '%s' wajib diisi.", field), nil, http.StatusBadRequest)
			return
		}
	}

	weight, err := strconv.ParseFloat(data["weight_kg"], 64)
	if err != nil || weight <= 0 {
		httpx.SendResponse(w, "error", "Berat sampah harus berupa angka numerik positif dan lebih besar dari 0 KG.", nil, http.StatusBadRequest)
		return
	}

	photoURL, problem := savePickupPhoto(r)
	if problem != nil {
		problem.write(w)
		return
	}

	categoryName := strings.TrimSpace(data["category"])
	var catID int
	var catDisplayName string
	var rewardPerKg, processingFeePerKg float64

	err = a.DB.QueryRow("SELECT id, category_name, reward_per_kg, processing_fee_per_kg FROM waste_categories WHERE category_name = ?", categoryName).
		Scan(&catID, &catDisplayName, &rewardPerKg, &processingFeePerKg)
	if err != nil {
		httpx.SendResponse(w, "error", "Kategori sampah tidak ditemukan.", nil, http.StatusBadRequest)
		return
	}

	ecoReward := rewardPerKg * weight
	processingFee := processingFeePerKg * weight
	trackingNum := fmt.Sprintf("ECR-%s-%05d", time.Now().Format("20060102"), 10000+rand.Intn(90000))

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec("INSERT INTO pickups (user_id, tracking_number, item_description, pickup_address, contact_phone, weight_kg, category_id, eco_reward, processing_fee, photo_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
		user.ID, trackingNum, data["item_description"], data["pickup_address"], data["contact_phone"], weight, catID, ecoReward, processingFee, photoURL)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menyimpan data penjemputan.", nil, http.StatusInternalServerError)
		return
	}

	pickupID, err := res.LastInsertId()
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mengambil ID penjemputan.", nil, http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (?, 'pending', 'Lokasi Masyarakat (User)', 'Permohonan penjemputan baru diajukan.')", pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", pickupHistorySaveMessage, nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Permohonan penjemputan sampah berhasil dibuat.", map[string]interface{}{
		"pickup_id":       pickupID,
		"tracking_number": trackingNum,
		"eco_reward":      ecoReward,
		"processing_fee":  processingFee,
		"status":          models.StatusPending,
	}, http.StatusCreated)
}

func (a *App) ListPickupsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.Auth.UserFromRequest(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}

	queryType := r.URL.Query().Get("type")
	if queryType == "" {
		queryType = "all"
	}

	var rows *sql.Rows
	var qErr error

	if queryType == "user" {
		query := `SELECT p.id, p.user_id, p.collector_id, p.tracking_number, p.item_description, p.pickup_address, p.contact_phone, p.weight_kg, p.category_id, p.eco_reward, p.processing_fee, p.photo_url, p.is_processed, p.status, p.created_at, p.final_weight_kg, p.final_eco_reward, p.final_processing_fee, p.verification_notes, p.verified_at, c.category_name
				  FROM pickups p
				  LEFT JOIN waste_categories c ON p.category_id = c.id
				  WHERE p.user_id = ?
				  ORDER BY p.created_at DESC`
		rows, qErr = a.DB.Query(query, user.ID)
	} else if queryType == "collector" {
		query := `SELECT p.id, p.user_id, p.collector_id, p.tracking_number, p.item_description, p.pickup_address, p.contact_phone, p.weight_kg, p.category_id, p.eco_reward, p.processing_fee, p.photo_url, p.is_processed, p.status, p.created_at, p.final_weight_kg, p.final_eco_reward, p.final_processing_fee, p.verification_notes, p.verified_at, c.category_name, u.name AS donor_name
				  FROM pickups p
				  LEFT JOIN waste_categories c ON p.category_id = c.id
				  LEFT JOIN users u ON p.user_id = u.id
				  WHERE p.collector_id = ? OR p.status = 'pending'
				  ORDER BY p.created_at DESC`
		rows, qErr = a.DB.Query(query, user.ID)
	} else {
		if user.Role != "admin" {
			httpx.SendResponse(w, "error", "Akses ditolak. Perlu hak akses Administrator.", nil, http.StatusForbidden)
			return
		}
		query := `SELECT p.id, p.user_id, p.collector_id, p.tracking_number, p.item_description, p.pickup_address, p.contact_phone, p.weight_kg, p.category_id, p.eco_reward, p.processing_fee, p.photo_url, p.is_processed, p.status, p.created_at, p.final_weight_kg, p.final_eco_reward, p.final_processing_fee, p.verification_notes, p.verified_at, c.category_name, u.name AS donor_name, col.name AS collector_name, u.payout_method, u.payout_account_name, u.payout_account_number
				  FROM pickups p
				  LEFT JOIN waste_categories c ON p.category_id = c.id
				  LEFT JOIN users u ON p.user_id = u.id
				  LEFT JOIN users col ON p.collector_id = col.id
				  ORDER BY p.created_at DESC`
		rows, qErr = a.DB.Query(query)
	}

	if qErr != nil {
		httpx.SendResponse(w, "error", "Gagal mengambil data penjemputan dari database.", nil, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	list := make([]map[string]interface{}, 0)
	for rows.Next() {
		item, scanErr := scanPickupListRow(rows, queryType)
		if scanErr == nil {
			list = append(list, item)
		}
	}

	httpx.SendResponse(w, "success", "Daftar penjemputan sampah berhasil diambil.", list, http.StatusOK)
}

func (a *App) UpdatePickupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.Auth.UserFromRequest(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != "user" {
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Eco Warrior yang dapat mengubah pengajuan.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	trackingNum := strings.TrimSpace(data["tracking_number"])
	itemDescription := strings.TrimSpace(data["item_description"])
	pickupAddress := strings.TrimSpace(data["pickup_address"])
	contactPhone := strings.TrimSpace(data["contact_phone"])
	categoryName := strings.TrimSpace(data["category"])

	if trackingNum == "" || itemDescription == "" || pickupAddress == "" || contactPhone == "" || categoryName == "" || data["weight_kg"] == "" {
		httpx.SendResponse(w, "error", "Nomor tracking, deskripsi, alamat, kontak, kategori, dan berat wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	weight, err := strconv.ParseFloat(data["weight_kg"], 64)
	if err != nil || weight <= 0 {
		httpx.SendResponse(w, "error", "Berat sampah harus berupa angka positif.", nil, http.StatusBadRequest)
		return
	}

	var pickupID int
	var status string
	err = a.DB.QueryRow("SELECT id, status FROM pickups WHERE tracking_number = ? AND user_id = ?", trackingNum, user.ID).Scan(&pickupID, &status)
	if err == sql.ErrNoRows {
		httpx.SendResponse(w, "error", "Pengajuan tidak ditemukan atau bukan milik Anda.", nil, http.StatusNotFound)
		return
	} else if err != nil {
		httpx.SendResponse(w, "error", "Kesalahan database.", nil, http.StatusInternalServerError)
		return
	}
	if status != models.StatusPending {
		httpx.SendResponse(w, "error", "Pengajuan hanya dapat diubah selama masih menunggu kolektor.", nil, http.StatusBadRequest)
		return
	}

	var catID int
	var rewardPerKg, processingFeePerKg float64
	err = a.DB.QueryRow("SELECT id, reward_per_kg, processing_fee_per_kg FROM waste_categories WHERE category_name = ?", categoryName).
		Scan(&catID, &rewardPerKg, &processingFeePerKg)
	if err != nil {
		httpx.SendResponse(w, "error", "Kategori sampah tidak ditemukan.", nil, http.StatusBadRequest)
		return
	}

	ecoReward := rewardPerKg * weight
	processingFee := processingFeePerKg * weight

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`UPDATE pickups
		SET item_description = ?, pickup_address = ?, contact_phone = ?, weight_kg = ?, category_id = ?, eco_reward = ?, processing_fee = ?
		WHERE id = ? AND status = 'pending'`, itemDescription, pickupAddress, contactPhone, weight, catID, ecoReward, processingFee, pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal memperbarui pengajuan.", nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (?, 'pending', 'Lokasi Masyarakat (User)', 'Pengajuan diperbarui oleh Eco Warrior sebelum diambil kolektor.')", pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mencatat riwayat perubahan.", nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Pengajuan berhasil diperbarui.", map[string]interface{}{
		"tracking_number": trackingNum,
		"eco_reward":      ecoReward,
		"processing_fee":  processingFee,
		"status":          models.StatusPending,
	}, http.StatusOK)
}

func (a *App) CancelPickupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.Auth.UserFromRequest(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != "user" {
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Eco Warrior yang dapat membatalkan pengajuan.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	trackingNum := strings.TrimSpace(data["tracking_number"])
	reason := strings.TrimSpace(data["reason"])
	if reason == "" {
		reason = "Pengajuan dibatalkan oleh Eco Warrior sebelum diambil kolektor."
	}
	if trackingNum == "" {
		httpx.SendResponse(w, "error", "Nomor tracking wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec("UPDATE pickups SET status = 'cancelled' WHERE tracking_number = ? AND user_id = ? AND status = 'pending'", trackingNum, user.ID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal membatalkan pengajuan.", nil, http.StatusInternalServerError)
		return
	}
	affected, err := res.RowsAffected()
	if err != nil || affected == 0 {
		httpx.SendResponse(w, "error", "Pengajuan tidak dapat dibatalkan. Pastikan status masih menunggu kolektor.", nil, http.StatusBadRequest)
		return
	}

	var pickupID int
	err = tx.QueryRow(pickupIDQuery, trackingNum).Scan(&pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menemukan ID pengajuan.", nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (?, 'cancelled', 'Lokasi Masyarakat (User)', ?)", pickupID, reason)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mencatat riwayat pembatalan.", nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Pengajuan berhasil dibatalkan.", map[string]interface{}{
		"tracking_number": trackingNum,
		"status":          models.StatusCancelled,
	}, http.StatusOK)
}

func (a *App) AssignCollectorHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.Auth.UserFromRequest(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != "collector" && user.Role != "admin" {
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Kolektor/Admin yang dapat mengambil tugas.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	trackingNum := data["tracking_number"]
	if trackingNum == "" {
		httpx.SendResponse(w, "error", "Nomor tracking wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	collectorID := assignmentCollectorID(user, data["collector_id"])

	var collectorName string
	var collectorRole string
	err = a.DB.QueryRow("SELECT name, role FROM users WHERE id = ?", collectorID).Scan(&collectorName, &collectorRole)
	if err != nil {
		httpx.SendResponse(w, "error", "Kolektor tidak ditemukan.", nil, http.StatusBadRequest)
		return
	}
	if collectorRole != "collector" {
		httpx.SendResponse(w, "error", "User yang dipilih bukan Eco Collector.", nil, http.StatusBadRequest)
		return
	}

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec("UPDATE pickups SET collector_id = ?, status = 'pickup' WHERE tracking_number = ? AND status = 'pending'", collectorID, trackingNum)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menetapkan tugas penjemputan.", nil, http.StatusInternalServerError)
		return
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil || rowsAffected == 0 {
		httpx.SendResponse(w, "error", "Tugas tidak tersedia. Pastikan nomor tracking valid dan masih berstatus pending.", nil, http.StatusBadRequest)
		return
	}

	var pickupID int
	err = tx.QueryRow(pickupIDQuery, trackingNum).Scan(&pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", pickupIDLookupMessage, nil, http.StatusInternalServerError)
		return
	}

	notes := fmt.Sprintf("Penjemputan diambil alih oleh Kolektor: %s", collectorName)
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (?, 'pickup', 'Kolektor Wilayah', ?)", pickupID, notes)
	if err != nil {
		httpx.SendResponse(w, "error", pickupHistorySaveMessage, nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Tugas penjemputan berhasil diambil.", map[string]interface{}{
		"tracking_number": trackingNum,
		"collector_id":    collectorID,
	}, http.StatusOK)
}
