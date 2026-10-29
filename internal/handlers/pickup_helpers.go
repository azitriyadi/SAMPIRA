package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
)

const (
	methodNotAllowedMessage  = "Metode request tidak diizinkan."
	transactionStartMessage  = "Gagal memulai transaksi."
	transactionCommitMessage = "Gagal commit transaksi."
	pickupHistorySaveMessage = "Gagal menyimpan riwayat penjemputan."
	pickupIDLookupMessage    = "Gagal menemukan ID penjemputan."
	pickupIDQuery            = "SELECT id FROM pickups WHERE tracking_number = ?"
)

type apiProblem struct {
	message string
	status  int
}

func (p *apiProblem) write(w http.ResponseWriter) {
	httpx.SendResponse(w, "error", p.message, nil, p.status)
}

func pickupRequestData(r *http.Request) map[string]string {
	err := r.ParseMultipartForm(10 << 20)
	if err != nil || r.MultipartForm == nil || len(r.MultipartForm.Value) == 0 {
		return httpx.RequestData(r)
	}
	data := make(map[string]string)
	for key, values := range r.MultipartForm.Value {
		if len(values) > 0 {
			data[key] = values[0]
		}
	}
	return data
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func assignmentCollectorID(user *models.TokenPayload, rawID string) int {
	if user.Role != "admin" || rawID == "" {
		return user.ID
	}
	id, err := strconv.Atoi(rawID)
	if err != nil {
		return user.ID
	}
	return id
}

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func validPickupTransition(current, next string) bool {
	switch current {
	case models.StatusPickup:
		return next == models.StatusTransit
	case models.StatusTransit:
		return next == models.StatusArrived
	default:
		return false
	}
}

func ownsPickupStatus(user *models.TokenPayload, collectorID sql.NullInt64) bool {
	if user.Role == "admin" {
		return true
	}
	return collectorID.Valid && int(collectorID.Int64) == user.ID
}
