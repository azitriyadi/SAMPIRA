export const categories = {
    tps: 'Tempat Penampungan Sementara (TPS)',
    collection_site: 'Tempat Pengumpulan Sampah',
    waste_bank: 'Bank Sampah',
    other: 'Fasilitas Lainnya'
};

export const statuses = {
    pending: 'Menunggu Verifikasi',
    revision_required: 'Perlu Revisi',
    approved: 'Disetujui',
    rejected: 'Ditolak'
};

const dateFormat = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta'
});

export function dateLabel(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.valueOf()) ? dateFormat.format(date) + ' WIB' : '—';
}

export function options(labels, placeholder) {
    const select = document.createDocumentFragment();
    select.append(new Option(placeholder, ''));
    for (const [value, label] of Object.entries(labels)) select.append(new Option(label, value));
    return select;
}

export function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function badge(status) {
    const node = element('span', Object.hasOwn(statuses, status) ? statuses[status] : 'Status belum dikenal', 'facility-badge');
    node.dataset.status = status;
    return node;
}

function time(value) {
    const node = element('time', dateLabel(value));
    if (value && Number.isFinite(Date.parse(value))) node.dateTime = value;
    return node;
}

export function reportCard(report, admin, openDetail) {
    const item = element('li', undefined, 'facility-card');
    const top = element('div', undefined, 'facility-card-head');
    top.append(element('span', report.tracking_number, 'facility-ref'), badge(report.status));
    const dates = element('p');
    dates.append('Diajukan ', time(report.created_at), ' · Diperbarui ', time(report.updated_at));
    const footer = element('div', undefined, 'facility-actions facility-card-foot');
    const action = element('button', admin && report.status === 'pending' ? 'Tinjau laporan' : 'Lihat detail', 'facility-button');
    action.type = 'button';
    action.setAttribute('aria-label', action.textContent + ' ' + report.tracking_number);
    action.addEventListener('click', () => openDetail(report.id));
    const category = Object.hasOwn(categories, report.category) ? categories[report.category] : 'Kategori belum dikenal';
    footer.append(element('span', admin ? category + ' · Pelapor #' + report.reporter_id : category), action);
    item.append(top, element('h4', report.title), dates, footer);
    return item;
}

export function reportDetails(report, admin, base) {
    const content = element('div', undefined, 'facility-stack');
    const top = element('div', undefined, 'facility-card-head');
    top.append(element('span', report.tracking_number, 'facility-ref'), badge(report.status));
    const meta = element('dl', undefined, 'facility-detail-meta');
    const fields = [
        ['Kategori', Object.hasOwn(categories, report.category) ? categories[report.category] : '—'],
        ['Alamat', report.address],
        ['Diajukan', dateLabel(report.created_at)],
        ['Diperbarui', dateLabel(report.updated_at)]
    ];
    if (report.latitude !== null && report.longitude !== null) {
        fields.push(['Koordinat', String(report.latitude) + ', ' + String(report.longitude)]);
    }
    if (admin) fields.push(['Pelapor', '#' + report.reporter_id]);
    if (report.reviewed_at) fields.push(['Waktu verifikasi', dateLabel(report.reviewed_at)]);
    for (const [label, value] of fields) {
        const group = element('div');
        group.append(element('dt', label), element('dd', value));
        meta.append(group);
    }
    content.append(top, element('h4', report.title), element('p', report.description, 'facility-copy'), meta);
    if (report.status === 'approved') {
        content.append(element('p', 'Laporan lolos verifikasi.', 'facility-notice'));
    }
    if (report.verification_note) {
        const note = element('div');
        const labels = {revision_required: 'Catatan revisi', rejected: 'Alasan penolakan'};
        note.append(element('h4', labels[report.status] || 'Catatan Admin'), element('p', report.verification_note, 'facility-copy'));
        content.append(note);
    }
    const photo = element('div', undefined, 'facility-stack');
    photo.append(element('h4', 'Foto fasilitas'));
    const photoPath = base + '/' + report.id + '/photo';
    if (report.photo_url === photoPath) {
        const image = element('img', undefined, 'facility-photo');
        image.alt = 'Foto fasilitas pada laporan ' + report.tracking_number;
        image.addEventListener('error', () => image.replaceWith(element('p', 'Foto tidak dapat dimuat. Muat ulang detail untuk mencoba kembali.', 'facility-muted')));
        image.src = photoPath;
        photo.append(image);
    } else {
        photo.append(element('p', 'Laporan ini tidak memiliki foto.', 'facility-muted'));
    }
    content.append(photo);
    return content;
}

export function historyEntry(event, admin) {
    const entry = element('li');
    const origin = Object.hasOwn(statuses, event.from_status) ? statuses[event.from_status] : 'Pengajuan';
    const target = Object.hasOwn(statuses, event.to_status) ? statuses[event.to_status] : 'Status belum dikenal';
    entry.append(element('strong', origin + ' → ' + target));
    const meta = element('p', undefined, 'facility-muted');
    meta.append(time(event.created_at));
    if (admin) meta.append(' · Aktor #' + event.actor_id);
    entry.append(meta);
    if (event.note) entry.append(element('p', event.note, 'facility-copy'));
    return entry;
}

