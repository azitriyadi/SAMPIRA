package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func savePickupPhoto(r *http.Request) (*string, *apiProblem) {
	file, header, err := r.FormFile("photo")
	if err != nil {
		return nil, nil
	}
	defer file.Close()
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !validPhotoExtension(ext) {
		return nil, &apiProblem{"Ekstensi file foto tidak diizinkan (Hanya JPG, JPEG, PNG, WEBP).", http.StatusBadRequest}
	}
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return nil, &apiProblem{"Gagal menyiapkan nama berkas foto.", http.StatusInternalServerError}
	}
	name := hex.EncodeToString(bytes) + ext
	if err := storePickupPhoto(file, name); err != nil {
		return nil, &apiProblem{"Gagal menyimpan berkas foto.", http.StatusInternalServerError}
	}
	url := "uploads/" + name
	return &url, nil
}

func validPhotoExtension(ext string) bool {
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
		return true
	default:
		return false
	}
}

func storePickupPhoto(file io.Reader, name string) error {
	if err := os.MkdirAll("./uploads", 0755); err != nil {
		return err
	}
	out, err := os.Create(filepath.Join("./uploads", name))
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, file)
	return err
}
