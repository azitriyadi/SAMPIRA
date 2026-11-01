# SAMPIRA — Sampah, Informasi, Pelaporan, dan Respons Aksi

**Tagline:** *Laporkan Sampah, Pantau Perubahannya.*

SAMPIRA adalah platform aplikasi web yang dikembangkan untuk mendukung pengelolaan informasi dan layanan persampahan melalui fitur pengajuan penjemputan sampah, pelacakan proses, pengelolaan petugas, serta informasi bagi pengguna dan admin. Pengembangan selanjutnya diarahkan untuk memperluas platform dengan pelaporan permasalahan sampah, pemantauan tindak lanjut, dan visualisasi data pengelolaan sampah.

---

## 1. Tech Stack

Teknologi yang digunakan pada basis kode proyek saat ini adalah:

| Bagian | Teknologi | Kegunaan |
|---|---|---|
| Backend | Go (Golang) 1.24.6 | Menjalankan server HTTP, logika aplikasi, dan endpoint API. |
| API | Go `net/http` (routing native) | Menangani komunikasi request dan response antara frontend dan backend. |
| Database | MySQL / MariaDB | Menyimpan akun, kategori sampah, permintaan penjemputan, riwayat, transaksi, dan pengumuman. |
| Database Driver | `github.com/go-sql-driver/mysql` | Menghubungkan aplikasi Go dengan MySQL/MariaDB. |
| Password Security | `golang.org/x/crypto/bcrypt` | Melakukan hashing password pengguna. |
| Token Authentication | HMAC-SHA256 (implementasi internal proyek) | Menandatangani dan memvalidasi token autentikasi API. |
| Frontend | HTML5, CSS3, JavaScript (Vanilla) | Membangun halaman dan interaksi antarmuka tanpa framework frontend. |
| Charts | Chart.js | Menampilkan grafik pada dashboard. |
| Maps | Leaflet.js | Menampilkan peta pada halaman yang menggunakannya. |
| UI Notifications | SweetAlert2 | Menampilkan dialog konfirmasi, notifikasi, dan pesan interaksi. |

**Catatan:** Chart.js, Leaflet.js, dan SweetAlert2 dimuat melalui CDN dari halaman HTML. Proyek ini tidak menggunakan React, Vue, Laravel, Node.js, atau framework CSS seperti Bootstrap/Tailwind sebagai fondasi utama frontend.

---

## 2. Persyaratan Sistem

Pastikan perangkat pengembangan telah memiliki:

- Go versi **1.24.6** atau kompatibel dengan versi pada `go.mod`.
- MySQL 5.7+ atau MariaDB 10.4+.
- Git untuk mengambil source code (jika proyek di-clone dari repository).
- Browser modern seperti Chrome, Firefox, atau Edge.

Contoh lingkungan lokal yang dapat digunakan adalah XAMPP untuk menjalankan MySQL/MariaDB.

---

## 3. Cara Menjalankan Project

Ikuti langkah berikut dari direktori utama repository SAMPIRA.

### 3.1. Clone Repository

Jika belum memiliki source code, clone repository:

```bash
git clone <URL_REPOSITORY_SAMPIRA>
cd SAMPIRA
```

Jika source code sudah tersedia di komputer, langsung buka terminal pada direktori utama proyek yang berisi `go.mod`.

### 3.2. Jalankan Database

1. Buka XAMPP Control Panel atau layanan database yang digunakan.
2. Jalankan MySQL/MariaDB.
3. Pastikan host dan port database sesuai konfigurasi lokal. Konfigurasi bawaan proyek menggunakan `localhost:3306`.

### 3.3. Konfigurasi Environment

Salin file `.env.example` menjadi `.env`.

Linux/macOS/Git Bash:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Sesuaikan isi `.env` dengan konfigurasi database lokal:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=ecorecycle

