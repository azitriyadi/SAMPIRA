package handlers

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ecorecycle/internal/models"
)

func TestPickupTransitions(t *testing.T) {
	statuses := []string{"pending", "pickup", "transit", "arrived", "completed", "cancelled", "unknown"}
	for _, current := range statuses {
		for _, next := range statuses {
			want := current == "pickup" && next == "transit" || current == "transit" && next == "arrived"
			if got := validPickupTransition(current, next); got != want {
				t.Errorf("transition %s -> %s: got %v, want %v", current, next, got, want)
			}
		}
	}
}

func TestPickupOwnership(t *testing.T) {
	for _, tc := range []struct {
		role     string
		assigned sql.NullInt64
		want     bool
	}{
		{"admin", sql.NullInt64{}, true},
		{"collector", sql.NullInt64{Int64: 7, Valid: true}, true},
		{"collector", sql.NullInt64{Int64: 8, Valid: true}, false},
		{"collector", sql.NullInt64{}, false},
	} {
		if got := ownsPickupStatus(&models.TokenPayload{ID: 7, Role: tc.role}, tc.assigned); got != tc.want {
			t.Errorf("ownership role=%s assigned=%v: %v", tc.role, tc.assigned, got)
		}
	}
}

func TestPayoutEligibility(t *testing.T) {
	valid := payoutState{reward: sql.NullFloat64{Float64: 7000, Valid: true}, fee: sql.NullFloat64{Float64: 1000, Valid: true}, verifiedAt: sql.NullTime{Time: time.Now(), Valid: true}, status: "arrived"}
	for _, tc := range []struct {
		name    string
		change  func(*payoutState)
		want    float64
		blocked bool
	}{
		{"verified net reward", func(*payoutState) {}, 6000, false},
		{"duplicate payout", func(s *payoutState) { s.processed = true }, 0, true},
		{"not arrived", func(s *payoutState) { s.status = "transit" }, 0, true},
		{"unverified", func(s *payoutState) { s.verifiedAt.Valid = false }, 0, true},
		{"missing reward", func(s *payoutState) { s.reward.Valid = false }, 0, true},
		{"missing fee", func(s *payoutState) { s.fee.Valid = false }, 0, true},
		{"zero fee", func(s *payoutState) { s.fee.Float64 = 0 }, 7000, false},
		{"zero tariff category", func(s *payoutState) { s.reward.Float64 = 0; s.fee.Float64 = 0 }, 0, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			state := valid
			tc.change(&state)
			got, problem := state.amount()
			if got != tc.want || (problem != nil) != tc.blocked {
				t.Fatalf("amount=%v problem=%v", got, problem)
			}
			if problem != nil && problem.status != http.StatusBadRequest {
				t.Fatal(problem.status)
			}
		})
	}
}

func TestPhotoExtensions(t *testing.T) {
	for _, ext := range []string{".jpg", ".jpeg", ".png", ".webp"} {
		if !validPhotoExtension(ext) {
			t.Errorf("rejected %s", ext)
		}
	}
	for _, ext := range []string{"", ".exe", ".svg", ".php", ".jpg.exe"} {
		if validPhotoExtension(ext) {
			t.Errorf("accepted %s", ext)
		}
	}
}

func TestPickupMethodGuards(t *testing.T) {
	app := &App{}
	for _, handler := range []http.HandlerFunc{app.RequestPickupHandler, app.AssignCollectorHandler, app.ProcessPayoutHandler, app.PickupStatusPostHandler} {
		w := httptest.NewRecorder()
		handler(w, httptest.NewRequest(http.MethodGet, "/", nil))
		if w.Code != http.StatusMethodNotAllowed {
			t.Fatalf("got %d", w.Code)
		}
	}
}
