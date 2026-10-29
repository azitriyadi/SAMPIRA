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
	"ecorecycle/internal/services"
)

func (a *App) EstimateRewardHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	data := httpx.RequestData(r)
	categoryName := strings.TrimSpace(data["category"])
	weightStr := data["weight_kg"]
	if categoryName == "" || weightStr == "" {
		httpx.SendResponse(w, "error", "Kategori dan berat (KG) wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	weight, err := strconv.ParseFloat(weightStr, 64)
	if err != nil || weight <= 0 {
		httpx.SendResponse(w, "error", "Berat harus lebih besar dari 0 KG.", nil, http.StatusBadRequest)
		return
	}

	var catDisplayName string
	var rewardPerKg, processingFeePerKg float64
	err = a.DB.QueryRow("SELECT category_name, reward_per_kg, processing_fee_per_kg FROM waste_categories WHERE category_name = ?", categoryName).
		Scan(&catDisplayName, &rewardPerKg, &processingFeePerKg)
	if err != nil {
		httpx.SendResponse(w, "error", "Kategori sampah tidak ditemukan.", nil, http.StatusBadRequest)
		return
	}

	totalReward := rewardPerKg * weight
	httpx.SendResponse(w, "success", "Estimasi reward berhasil dihitung.", map[string]interface{}{
		"category":       catDisplayName,
		"weight_kg":      weight,
		"reward_rate":    rewardPerKg,
		"total_estimate": totalReward,
		"processing_fee": processingFeePerKg * weight,
		"net_estimate":   totalReward - processingFeePerKg*weight,
		"co2_saved":      services.CO2Saved(weight),
	}, http.StatusOK)
}

func (a *App) VerifyPickupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.Auth.UserFromRequest(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != "admin" {
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Admin yang dapat memverifikasi berat final.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	pickupID, err := strconv.Atoi(data["pickup_id"])
	if err != nil || pickupID <= 0 {
		httpx.SendResponse(w, "error", "pickup_id tidak valid.", nil, http.StatusBadRequest)
		return
	}
	finalWeight, err := strconv.ParseFloat(data["final_weight_kg"], 64)
	if err != nil || finalWeight <= 0 {
		httpx.SendResponse(w, "error", "Berat final harus berupa angka positif.", nil, http.StatusBadRequest)
		return
	}
	notes := data["verification_notes"]
	if notes == "" {
		notes = "Berat final diverifikasi oleh admin hub."
	}

	var pickupStatus string
	var rewardPerKg, processingFeePerKg float64
	err = a.DB.QueryRow(`SELECT p.status, c.reward_per_kg, c.processing_fee_per_kg
		FROM pickups p
		LEFT JOIN waste_categories c ON p.category_id = c.id
		WHERE p.id = ?`, pickupID).Scan(&pickupStatus, &rewardPerKg, &processingFeePerKg)
	if err == sql.ErrNoRows {
		httpx.SendResponse(w, "error", "Data penjemputan tidak ditemukan.", nil, http.StatusNotFound)
		return
	} else if err != nil {
		httpx.SendResponse(w, "error", "Kesalahan database.", nil, http.StatusInternalServerError)
		return
	}
	if pickupStatus != models.StatusArrived {
		httpx.SendResponse(w, "error", "Verifikasi berat final hanya dapat dilakukan setelah sampah tiba di hub.", nil, http.StatusBadRequest)
		return
	}

	finalReward := finalWeight * rewardPerKg
	finalFee := finalWeight * processingFeePerKg

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`UPDATE pickups
		SET final_weight_kg = ?, final_eco_reward = ?, final_processing_fee = ?, verification_notes = ?, verified_at = NOW()
		WHERE id = ?`, finalWeight, finalReward, finalFee, notes, pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menyimpan verifikasi berat final.", nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (?, 'arrived', 'Recycling Hub Bandung', ?)", pickupID, notes)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mencatat riwayat verifikasi.", nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Berat final berhasil diverifikasi.", map[string]interface{}{
		"pickup_id":            pickupID,
		"final_weight_kg":      finalWeight,
		"final_eco_reward":     finalReward,
		"final_processing_fee": finalFee,
		"final_net_reward":     finalReward - finalFee,
		"verification_notes":   notes,
	}, http.StatusOK)
}

func (a *App) ProcessPayoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.Auth.UserFromRequest(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != "admin" {
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Admin/Finance yang dapat menyetujui payout.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	pickupIDStr := data["pickup_id"]
	if pickupIDStr == "" {
		httpx.SendResponse(w, "error", "pickup_id wajib diisi.", nil, http.StatusBadRequest)
		return
	}
	pickupID, err := strconv.Atoi(pickupIDStr)
	if err != nil {
		httpx.SendResponse(w, "error", "pickup_id tidak valid.", nil, http.StatusBadRequest)
		return
	}

	amountPaid, problem := a.loadPayoutAmount(pickupID)
	if problem != nil {
		problem.write(w)
		return
	}

	transactionRef := fmt.Sprintf("TX-%d-%04d", time.Now().Unix(), 1000+rand.Intn(9000))
	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec("UPDATE pickups SET is_processed = TRUE, status = 'completed' WHERE id = ?", pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal memperbarui status penjemputan.", nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO transactions (pickup_id, transaction_ref, amount, transaction_type, status) VALUES (?, ?, ?, 'reward_payout', 'success')",
		pickupID, transactionRef, amountPaid)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menyimpan log transaksi.", nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (?, 'completed', 'Pusat Daur Ulang', 'Sampah berhasil diproses dan reward ditransfer.')", pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", pickupHistorySaveMessage, nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Eco-reward payout berhasil diproses.", map[string]interface{}{
		"pickup_id":             pickupID,
		"amount_paid":           amountPaid,
		"transaction_reference": transactionRef,
	}, http.StatusOK)
}
