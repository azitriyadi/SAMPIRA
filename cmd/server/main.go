package main

import (
	"bufio"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"ecorecycle/internal/repositories"
	"ecorecycle/internal/server"
)

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

func main() {
	loadEnv()

	// Bootstrap Administrator
	if len(os.Args) > 1 {
		if os.Args[1] != "-bootstrap-administrator" || len(os.Args) != 4 {
			log.Fatal("penggunaan: server [-bootstrap-administrator NAMA EMAIL]")
		}

		db, err := server.InitDB()
		if err != nil {
			log.Fatal(err)
		}
		defer db.Close()

		if err := bootstrapAdministrator(
			repositories.NewUserRepository(db),
			os.Args[2:],
			os.Stdin,
		); err != nil {
			log.Fatal(err)
		}

		log.Println("Akun Administrator dibuat.")
		return
	}

	// Membuat HTTP handler aplikasi SAMPIRA
	handler, db, err := server.NewHandlerWithMigrations(false)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Menjalankan server lokal
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	host := os.Getenv("SAMPIRA_LISTEN_HOST")

	fmt.Printf("Server SAMPIRA berjalan di http://localhost:%s\n", port)

	if err := http.ListenAndServe(host+":"+port, handler); err != nil {
		log.Fatalf("Gagal menjalankan server: %v", err)
	}
}
