export function mountLocationSearch(host, pickerHost, picker, prefix) {
    host.innerHTML = `
        <div class="sp-pickup-field">
            <label for="${prefix}-address-search">Cari jalan atau tempat di Bandung</label>
            <div class="sp-pickup-weight">
                <input id="${prefix}-address-search" type="search" maxlength="160" autocomplete="off" placeholder="Contoh: Jalan Braga" aria-describedby="${prefix}-search-help">
                <button id="${prefix}-search-button" type="button" class="sp-button sp-button--quiet">Cari</button>
            </div>
            <small id="${prefix}-search-help">Kata kunci dikirim ke <a href="https://photon.komoot.io/">Photon</a>. Cari nama jalan atau tempat umum, lalu isi detail alamat di bawah.</small>
            <p id="${prefix}-search-status" class="sp-location-search-status" role="status"></p>
            <ul id="${prefix}-search-results" class="sp-pickup-search-results" hidden></ul>
        </div>
    `;
    const searchInput = host.querySelector(`#${prefix}-address-search`);
    const searchButton = host.querySelector(`#${prefix}-search-button`);
    const searchStatus = host.querySelector(`#${prefix}-search-status`);
    const searchResults = host.querySelector(`#${prefix}-search-results`);

    function clearSearch() {
        searchResults.replaceChildren();
        searchResults.hidden = true;
        searchStatus.textContent = '';
    }

    searchInput.addEventListener('input', clearSearch);
    host.closest('form').addEventListener('reset', clearSearch);
    searchInput.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        searchButton.click();
    });
    searchButton.addEventListener('click', async () => {
        clearSearch();
        const query = searchInput.value.trim();
        if (query.length < 3) {
            searchStatus.textContent = 'Masukkan minimal 3 karakter.';
            searchInput.focus();
            return;
        }
        searchButton.disabled = true;
        searchStatus.textContent = 'Mencari lokasi…';
        try {
            const endpoint = new URL('https://photon.komoot.io/api/');
            endpoint.search = new URLSearchParams({q: query, bbox: '107.50,-7.00,107.75,-6.80', limit: '5'});
            const response = await fetch(endpoint, {credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000)});
            if (!response.ok) throw new Error('Pencarian gagal');
            const {features} = await response.json();
            if (searchInput.value.trim() !== query) return;
            for (const feature of features) {
                const [longitude, latitude] = feature.geometry?.coordinates || [];
                if (feature.geometry?.type !== 'Point' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
                const {name, street, district, city} = feature.properties || {};
                const label = [...new Set([name, street, district, city].filter(Boolean))].join(', ');
                if (!label) continue;
                const result = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = label;
                button.addEventListener('click', () => {
                    picker.selectPoint(latitude, longitude);
                    clearSearch();
                    searchStatus.textContent = 'Lokasi dipilih. Periksa dan konfirmasi titik di peta.';
                    pickerHost.querySelector('.location-actions .primary')?.focus();
                });
                result.append(button);
                searchResults.append(result);
            }
            searchResults.hidden = !searchResults.childElementCount;
            searchStatus.textContent = searchResults.hidden ? 'Lokasi tidak ditemukan. Coba nama jalan lain.' : 'Pilih salah satu hasil pencarian.';
        } catch {
            if (searchInput.value.trim() === query) searchStatus.textContent = 'Pencarian tidak tersedia. Pilih titik di peta atau isi alamat secara manual.';
        } finally {
            searchButton.disabled = false;
        }
    });
}
