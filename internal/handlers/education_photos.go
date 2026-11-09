package handlers

import (
	"bytes"
	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
	"ecorecycle/internal/repositories"
	"errors"
	"image"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const educationPhotoMax = 750 << 10

func validEducationPhotoURL(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && educationText(raw, 1, 2048, false) && !strings.ContainsAny(raw, " \\") && parsed.Scheme == "https" && parsed.Hostname() != "" && parsed.User == nil
}

func (a *App) educationPhotoConfig(w http.ResponseWriter, r *http.Request) {
	if a.educationAdmin(w, r) == nil {
		return
	}
	httpx.SendResponse(w, "success", "Konfigurasi foto artikel.", map[string]any{"max_photos": 2, "max_upload_bytes": educationPhotoMax}, http.StatusOK)
}

func (a *App) educationSavePhotos(w http.ResponseWriter, r *http.Request) {
	actor := a.educationAdmin(w, r)
	if actor == nil {
		return
	}
	id := educationID(w, r)
	if id == 0 {
		return
	}
	if r.URL.RawQuery != "" {
		(&apiProblem{"Kirim field foto melalui body.", 400}).write(w)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			(&apiProblem{"Ukuran kiriman foto melebihi batas 2 MB.", http.StatusRequestEntityTooLarge}).write(w)
		} else {
			(&apiProblem{"Kirim foto melalui multipart/form-data.", http.StatusBadRequest}).write(w)
		}
		return
	}
	defer r.MultipartForm.RemoveAll()
	for name := range r.MultipartForm.File {
		if name != "photo_0_file" && name != "photo_1_file" {
			(&apiProblem{"Maksimal dua foto artikel.", 400}).write(w)
			return
		}
	}
	version, err := strconv.Atoi(r.FormValue("version"))
	if err != nil || version < 1 || version >= educationMaxVersion {
		(&apiProblem{"Versi artikel tidak valid.", 400}).write(w)
		return
	}
	uploads := make([]repositories.EducationPhotoUpload, 2)
	for i := range uploads {
		key := "photo_" + strconv.Itoa(i) + "_"
		upload := &uploads[i]
		upload.URL = strings.TrimSpace(r.FormValue(key + "url"))
		upload.Alt = strings.TrimSpace(r.FormValue(key + "alt"))
		upload.Credit = strings.TrimSpace(r.FormValue(key + "credit"))
		upload.Keep = r.FormValue(key+"keep") == "true"
		if value := r.FormValue(key + "keep"); value != "" && value != "true" && value != "false" {
			(&apiProblem{"Penanda foto tersimpan tidak valid.", 400}).write(w)
			return
		}
		data, _, mime, problem := readPickupImage(r, key+"file")
		if problem != nil {
			problem.write(w)
			return
		}
		upload.Data = data
		upload.MIME = mime
		if len(r.MultipartForm.File[key+"file"]) > 1 {
			(&apiProblem{"Pilih satu file per foto.", 400}).write(w)
			return
		}
		modes := 0
		if upload.URL != "" {
			modes++
		}
		if len(data) > 0 {
			modes++
		}
		if upload.Keep {
			modes++
		}
		if modes > 1 {
			(&apiProblem{"Pilih tautan atau upload, bukan keduanya untuk foto yang sama.", 400}).write(w)
			return
		}
		if modes == 0 {
			continue
		}
		if !educationText(upload.Alt, 3, 240, false) || !educationText(upload.Credit, 0, 160, false) {
			(&apiProblem{"Deskripsi foto wajib 3–240 karakter, kredit maksimal 160 karakter tanpa markup.", 400}).write(w)
			return
		}
		if upload.URL != "" && !validEducationPhotoURL(upload.URL) {
			(&apiProblem{"Tautan foto harus HTTPS yang valid tanpa kredensial.", 400}).write(w)
			return
		}
		if len(data) > educationPhotoMax {
			(&apiProblem{"Foto tersimpan maksimal 750 KiB. Optimalkan gambar sebelum mengirim.", 413}).write(w)
			return
		}
		if len(data) > 0 {
			config, _, e := image.DecodeConfig(bytes.NewReader(data))
			if e != nil || config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > 24_000_000 {
				(&apiProblem{"File gambar tidak valid atau resolusinya terlalu besar.", 400}).write(w)
				return
			}
		}
	}
	if uploads[0].URL == "" && len(uploads[0].Data) == 0 && !uploads[0].Keep && (uploads[1].URL != "" || len(uploads[1].Data) > 0 || uploads[1].Keep) {
		(&apiProblem{"Isi foto utama sebelum foto pendamping.", 400}).write(w)
		return
	}
	item, err := a.Education.SavePhotos(r.Context(), id, version, actor.ID, uploads)
	if errors.Is(err, repositories.ErrEducationPhotoCapacity) {
		(&apiProblem{"Foto melebihi kapasitas unggahan database. Gunakan gambar lebih kecil.", 413}).write(w)
		return
	}
	if err != nil {
		educationFailure(w, err)
		return
	}
	httpx.SendResponse(w, "success", "Foto artikel tersimpan.", item, 200)
}

func (a *App) educationPhoto(w http.ResponseWriter, r *http.Request) {
	id := educationID(w, r)
	if id == 0 {
		return
	}
	slot, err := strconv.Atoi(r.PathValue("slot"))
	if err != nil || slot < 0 || slot > 1 {
		http.NotFound(w, r)
		return
	}
	actor, authErr := a.apiSession(r)
	admin := authErr == nil && actor.Role == models.RoleAdmin
	data, mime, err := a.Education.Photo(r.Context(), id, slot, admin)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Write(data)
}
