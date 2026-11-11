package server

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"time"

	ecorecycle "ecorecycle"
	"ecorecycle/db_init/migrations"
	"ecorecycle/internal/handlers"
	"ecorecycle/internal/models"
	"ecorecycle/internal/services"

	mysql "github.com/go-sql-driver/mysql"
)

// InitDB membuat koneksi ke database MySQL atau TiDB Cloud.
func InitDB() (*sql.DB, error) {
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}

	user := os.Getenv("DB_USER")
	if user == "" {
		user = "root"
	}

	pass := os.Getenv("DB_PASS")
	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "ecorecycle"
	}

	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "3306"
	}

	addr := host
	if _, _, err := net.SplitHostPort(host); err != nil {
		addr = net.JoinHostPort(host, port)
	}

	config := mysql.Config{
		User:                 user,
		Passwd:               pass,
		Net:                  "tcp",
		Addr:                 addr,
		DBName:               dbName,
		ParseTime:            true,
		AllowNativePasswords: true,
	}

	if os.Getenv("DB_TLS") == "true" {
		config.TLSConfig = "true"
	}

	db, err := sql.Open("mysql", config.FormatDSN())
	if err != nil {
		return nil, fmt.Errorf("gagal membuka database: %w", err)
	}

	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("gagal terhubung ke database: %w", err)
	}

	return db, nil
}

// prepareApplicationSchemas menyiapkan skema aplikasi.
func prepareApplicationSchemas(app *handlers.App, db *sql.DB) error {
	if err := app.Users.EnsureProfileSchema(); err != nil {
		return fmt.Errorf("gagal menyiapkan kolom profil payout: %w", err)
	}

	if err := app.Users.EnsureSessionSchema(); err != nil {
		return fmt.Errorf("gagal menyiapkan sesi: %w", err)
	}

	if err := app.Pickups.EnsureVerificationSchema(); err != nil {
		return fmt.Errorf("gagal menyiapkan kolom verifikasi penjemputan: %w", err)
	}

	if err := app.Pickups.EnsureWorkflowSchema(); err != nil {
		return fmt.Errorf("gagal menyiapkan skema pickup Phase 2: %w", err)
	}

	if err := app.Announcements.EnsureSchema(); err != nil {
		return fmt.Errorf("gagal menyiapkan tabel CMS portal: %w", err)
	}

	ctx := context.Background()

	if err := migrations.ApplyFacilityReports(ctx, db); err != nil {
		return fmt.Errorf("gagal menyiapkan skema laporan fasilitas: %w", err)
	}

	if err := migrations.ApplyFacilityHandling(ctx, db); err != nil {
		return fmt.Errorf("gagal menyiapkan skema penanganan fasilitas: %w", err)
	}

	if err := migrations.ApplyPreciseLocations(ctx, db); err != nil {
		return fmt.Errorf("gagal menyiapkan skema lokasi penjemputan: %w", err)
	}

	if err := migrations.ApplyEducationContent(ctx, db); err != nil {
		return fmt.Errorf("gagal menyiapkan skema Pusat Edukasi: %w", err)
	}

	if err := migrations.ApplyPickupIdempotency(ctx, db); err != nil {
		return fmt.Errorf("gagal menyiapkan idempotency penjemputan: %w", err)
	}

	if err := migrations.ApplyRegistrationUnicode(ctx, db); err != nil {
		return fmt.Errorf("gagal menyiapkan teks registrasi Unicode: %w", err)
	}

	if err := migrations.ApplyContributions(ctx, db); err != nil {
		return fmt.Errorf("gagal menyiapkan skema kontribusi Phase 9: %w", err)
	}

	return nil
}

// NewHandler membuat aplikasi dan menjalankan migrasi database.
func NewHandler() (http.Handler, *sql.DB, error) {
	return NewHandlerWithMigrations(true)
}

