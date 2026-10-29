package handlers

import (
	"database/sql"
	"net/http"
	"time"

	httpx "ecorecycle/internal/middleware"
)

func (a *App) PickupStatusGetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	_, err := a.Auth.UserFromRequest(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}

	queryType := r.URL.Query().Get("type")
	if queryType == "stats" {
		var totalPickups int
		var pendingVerifications int
		var totalWeight float64
		var totalRewardPaid float64
		var totalRewardPending float64
		var collectorsOnline int

		a.DB.QueryRow("SELECT COUNT(*) FROM pickups").Scan(&totalPickups)
		a.DB.QueryRow("SELECT COUNT(*) FROM pickups WHERE status = 'pending'").Scan(&pendingVerifications)
		a.DB.QueryRow("SELECT COALESCE(SUM(weight_kg), 0.0) FROM pickups").Scan(&totalWeight)
		a.DB.QueryRow("SELECT COALESCE(SUM(eco_reward), 0.0) FROM pickups WHERE is_processed = TRUE").Scan(&totalRewardPaid)
		a.DB.QueryRow("SELECT COALESCE(SUM(eco_reward), 0.0) FROM pickups WHERE is_processed = FALSE").Scan(&totalRewardPending)
		a.DB.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'collector'").Scan(&collectorsOnline)

		httpx.SendResponse(w, "success", "Statistik sampah berhasil diambil.", map[string]interface{}{
			"total_weight":          totalWeight,
			"total_reward_paid":     totalRewardPaid,
			"total_reward_pending":  totalRewardPending,
			"total_pickups":         totalPickups,
			"pending_verifications": pendingVerifications,
			"collectors_online":     collectorsOnline,
		}, http.StatusOK)
		return
	}

	trackingNum := r.URL.Query().Get("tracking_number")
	if trackingNum == "" {
		httpx.SendResponse(w, "error", "Nomor tracking wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	var p struct {
		ID             int
		UserID         int
		CollectorID    *int
		TrackingNumber string
		ItemDesc       *string
		PickupAddress  *string
		ContactPhone   *string
		WeightKg       *float64
		CategoryID     *int
		EcoReward      *float64
		ProcessingFee  *float64
		PhotoURL       *string
		IsProcessed    bool
		Status         string
		CreatedAt      time.Time
		CategoryName   *string
		DonorName      *string
		CollectorName  *string
	}

	query := `SELECT p.id, p.user_id, p.collector_id, p.tracking_number, p.item_description, p.pickup_address, p.contact_phone, p.weight_kg, p.category_id, p.eco_reward, p.processing_fee, p.photo_url, p.is_processed, p.status, p.created_at, c.category_name, u.name AS donor_name, col.name AS collector_name
			  FROM pickups p
			  LEFT JOIN waste_categories c ON p.category_id = c.id
			  LEFT JOIN users u ON p.user_id = u.id
			  LEFT JOIN users col ON p.collector_id = col.id
			  WHERE p.tracking_number = ?`

	err = a.DB.QueryRow(query, trackingNum).Scan(
		&p.ID, &p.UserID, &p.CollectorID, &p.TrackingNumber, &p.ItemDesc, &p.PickupAddress,
		&p.ContactPhone, &p.WeightKg, &p.CategoryID, &p.EcoReward, &p.ProcessingFee,
		&p.PhotoURL, &p.IsProcessed, &p.Status, &p.CreatedAt, &p.CategoryName,
		&p.DonorName, &p.CollectorName,
	)
	if err == sql.ErrNoRows {
		httpx.SendResponse(w, "error", "Nomor tracking tidak ditemukan.", nil, http.StatusNotFound)
		return
	} else if err != nil {
		httpx.SendResponse(w, "error", "Kesalahan database.", nil, http.StatusInternalServerError)
		return
	}

	rows, err := a.DB.Query("SELECT id, pickup_id, status, location, notes, updated_at FROM pickup_history WHERE pickup_id = ? ORDER BY updated_at DESC", p.ID)
	historyList := make([]map[string]interface{}, 0)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var h struct {
				ID        int
				PickupID  int
				Status    string
				Location  *string
				Notes     *string
				UpdatedAt time.Time
			}
			if err := rows.Scan(&h.ID, &h.PickupID, &h.Status, &h.Location, &h.Notes, &h.UpdatedAt); err == nil {
				historyList = append(historyList, map[string]interface{}{
					"id":         h.ID,
					"pickup_id":  h.PickupID,
					"status":     h.Status,
					"location":   h.Location,
					"notes":      h.Notes,
					"updated_at": h.UpdatedAt,
				})
			}
		}
	}

	respData := map[string]interface{}{
		"id":               p.ID,
		"user_id":          p.UserID,
		"collector_id":     p.CollectorID,
		"tracking_number":  p.TrackingNumber,
		"item_description": p.ItemDesc,
		"pickup_address":   p.PickupAddress,
		"contact_phone":    p.ContactPhone,
		"weight_kg":        p.WeightKg,
		"category_id":      p.CategoryID,
		"eco_reward":       p.EcoReward,
		"processing_fee":   p.ProcessingFee,
		"photo_url":        p.PhotoURL,
		"is_processed":     p.IsProcessed,
		"status":           p.Status,
		"created_at":       p.CreatedAt,
		"category_name":    p.CategoryName,
		"donor_name":       p.DonorName,
		"collector_name":   p.CollectorName,
		"history":          historyList,
	}
	if p.DonorName != nil {
		respData["donor_name"] = *p.DonorName
	}
	if p.CollectorName != nil {
		respData["collector_name"] = *p.CollectorName
	}

	httpx.SendResponse(w, "success", "Data pelacakan ditemukan.", respData, http.StatusOK)
}

func (a *App) PickupStatusPostHandler(w http.ResponseWriter, r *http.Request) {
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
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Kolektor/Admin yang dapat memperbarui status penjemputan.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	trackingNum := data["tracking_number"]
	status := data["status"]
	if trackingNum == "" || status == "" {
		httpx.SendResponse(w, "error", "Nomor tracking dan status baru wajib diisi.", nil, http.StatusBadRequest)
		return
	}
	if problem := a.validatePickupStatusUpdate(user, trackingNum, status); problem != nil {
		problem.write(w)
		return
	}
	location := valueOrDefault(data["location"], "System")
	notes := valueOrDefault(data["notes"], "Status diperbarui")

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec("UPDATE pickups SET status = ? WHERE tracking_number = ?", status, trackingNum)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal memperbarui status.", nil, http.StatusInternalServerError)
		return
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil || rowsAffected == 0 {
		httpx.SendResponse(w, "error", "Nomor tracking tidak ditemukan atau gagal diperbarui.", nil, http.StatusBadRequest)
		return
	}

	var pickupID int
	err = tx.QueryRow(pickupIDQuery, trackingNum).Scan(&pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", pickupIDLookupMessage, nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (?, ?, ?, ?)", pickupID, status, location, notes)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mencatat riwayat penjemputan.", nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Status penjemputan berhasil diperbarui.", map[string]interface{}{
		"tracking_number": trackingNum,
		"status":          status,
	}, http.StatusOK)
}