# Ganti dengan secret acak yang panjang dan jangan gunakan contoh ini untuk produksi.
JWT_SECRET=ganti_dengan_secret_acak_yang_kuat
```

Keterangan:

- `DB_HOST`: host database. Dapat berisi host dan port, misalnya `127.0.0.1:3306`.
- `DB_USER`: username database.
- `DB_PASS`: password database.
- `DB_NAME`: nama database aplikasi. Nilai bawaan adalah `ecorecycle`.
- `JWT_SECRET`: secret untuk penandatanganan token autentikasi.

### 3.4. Unduh Dependensi Go

Jalankan:

```bash
go mod download
```

### 3.5. Inisialisasi Database (Khusus Instalasi Baru)

Untuk membuat database, tabel, kategori awal, serta akun dan data demo, jalankan:

```bash
go run ./db_init
```

**PERINGATAN PENTING:** `db_init/db_init.go` saat ini menjalankan perintah `DROP DATABASE IF EXISTS ecorecycle` sebelum membuat database kembali. Artinya, proses ini akan menghapus database `ecorecycle` beserta seluruh datanya. Jalankan hanya untuk instalasi baru atau database pengembangan yang memang boleh di-reset. Jangan jalankan pada database yang berisi data penting.

> Catatan konfigurasi: initializer membuat database dengan nama tetap `ecorecycle`. Pastikan nilai `DB_NAME` pada `.env` juga `ecorecycle` agar server terhubung ke database yang benar.

### 3.6. Jalankan Aplikasi

Dari direktori utama proyek, jalankan:

```bash
go run ./cmd/server
```

Jika server berhasil berjalan, buka browser pada:

- Halaman utama: `http://localhost:8080`
- Login: `http://localhost:8080/login`
- Registrasi: `http://localhost:8080/register`
- Dashboard pengguna: `http://localhost:8080/dashboard`
- Dashboard admin: `http://localhost:8080/admin`
- Dashboard petugas: `http://localhost:8080/collector`
- Dokumentasi API Swagger: `http://localhost:8080/swagger`

Port bawaan adalah `8080`. Port dapat diubah dengan menambahkan variabel `PORT` pada `.env`, misalnya `PORT=8081`.

### 3.7. Akun Demo

Setelah database diinisialisasi menggunakan `db_init`, akun demo berikut tersedia:

| Peran | Email | Password |
|---|---|---|
| Admin | `admin@ecorecycle.com` | `password123` |
| Petugas (Collector) | `collector@ecorecycle.com` | `password123` |
| Pengguna (User) | `user@ecorecycle.com` | `password123` |

Akun tersebut hanya untuk pengujian lokal. Ganti atau nonaktifkan kredensial demo sebelum aplikasi digunakan pada lingkungan produksi.

---

## 4. Progress Pengembangan Saat Ini

Bagian ini menjelaskan kondisi implementasi berdasarkan source code repository saat ini. Fitur yang belum memiliki implementasi backend dan database tidak dinyatakan sebagai fitur yang sudah selesai.

### 4.1. Fitur yang Sudah Tersedia pada Basis Kode

- [x] Struktur aplikasi web dengan backend Go dan frontend HTML, CSS, serta JavaScript.
- [x] Registrasi dan login pengguna.
- [x] Autentikasi API menggunakan token bertanda tangan HMAC-SHA256.
- [x] Pengelolaan profil pengguna.
- [x] Pembagian peran pengguna: `admin`, `collector`, dan `user`.
- [x] Pengajuan permintaan penjemputan sampah.
- [x] Pemilihan kategori sampah dan estimasi reward.
- [x] Unggah foto untuk permintaan penjemputan.
- [x] Pengelolaan permintaan penjemputan oleh admin/petugas sesuai hak akses.
- [x] Penugasan collector pada permintaan penjemputan.
- [x] Pembaruan status dan pencatatan riwayat penjemputan.
- [x] Verifikasi berat akhir dan perhitungan reward.
- [x] Pencatatan proses payout/reward.
- [x] Dashboard dengan komponen grafik dan peta.
- [x] Pengelolaan pengumuman portal.
- [x] Dokumentasi endpoint API melalui Swagger/OpenAPI.