// NewHandlerWithMigrations membuat aplikasi dan routing HTTP SAMPIRA.
func NewHandlerWithMigrations(runMigrations bool) (http.Handler, *sql.DB, error) {
	authService, err := services.NewAuthService(os.Getenv("JWT_SECRET"))
	if err != nil {
		return nil, nil, fmt.Errorf("gagal membuat auth service: %w", err)
	}

	db, err := InitDB()
	if err != nil {
		return nil, nil, err
	}

	app := handlers.NewApp(db, authService)
	app.SecureCookies = os.Getenv("SAMPIRA_SECURE_COOKIE") == "true"

	if runMigrations {
		if err := prepareApplicationSchemas(app, db); err != nil {
			db.Close()
			return nil, nil, err
		}
	}

	// Mengambil folder assets dari embedded filesystem.
	assetsFS, err := fs.Sub(ecorecycle.WebFiles, "assets")
	if err != nil {
		db.Close()
		return nil, nil, fmt.Errorf("gagal membaca embedded assets: %w", err)
	}

	mux := http.NewServeMux()

	app.RegisterContributions(mux)

	// Halaman utama.
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFileFS(w, r, ecorecycle.WebFiles, "app/Views/index.html")
			return
		}

		http.NotFound(w, r)
	})

	mux.HandleFunc("GET /home", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, ecorecycle.WebFiles, "app/Views/index.html")
	})

	mux.HandleFunc("GET /favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/assets/img/waste-organic.svg", http.StatusTemporaryRedirect)
	})

	// Halaman autentikasi.
	mux.HandleFunc("GET /login", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, ecorecycle.WebFiles, "app/Views/login.html")
	})

	mux.HandleFunc("GET /register", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, ecorecycle.WebFiles, "app/Views/register.html")
	})

	// Halaman berdasarkan role pengguna.
	mux.HandleFunc("GET /dashboard", app.Portal(models.RoleUser, "app/Views/dashboard.html"))
	mux.HandleFunc("GET /profile", app.Portal(models.RoleUser, "app/Views/profile.html"))
	mux.HandleFunc("GET /admin", app.Portal(models.RoleAdmin, "app/Views/admin.html"))
	mux.HandleFunc("GET /administrator", app.Portal(models.RoleAdministrator, "app/Views/administrator.html"))
	mux.HandleFunc("GET /petugas", app.Portal(models.RolePetugas, "app/Views/collector.html"))

	mux.HandleFunc("GET /collector", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/petugas", http.StatusTemporaryRedirect)
	})

	mux.HandleFunc("POST /logout", app.LogoutHandler)

	// Dokumentasi Swagger.
	mux.HandleFunc("GET /swagger", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, ecorecycle.WebFiles, "docs/swagger.html")
	})

	mux.HandleFunc("GET /swagger/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/swagger", http.StatusMovedPermanently)
	})

	mux.HandleFunc("GET /swagger/openapi.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=UTF-8")
		http.ServeFileFS(w, r, ecorecycle.WebFiles, "docs/openapi.json")
	})

	// File CSS, JavaScript, gambar, dan vendor.
	mux.Handle(
		"GET /assets/",
		http.StripPrefix(
			"/assets/",
			http.FileServer(http.FS(assetsFS)),
		),
	)

	// Foto hasil upload disimpan di filesystem runtime.
	mux.HandleFunc("GET /uploads/{name}", app.PickupPhotoHandler)

	// API autentikasi.
	mux.HandleFunc("POST /api/auth/login", app.LoginHandler)
	mux.HandleFunc("POST /api/auth/register", app.RegisterHandler)

	// API pengguna.
	mux.HandleFunc("GET /api/user/profile", app.ProfileGetHandler)
	mux.HandleFunc("POST /api/user/profile", app.ProfileUpdateHandler)
	mux.HandleFunc("GET /api/users/collectors", app.ListCollectorsHandler)
	mux.HandleFunc("GET /api/users/petugas", app.ListCollectorsHandler)
	mux.HandleFunc("GET /api/administrator/session", app.AdministratorSessionHandler)

	// API penjemputan.
	mux.HandleFunc("POST /api/ecorecycle/request_pickup", app.RequestPickupHandler)
	mux.HandleFunc("POST /api/ecorecycle/update_pickup", app.UpdatePickupHandler)
	mux.HandleFunc("POST /api/ecorecycle/cancel_pickup", app.CancelPickupHandler)
	mux.HandleFunc("GET /api/ecorecycle/pickup_status", app.PickupStatusGetHandler)
	mux.HandleFunc("POST /api/ecorecycle/pickup_status", app.PickupStatusPostHandler)
	mux.HandleFunc("POST /api/ecorecycle/assign_collector", app.AssignCollectorHandler)
	mux.HandleFunc("POST /api/ecorecycle/estimate_reward", app.EstimateRewardHandler)
	mux.HandleFunc("POST /api/ecorecycle/verify_pickup", app.VerifyPickupHandler)
	mux.HandleFunc("POST /api/ecorecycle/process_payout", app.ProcessPayoutHandler)
	mux.HandleFunc("GET /api/administrator/pickup-rewards", app.PendingRewardsHandler)
	mux.HandleFunc("GET /api/administrator/pickup-rewards/{id}/proof", app.RewardProofHandler)
	mux.HandleFunc("GET /api/ecorecycle/list_pickups", app.ListPickupsHandler)

	// API pengumuman.
	mux.HandleFunc("GET /api/ecorecycle/announcements", app.ListAnnouncementsHandler)
	mux.HandleFunc("POST /api/ecorecycle/announcements", app.ManageAnnouncementsHandler)
	mux.HandleFunc("DELETE /api/ecorecycle/announcements", app.DeleteAnnouncementHandler)

	// Modul tambahan.
	app.RegisterFacilityReports(mux)
	app.RegisterFacilityHandling(mux)
	app.RegisterEducation(mux)

	// Middleware utama.
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

		if app.AllowBrowserWrite(w, r) {
			mux.ServeHTTP(w, r)
		}
	})

	return handler, db, nil
}
