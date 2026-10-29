package handlers

import (
	"database/sql"
	"net/http"

	"ecorecycle/internal/models"
)

type payoutState struct {
	reward     sql.NullFloat64
	fee        sql.NullFloat64
	verifiedAt sql.NullTime
	processed  bool
	status     string
}

func (state payoutState) amount() (float64, *apiProblem) {
	if state.processed {
		return 0, &apiProblem{"Eco-reward untuk penjemputan ini sudah pernah diproses.", http.StatusBadRequest}
	}
	if state.status != models.StatusArrived {
		return 0, &apiProblem{"Payout hanya dapat diproses setelah sampah tiba di Recycling Hub.", http.StatusBadRequest}
	}
	if !state.verifiedAt.Valid || !state.reward.Valid || !state.fee.Valid {
		return 0, &apiProblem{"Payout belum dapat diproses. Admin harus memverifikasi berat final terlebih dahulu.", http.StatusBadRequest}
	}
	return state.reward.Float64 - state.fee.Float64, nil
}

func (a *App) loadPayoutAmount(pickupID int) (float64, *apiProblem) {
	var state payoutState
	err := a.DB.QueryRow("SELECT final_eco_reward, final_processing_fee, verified_at, is_processed, status FROM pickups WHERE id = ?", pickupID).
		Scan(&state.reward, &state.fee, &state.verifiedAt, &state.processed, &state.status)
	if err == sql.ErrNoRows {
		return 0, &apiProblem{"Data penjemputan tidak ditemukan.", http.StatusNotFound}
	}
	if err != nil {
		return 0, &apiProblem{"Kesalahan database.", http.StatusInternalServerError}
	}
	return state.amount()
}