### 4.2. Pengembangan Lanjutan SAMPIRA

Fokus pengembangan berikutnya adalah mengarahkan fondasi aplikasi yang sudah tersedia menjadi platform pelaporan dan pemantauan permasalahan sampah. Pekerjaan lanjutan yang direncanakan meliputi:

- [ ] Modul laporan permasalahan sampah oleh masyarakat, terpisah dari permintaan penjemputan.
- [ ] Proses verifikasi laporan oleh admin, termasuk permintaan revisi atau penolakan dengan alasan.
- [ ] Penugasan laporan kepada petugas untuk ditindaklanjuti.
- [ ] Pembaruan status penanganan dan riwayat khusus laporan permasalahan.
- [ ] Dashboard ringkasan laporan berdasarkan status, kategori, dan wilayah sesuai data yang tersedia.
- [ ] Integrasi dataset persampahan dari sumber resmi, disertai validasi periode, satuan, dan cakupan wilayah.
- [ ] Visualisasi tren dan informasi dataset pada dashboard analitik.
- [ ] Penyempurnaan peta agar lokasi yang ditampilkan bersumber dari data yang valid.

### 4.3. Catatan Status dan Batasan

- Permintaan penjemputan sampah (`pickups`) merupakan alur layanan pengumpulan sampah, bukan modul pelaporan permasalahan sampah.
- Riwayat penjemputan (`pickup_history`) mencatat perubahan status penjemputan dan bukan riwayat status laporan permasalahan.
- Grafik yang sudah ada pada dashboard merupakan bagian dari fitur aplikasi saat ini; integrasi analisis dataset persampahan resmi masih menjadi pekerjaan pengembangan lanjutan.
- Informasi lokasi pada peta perlu diverifikasi sebelum digunakan sebagai representasi lokasi layanan atau laporan yang sebenarnya.
- Checklist di atas perlu diperbarui kembali setiap kali fitur selesai diimplementasikan dan diuji.

---

## 5. Struktur Direktori

```text
SAMPIRA/
├── app/
│   └── Views/                 # Halaman HTML aplikasi
├── assets/
│   ├── css/                   # Stylesheet frontend
│   ├── js/                    # JavaScript frontend
│   └── img/                   # Gambar dan aset visual
├── cmd/
│   └── server/
│       └── main.go            # Entry point server Go dan routing
├── db_init/
│   ├── db_init.go             # Inisialisasi database dan data demo
│   └── add_waste_categories.sql
├── docs/
│   ├── openapi.json           # Spesifikasi API
│   └── swagger.html           # UI dokumentasi API
├── internal/
│   ├── handlers/              # Handler HTTP/API
│   ├── middleware/            # Middleware HTTP dan autentikasi
│   ├── models/                # Model data
│   ├── repositories/          # Akses database
│   └── services/              # Logika layanan aplikasi
├── scripts/                   # Skrip pemeriksaan dan pengujian
├── .env.example               # Contoh konfigurasi environment
├── go.mod                     # Modul dan dependensi Go
├── go.sum                     # Checksum dependensi
└── README.md                  # Dokumentasi proyek
```

---

## 6. Keamanan dan Penggunaan

- Jangan mengunggah file `.env` atau kredensial database ke repository publik.
- Gunakan `JWT_SECRET` yang kuat dan berbeda dari nilai contoh.
- Gunakan akun demo hanya untuk pengujian lokal.
- Jangan menjalankan initializer database pada database yang menyimpan data penting karena initializer melakukan reset database.
- Validasi kembali data lokasi dan data statistik sebelum dipublikasikan.

---

## 7. Status Dokumen

README ini mendokumentasikan teknologi, cara menjalankan aplikasi, serta progress berdasarkan source code yang tersedia pada repository. Informasi progress harus disesuaikan secara berkala dengan implementasi dan hasil pengujian terbaru.
