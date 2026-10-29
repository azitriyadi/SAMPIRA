package main

import (
	"bufio"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

// Loader file .env sederhana
func loadEnv() {
	file, err := os.Open(".env")
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			value = strings.Trim(value, "\"'")
			if os.Getenv(key) == "" {
				os.Setenv(key, value)
			}
		}
	}
}

const insertWasteCategorySQL = "INSERT INTO waste_categories (category_name, description, reward_per_kg, processing_fee_per_kg) VALUES (?, ?, ?, ?)"

func main() {
	loadEnv()

	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}
	user := os.Getenv("DB_USER")
	if user == "" {
		user = "root"
	}
	pass := os.Getenv("DB_PASS")

	if !strings.Contains(host, ":") {
		host = host + ":3306"
	}

	var dsn string
	if pass == "" {
		dsn = fmt.Sprintf("%s@tcp(%s)/", user, host)
	} else {
		dsn = fmt.Sprintf("%s:%s@tcp(%s)/", user, pass, host)
	}

	fmt.Printf("Menghubungkan ke MySQL di %s...\n", host)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Gagal inisialisasi driver DB: %v", err)
	}
	defer db.Close()

	err = db.Ping()
	if err != nil {
		log.Fatalf("Koneksi gagal: %v\nPastikan MySQL/MariaDB server Anda sudah aktif.", err)
	}

	// 1. Buat Ulang Database
	_, err = db.Exec("DROP DATABASE IF EXISTS ecorecycle")
	if err != nil {
		log.Fatalf("Gagal menghapus database lama: %v", err)
	}

	_, err = db.Exec("CREATE DATABASE ecorecycle")
	if err != nil {
		log.Fatalf("Gagal membuat database ecorecycle: %v", err)
	}
	fmt.Println("Database 'ecorecycle' berhasil dibuat.")

	_, err = db.Exec("USE ecorecycle")
	if err != nil {
		log.Fatalf("Gagal beralih ke database ecorecycle: %v", err)
	}

	// 2. Buat Tabel 'users'
	sqlUsers := `CREATE TABLE IF NOT EXISTS users (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		name VARCHAR(100) NOT NULL,
		email VARCHAR(100) NOT NULL UNIQUE,
		password VARCHAR(255) NOT NULL,
		role ENUM('admin', 'collector', 'user') DEFAULT 'user',
		phone VARCHAR(30) DEFAULT NULL,
		address TEXT DEFAULT NULL,
		payout_method VARCHAR(30) DEFAULT NULL,
		payout_account_name VARCHAR(120) DEFAULT NULL,
		payout_account_number VARCHAR(80) DEFAULT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`
	_, err = db.Exec(sqlUsers)
	if err != nil {
		log.Fatalf("Gagal membuat tabel users: %v", err)
	}
	fmt.Println("Tabel 'users' berhasil dibuat.")

	// 3. Buat Tabel 'waste_categories'
	sqlCategories := `CREATE TABLE IF NOT EXISTS waste_categories (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		category_name VARCHAR(50) NOT NULL,
		description VARCHAR(255),
		reward_per_kg DECIMAL(10,2) NOT NULL,
		processing_fee_per_kg DECIMAL(10,2) NOT NULL
	)`
	_, err = db.Exec(sqlCategories)
	if err != nil {
		log.Fatalf("Gagal membuat tabel waste_categories: %v", err)
	}
	fmt.Println("Tabel 'waste_categories' berhasil dibuat.")

	// 4. Buat Tabel 'pickups'
	sqlPickups := `CREATE TABLE IF NOT EXISTS pickups (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		user_id INT(11) NOT NULL,
		collector_id INT(11) DEFAULT NULL,
		tracking_number VARCHAR(50) UNIQUE NOT NULL,
		item_description TEXT,
		pickup_address TEXT,
		contact_phone VARCHAR(20),
		weight_kg DECIMAL(10,2),
		category_id INT(11),
		eco_reward DECIMAL(15,2),
		processing_fee DECIMAL(15,2),
		final_weight_kg DECIMAL(10,2) DEFAULT NULL,
		final_eco_reward DECIMAL(15,2) DEFAULT NULL,
		final_processing_fee DECIMAL(15,2) DEFAULT NULL,
		verification_notes TEXT DEFAULT NULL,
		verified_at TIMESTAMP NULL DEFAULT NULL,
		photo_url VARCHAR(255) DEFAULT NULL,
		is_processed BOOLEAN DEFAULT FALSE,
		status VARCHAR(50) DEFAULT 'pending',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (collector_id) REFERENCES users(id) ON DELETE SET NULL,
		FOREIGN KEY (category_id) REFERENCES waste_categories(id)
	)`
	_, err = db.Exec(sqlPickups)
	if err != nil {
		log.Fatalf("Gagal membuat tabel pickups: %v", err)
	}
	fmt.Println("Tabel 'pickups' berhasil dibuat.")

	// 5. Buat Tabel 'pickup_history'
	sqlHistory := `CREATE TABLE IF NOT EXISTS pickup_history (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		pickup_id INT(11) NOT NULL,
		status VARCHAR(50) NOT NULL,
		location VARCHAR(100),
		notes TEXT,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (pickup_id) REFERENCES pickups(id) ON DELETE CASCADE
	)`
	_, err = db.Exec(sqlHistory)
	if err != nil {
		log.Fatalf("Gagal membuat tabel pickup_history: %v", err)
	}
	fmt.Println("Tabel 'pickup_history' berhasil dibuat.")

	// 6. Buat Tabel 'transactions'
	sqlTransactions := `CREATE TABLE IF NOT EXISTS transactions (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		pickup_id INT(11) NOT NULL,
		transaction_ref VARCHAR(100) NOT NULL,
		amount DECIMAL(15,2) NOT NULL,
		transaction_type VARCHAR(50),
		status VARCHAR(50) DEFAULT 'success',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (pickup_id) REFERENCES pickups(id) ON DELETE CASCADE
	)`
	_, err = db.Exec(sqlTransactions)
	if err != nil {
		log.Fatalf("Gagal membuat tabel transactions: %v", err)
	}
	fmt.Println("Tabel 'transactions' berhasil dibuat.")

	// CMS pengumuman internal untuk portal berbasis peran.
	sqlAnnouncements := `CREATE TABLE IF NOT EXISTS portal_announcements (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(120) NOT NULL,
		message TEXT NOT NULL,
		target_role ENUM('all', 'user', 'collector') NOT NULL DEFAULT 'all',
		is_active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT(11) DEFAULT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
	)`
	_, err = db.Exec(sqlAnnouncements)
	if err != nil {
		log.Fatalf("Gagal membuat tabel portal_announcements: %v", err)
	}
	fmt.Println("Tabel 'portal_announcements' berhasil dibuat.")

	// 7. Seeding Akun Demo
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Gagal hash password seeder: %v", err)
	}

	_, err = db.Exec("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", "Eco Manager", "admin@ecorecycle.com", string(hashedPassword), "admin")
	if err != nil {
		log.Fatalf("Gagal seeding admin: %v", err)
	}
	_, err = db.Exec("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", "Eco Collector", "collector@ecorecycle.com", string(hashedPassword), "collector")
	if err != nil {
		log.Fatalf("Gagal seeding collector: %v", err)
	}
	_, err = db.Exec(`INSERT INTO users (name, email, password, role, phone, address, payout_method, payout_account_name, payout_account_number)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, "Eco Warrior", "user@ecorecycle.com", string(hashedPassword), "user", "08123456789", "Jl. Asia Afrika No. 1, Bandung", "ewallet", "Eco Warrior", "08123456789")
	if err != nil {
		log.Fatalf("Gagal seeding user: %v", err)
	}

	_, err = db.Exec(`INSERT INTO portal_announcements (title, message, target_role, created_by)
		VALUES (?, ?, ?, ?)`, "Layanan penjemputan Bandung aktif", "Pastikan alamat dan nomor WhatsApp dapat dihubungi agar proses penjemputan berjalan lancar.", "all", 1)
	if err != nil {
		log.Fatalf("Gagal seeding pengumuman portal: %v", err)
	}

	// 8. Seeding Kategori Sampah
	_, err = db.Exec(insertWasteCategorySQL, "Small Gadgets", "Smartphone, Tablet, Smartwatch, Kamera Digital", 5000.0, 500.0)
	if err != nil {
		log.Fatalf("Gagal seeding category Small Gadgets: %v", err)
	}
	_, err = db.Exec(insertWasteCategorySQL, "Computers", "Laptop, Motherboard, RAM, CPU", 7000.0, 1000.0)
	if err != nil {
		log.Fatalf("Gagal seeding category Computers: %v", err)
	}
	_, err = db.Exec(insertWasteCategorySQL, "Large Appliances", "Televisi, Kulkas, Pendingin Ruangan (AC), Mesin Cuci", 10000.0, 5000.0)
	if err != nil {
		log.Fatalf("Gagal seeding category Large Appliances: %v", err)
	}
	_, err = db.Exec(insertWasteCategorySQL, "Batteries", "Baterai Lithium-Ion, Lead-Acid, UPS Battery", 3000.0, 2000.0)
	if err != nil {
		log.Fatalf("Gagal seeding category Batteries: %v", err)
	}

	// General waste categories. Existing databases use add_waste_categories.sql instead.
	for _, category := range []struct {
		name, description string
		rate              float64
	}{
		{"Organik", "Sisa makanan, kulit buah, sayur, dan daun terpilah; tanpa reward", 0},
		{"Plastik PET", "Anorganik: botol PET bening bersih dan terpilah", 3000},
		{"Kertas dan Kardus", "Anorganik: kertas dan kardus bersih serta kering", 1000},
		{"Besi", "Anorganik: besi bekas terpilah", 2500},
		{"Kaca", "Anorganik: botol kaca dan beling terpilah", 150},
		{"B3 Rumah Tangga", "Lampu dan kemasan bekas B3 rumah tangga; bukan limbah medis atau industri; tanpa reward awal", 0},
	} {
		if _, err := db.Exec(insertWasteCategorySQL, category.name, category.description, category.rate, 0); err != nil {
			log.Fatalf("Gagal seeding kategori %s: %v", category.name, err)
		}
	}

	// 9. Seeding Data Transaksi & Riwayat
	// Tugas 1: Pending di Lembang
	_, err = db.Exec(`INSERT INTO pickups (id, user_id, collector_id, tracking_number, item_description, pickup_address, contact_phone, weight_kg, category_id, eco_reward, processing_fee, is_processed, status, created_at) 
		VALUES (1, 3, NULL, 'ECR-20260529-01', '1 buah Laptop Asus mati total, 1 monitor LCD kedip', 'Desa Lembang, Kec. Lembang, Kabupaten Bandung Barat', '08122455667', 8.5, 2, 59500, 8500, FALSE, 'pending', '2026-05-28 10:15:00')`)
	if err != nil {
		log.Fatalf("Gagal seeding pickup 1: %v", err)
	}
	_, err = db.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (1, 'pending', 'Lokasi Masyarakat (User)', 'Permohonan penjemputan baru diajukan.')")
	if err != nil {
		log.Fatalf("Gagal seeding history pickup 1: %v", err)
	}

	// Tugas 2: Transit di Bojongsoang
	_, err = db.Exec(`INSERT INTO pickups (id, user_id, collector_id, tracking_number, item_description, pickup_address, contact_phone, weight_kg, category_id, eco_reward, processing_fee, is_processed, status, created_at) 
		VALUES (2, 3, 2, 'ECR-20260529-02', '3 buah HP layar retak, 1 tablet mati', 'Desa Bojongsoang, Kec. Bojongsoang, Kabupaten Bandung', '08778899001', 4.2, 1, 21000, 2100, FALSE, 'transit', '2026-05-28 14:30:00')`)
	if err != nil {
		log.Fatalf("Gagal seeding pickup 2: %v", err)
	}
	_, err = db.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (2, 'pending', 'Lokasi Masyarakat (User)', 'Permohonan penjemputan baru diajukan.')")
	if err != nil {
		log.Fatalf("Gagal seeding history 2.1: %v", err)
	}
	_, err = db.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (2, 'pickup', 'Kolektor Wilayah', 'Penjemputan diambil alih oleh Kolektor: Eco Collector')")
	if err != nil {
		log.Fatalf("Gagal seeding history 2.2: %v", err)
	}
	_, err = db.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (2, 'transit', 'Di Perjalanan', 'Limbah telah diangkut oleh kolektor menuju Recycling Hub.')")
	if err != nil {
		log.Fatalf("Gagal seeding history 2.3: %v", err)
	}

	// Tugas 3: Completed di Cibeunying Kidul
	_, err = db.Exec(`INSERT INTO pickups (id, user_id, collector_id, tracking_number, item_description, pickup_address, contact_phone, weight_kg, category_id, eco_reward, processing_fee, final_weight_kg, final_eco_reward, final_processing_fee, verification_notes, verified_at, is_processed, status, created_at) 
		VALUES (3, 3, 2, 'ECR-20260529-03', '1 buah TV LED Samsung 32 inch layar bergaris', 'Kelurahan Cikutra, Kec. Cibeunying Kidul, Kota Bandung', '08133445566', 15.0, 3, 150000, 75000, 15.0, 150000, 75000, 'Berat final sesuai estimasi awal dan sudah diverifikasi hub.', '2026-05-27 11:15:00', TRUE, 'completed', '2026-05-27 09:00:00')`)
	if err != nil {
		log.Fatalf("Gagal seeding pickup 3: %v", err)
	}
	_, err = db.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (3, 'pending', 'Lokasi Masyarakat (User)', 'Permohonan penjemputan baru diajukan.')")
	if err != nil {
		log.Fatalf("Gagal seeding history 3.1: %v", err)
	}
	_, err = db.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (3, 'pickup', 'Kolektor Wilayah', 'Penjemputan diambil alih oleh Kolektor: Eco Collector')")
	if err != nil {
		log.Fatalf("Gagal seeding history 3.2: %v", err)
	}
	_, err = db.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (3, 'transit', 'Di Perjalanan', 'Limbah telah diangkut oleh kolektor menuju Recycling Hub.')")
	if err != nil {
		log.Fatalf("Gagal seeding history 3.3: %v", err)
	}
	_, err = db.Exec("INSERT INTO pickup_history (pickup_id, status, location, notes) VALUES (3, 'completed', 'Pusat Daur Ulang', 'E-Waste berhasil diproses dan reward ditransfer.')")
	if err != nil {
		log.Fatalf("Gagal seeding history 3.4: %v", err)
	}
	_, err = db.Exec("INSERT INTO transactions (pickup_id, transaction_ref, amount, transaction_type, status) VALUES (3, 'TX-1716940800-4752', 75000, 'reward_payout', 'success')")
	if err != nil {
		log.Fatalf("Gagal seeding transaction 3: %v", err)
	}

	fmt.Println("\nInstalasi dan pengisian awal basis data EcoRecycle berhasil diselesaikan!")
	fmt.Println("Akun Demo:")
	fmt.Println("- Admin: admin@ecorecycle.com (password123)")
	fmt.Println("- Collector: collector@ecorecycle.com (password123)")
	fmt.Println("- User: user@ecorecycle.com (password123)")
}