// Static markup shared by the two portal mounts. API content is rendered with DOM nodes.
export function mountReports(root, admin) {
    root.innerHTML = `
        <header class="facility-header">
            <div>
                <p class="facility-kicker">${admin ? 'Ruang verifikasi' : 'Ruang pengguna'}</p>
                <h2 id="facility-heading" tabindex="-1">${admin ? 'Verifikasi laporan fasilitas' : 'Lapor Fasilitas'}</h2>
                <p>${admin ? 'Tinjau kondisi, foto, dan histori laporan fasilitas yang masuk.' : 'Laporkan masalah pada fasilitas sampah dan pantau hasil verifikasinya.'}</p>
            </div>
        </header>
        <output id="facility-success" class="facility-notice" aria-live="polite"></output>
        <p id="facility-error" class="facility-notice error" role="alert" tabindex="-1"></p>
        <section id="facility-list-view" class="facility-panel" aria-labelledby="facility-list-heading">
            <h3 id="facility-list-heading" tabindex="-1">${admin ? 'Antrean laporan' : 'Laporan saya'}</h3>
            <div class="facility-toolbar">
                <div class="facility-filters">
                    <label class="facility-field" for="facility-status">Status <select id="facility-status"></select></label>
                    <label class="facility-field" for="facility-category">Kategori <select id="facility-category"></select></label>
                </div>
                ${admin ? '' : '<button type="button" id="facility-new" class="facility-button primary">Buat laporan</button>'}
            </div>
            <p id="facility-list-message" class="facility-muted" aria-live="polite"></p>
            <ul id="facility-list" class="facility-cards"></ul>
            <div class="facility-actions">
                <button type="button" id="facility-list-retry" class="facility-button" hidden>Coba lagi</button>
                <button type="button" id="facility-list-more" class="facility-button" hidden>Muat laporan berikutnya</button>
            </div>
        </section>
        <section id="facility-detail-view" class="facility-panel facility-stack" aria-labelledby="facility-detail-heading" hidden>
            <div class="facility-actions">
                <h3 id="facility-detail-heading" tabindex="-1">Detail laporan</h3>
                <button type="button" class="facility-button" data-facility-back>Kembali ke daftar</button>
            </div>
            <p id="facility-detail-message" class="facility-muted" aria-live="polite" hidden></p>
            <button type="button" id="facility-detail-retry" class="facility-button" hidden>Muat ulang detail</button>
            <div id="facility-detail"></div>
            ${admin ? verificationMarkup : '<button type="button" id="facility-revise" class="facility-button primary" hidden>Perbaiki laporan</button>'}
            <section id="facility-history-section" aria-labelledby="facility-history-heading" hidden>
                <h4 id="facility-history-heading">Histori status</h4>
                <p id="facility-history-message" class="facility-muted" aria-live="polite"></p>
                <ol id="facility-history" class="facility-timeline"></ol>
                <button type="button" id="facility-history-more" class="facility-button" hidden>Muat histori sebelumnya</button>
            </section>
        </section>
    `;
    root.querySelector('#facility-status').append(options(statuses, 'Semua status'));
    root.querySelector('#facility-category').append(options(categories, 'Semua kategori'));
}

const verificationMarkup = `
    <form id="facility-verify" class="facility-stack" hidden>
        <fieldset class="facility-stack">
            <legend><strong>Keputusan verifikasi</strong></legend>
            <label for="facility-decision" class="facility-field">Tindakan
                <select id="facility-decision" name="status" required>
                    <option value="">Pilih tindakan</option>
                    <option value="approved">Setujui laporan</option>
                    <option value="revision_required">Minta revisi</option>
                    <option value="rejected">Tolak laporan</option>
                </select>
            </label>
            <div class="facility-field"><label for="facility-note">Catatan Admin</label>
                <textarea id="facility-note" name="note" rows="3" aria-describedby="facility-note-help"></textarea>
                <small id="facility-note-help">Wajib untuk revisi atau penolakan. Maksimal 1.000 karakter.</small>
            </div>
            <div><button type="submit" class="facility-button primary">Tinjau keputusan</button></div>
        </fieldset>
    </form>
    <dialog id="facility-confirm" class="facility-dialog" aria-labelledby="facility-confirm-title" aria-describedby="facility-confirm-copy">
        <form method="dialog" class="facility-stack">
            <h4 id="facility-confirm-title">Konfirmasi verifikasi</h4>
            <p id="facility-confirm-copy"></p>
            <div class="facility-actions">
                <button class="facility-button" type="submit" value="cancel" autofocus>Batal</button>
                <button class="facility-button primary" type="submit" value="confirm">Simpan keputusan</button>
            </div>
        </form>
    </dialog>
`;
