import {categories, options} from './facility-report-ui.js?v=phase4b';

const textLengths = {title: [5, 120], description: [10, 3000], address: [5, 300]};
const coordinatePattern = /^-?[0-9]{1,3}(\.[0-9]{1,6})?$/;

function validateCoordinates(form, values) {
    const {latitude, longitude} = values;
    if (!latitude && !longitude) return;
    if (!latitude || !longitude) {
        form.elements[latitude ? 'longitude' : 'latitude'].setCustomValidity('Isi kedua koordinat atau kosongkan keduanya.');
        return;
    }
    for (const [name, limit] of [['latitude', 90], ['longitude', 180]]) {
        if (!coordinatePattern.test(values[name]) || Math.abs(Number(values[name])) > limit) {
            form.elements[name].setCustomValidity('Gunakan angka −' + limit + ' sampai ' + limit + ' dengan maksimal enam digit desimal.');
        }
    }
}

export async function checkImage(file, url) {
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const png = /\.png$/i.test(file.name) && signature.length === 8 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
    const jpeg = /\.jpe?g$/i.test(file.name) && signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
    if (!png && !jpeg) throw new Error('Pilih gambar JPEG atau PNG dengan ekstensi yang sesuai.');
    const image = new Image();
    image.src = url;
    try {
        await image.decode();
    } catch {
        throw new Error('Gambar tidak dapat dibaca. Pilih foto lain.');
    }
    if (image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error('Resolusi foto maksimal 16 megapiksel.');
}

export function mountReportForm(root) {
    root.insertAdjacentHTML('beforeend', `
        <section id="facility-form-view" class="facility-panel facility-stack" aria-labelledby="facility-form-heading" hidden>
            <h3 id="facility-form-heading" tabindex="-1">Buat laporan fasilitas</h3>
            <form id="facility-form" class="facility-stack" enctype="multipart/form-data">
                <fieldset class="facility-stack">
                    <legend class="facility-muted">Isi kategori, masalah, dan lokasi fasilitas.</legend>
                    <label for="facility-form-category" class="facility-field">Kategori fasilitas
                        <select id="facility-form-category" name="category" required></select>
                    </label>
                    <div class="facility-field"><label for="facility-title">Judul laporan</label>
                        <input id="facility-title" name="title" minlength="5" required aria-describedby="facility-title-help">
                        <small id="facility-title-help">5–120 karakter.</small>
                    </div>
                    <div class="facility-field"><label for="facility-description">Deskripsi masalah</label>
                        <textarea id="facility-description" name="description" rows="4" minlength="10" required aria-describedby="facility-description-help"></textarea>
                        <small id="facility-description-help">10–3.000 karakter.</small>
                    </div>
                    <div class="facility-field"><label for="facility-address">Alamat lengkap</label>
                        <textarea id="facility-address" name="address" rows="2" minlength="5" required aria-describedby="facility-address-help"></textarea>
                        <small id="facility-address-help">5–300 karakter.</small>
                    </div>
                    <fieldset class="facility-stack" aria-describedby="facility-coordinates-help">
                        <legend><strong>Koordinat (opsional)</strong></legend>
                        <p id="facility-coordinates-help" class="facility-muted">Isi keduanya dengan titik desimal, misalnya −6.9235 dan 107.6112.</p>
                        <div class="facility-form-grid">
                            <label for="facility-latitude" class="facility-field">Latitude
                                <input id="facility-latitude" name="latitude" type="text" inputmode="decimal" maxlength="11">
                            </label>
                            <label for="facility-longitude" class="facility-field">Longitude
                                <input id="facility-longitude" name="longitude" type="text" inputmode="decimal" maxlength="11">
                            </label>
                        </div>
                    </fieldset>
                    <div class="facility-field"><label for="facility-photo">Foto (opsional)</label>
                        <input type="file" id="facility-photo" name="photo" accept=".jpg,.jpeg,.png,image/jpeg,image/png" aria-describedby="facility-photo-help facility-photo-status">
                        <small id="facility-photo-help">JPEG atau PNG, maksimal 5 MiB dan 16 megapiksel.</small>
                    </div>
                    <output id="facility-photo-status" class="facility-muted" aria-live="polite"></output>
                    <img id="facility-preview" class="facility-photo" alt="Pratinjau foto fasilitas" hidden>
                    <div><button type="submit" id="facility-submit" class="facility-button primary">Kirim laporan</button></div>
                </fieldset>
            </form>
            <div class="facility-actions">
                <button type="button" id="facility-form-back" class="facility-button">Kembali</button>
                <button type="button" id="facility-retry-post" class="facility-button primary" hidden>Coba kirim ulang</button>
                <button type="button" id="facility-discard-post" class="facility-button" hidden>Abaikan percobaan</button>
            </div>
        </section>
    `);
    const form = root.querySelector('#facility-form');
    const preview = root.querySelector('#facility-preview');
    const photoStatus = root.querySelector('#facility-photo-status');
    const fileInput = form.elements.photo;
    const submit = root.querySelector('#facility-submit');
    let previewURL;

    form.elements.category.append(options(categories, 'Pilih kategori fasilitas'));
    function clearPreview() {
        if (previewURL) URL.revokeObjectURL(previewURL);
        previewURL = null;
        preview.removeAttribute('src');
        preview.hidden = true;
        photoStatus.textContent = '';
        fileInput.setCustomValidity('');
        submit.disabled = false;
    }

    fileInput.addEventListener('change', async () => {
        clearPreview();
        const file = fileInput.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            const message = 'Ukuran foto maksimal 5 MiB.';
            photoStatus.textContent = message;
            fileInput.setCustomValidity(message);
            return;
        }
        const url = URL.createObjectURL(file);
        previewURL = url;
        submit.disabled = true;
        photoStatus.textContent = 'Memeriksa foto…';
        try {
            await checkImage(file, url);
            if (previewURL !== url) return;
            preview.src = url;
            preview.hidden = false;
            photoStatus.textContent = 'Foto siap diunggah.';
        } catch (error) {
            if (previewURL !== url) return;
            clearPreview();
            fileInput.setCustomValidity(error.message);
            photoStatus.textContent = error.message;
        } finally {
            if (previewURL === url) submit.disabled = false;
        }
    });

    form.addEventListener('input', event => {
        if (event.target === fileInput) return;
        event.target.setCustomValidity('');
        if (event.target.name === 'latitude' || event.target.name === 'longitude') {
            form.elements.latitude.setCustomValidity('');
            form.elements.longitude.setCustomValidity('');
        }
    });

    function reset(report) {
        form.reset();
        clearPreview();
        for (const name of ['category', 'title', 'description', 'address', 'latitude', 'longitude']) {
            form.elements[name].value = report?.[name] ?? '';
            form.elements[name].setCustomValidity('');
        }
        root.querySelector('#facility-form-heading').textContent = report ? 'Perbaiki laporan fasilitas' : 'Buat laporan fasilitas';
        root.querySelector('#facility-photo-help').textContent = report?.photo_url
            ? 'Kosongkan untuk mempertahankan foto saat ini. Foto baru harus JPEG atau PNG, maksimal 5 MiB dan 16 megapiksel.'
            : 'JPEG atau PNG, maksimal 5 MiB dan 16 megapiksel.';
        submit.textContent = report ? 'Kirim revisi' : 'Kirim laporan';
    }

    function payload() {
        if (submit.disabled || !form.reportValidity()) return null;
        const values = {};
        for (const name of ['category', 'title', 'description', 'address', 'latitude', 'longitude']) {
            values[name] = form.elements[name].value.trim();
        }
        for (const [name, [min, max]] of Object.entries(textLengths)) {
            const count = [...values[name]].length;
            if (count < min || count > max) form.elements[name].setCustomValidity('Isi ' + min + '–' + max + ' karakter.');
        }
        validateCoordinates(form, values);
        if (!form.reportValidity()) return null;
        const body = new FormData();
        for (const [name, value] of Object.entries(values)) body.set(name, value);
        if (fileInput.files[0]) body.set('photo', fileInput.files[0]);
        return body;
    }

    return {form, reset, payload};
}
