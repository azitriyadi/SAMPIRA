// EcoRecycle Eco Warrior Dashboard Logic

let monthlyChart = null;

const categoryConfig = Object.fromEntries(wasteCategories.map(category => [category.name, category]));

const categorySelect = document.getElementById('form-waste-category');
if (categorySelect) populateWasteOptions(categorySelect, 'Small Gadgets');
const categoryGrid = document.getElementById('category-helper-grid');
if (categoryGrid) {
    categoryGrid.replaceChildren();
    for (const category of wasteCategories) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'category-helper-card';
        card.dataset.category = category.name;
        card.dataset.weight = category.weight;
        card.dataset.example = category.example;
        const icon = document.createElement('i');
        icon.className = `fas ${category.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const title = document.createElement('strong');
        title.textContent = category.label;
        const group = document.createElement('span');
        group.textContent = category.group;
        card.append(icon, title, group);
        categoryGrid.append(card);
    }
}
const pickupStatusFlow = ['pending', 'pickup', 'transit', 'arrived', 'completed'];
const pickupStatusMeta = {
    pending: {
        label: 'Menunggu Petugas',
        icon: 'fa-clock',
        description: 'Pengajuan diterima dan sedang menunggu petugas mengambil tugas.',
        nextAction: 'Berikutnya: petugas menerima pickup.'
    },
    pickup: {
        label: 'Petugas Ditugaskan',
        icon: 'fa-truck-pickup',
        description: 'Petugas sudah mengambil tugas dan akan menuju alamat penjemputan.',
        nextAction: 'Berikutnya: barang dijemput dan dibawa menuju hub.'
    },
    transit: {
        label: 'Menuju Hub',
        icon: 'fa-truck-fast',
        description: 'Sampah sedang dalam perjalanan menuju Recycling Hub.',
        nextAction: 'Berikutnya: barang diterima oleh hub.'
    },
    arrived: {
        label: 'Tiba di Hub',
        icon: 'fa-clipboard-check',
        description: 'Sampah sudah tiba di hub dan menunggu verifikasi berat aktual.',
        nextAction: 'Berikutnya, Petugas mencatat berat aktual.'
    },
    completed: {
        label: 'Selesai',
        icon: 'fa-circle-check',
        description: 'Penjemputan selesai. Status pembayaran ditampilkan terpisah.',
        nextAction: 'Proses selesai.'
    },
    cancelled: {
        label: 'Dibatalkan',
        icon: 'fa-ban',
        description: 'Pengajuan dibatalkan sebelum petugas mengambil tugas.',
        nextAction: 'Buat pengajuan baru jika masih ingin menyetor sampah.'
    }
};

function pickupPaymentLabel(item) {
    if (item.reward_amount == null) {
        return item.payment_status === 'requires_reconciliation' ? 'Perlu rekonsiliasi' : 'Belum ditimbang';
    }
    if (item.payment_status === 'not_due') return 'Tanpa pembayaran';
    return item.payment_status === 'paid' ? 'Pembayaran tercatat' : 'Menunggu pembayaran';
}

function pickupRewardLabel(item) {
    const format = amount => new Intl.NumberFormat('id-ID', {
        style: 'currency', currency: 'IDR', maximumFractionDigits: 2
    }).format(amount);
    if (item.reward_amount != null) return 'Final ' + format(Number(item.reward_amount));
    if (item.payment_status === 'requires_reconciliation') return 'Catatan historis';
    if (item.eco_reward == null) return '—';
    return 'Estimasi ' + format(Math.max(0, Number(item.eco_reward) - Number(item.processing_fee)));
}

function getPickupStatusMeta(status) {
    return pickupStatusMeta[status] || pickupStatusMeta.pending;
}

function getStatusBadgeClass(status) {
    if (status === 'pickup') return 'pickup';
    if (status === 'transit') return 'transit';
    if (status === 'arrived') return 'arrived';
    if (status === 'completed') return 'completed';
    if (status === 'cancelled') return 'cancelled';
    return 'pending';
}

function renderStatusStepper(currentStatus) {
    const currentIndex = pickupStatusFlow.indexOf(currentStatus);
    return `
        <div class="pickup-status-stepper" aria-label="Tahapan status penjemputan">
            ${pickupStatusFlow.map((status, index) => {
                const meta = getPickupStatusMeta(status);
                let stateClass = '';
                if (index < currentIndex) stateClass = 'done';
                if (index === currentIndex) stateClass = 'current';
                return `
                    <div class="pickup-status-step ${stateClass}">
                        <span><i class="fas ${meta.icon}"></i></span>
                        <strong>${meta.label}</strong>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Tab Switching
const tabs = document.querySelectorAll('.hub-tab');
const panes = document.querySelectorAll('.tab-pane');

tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        e.preventDefault();
        
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        tabs.forEach(t => t.removeAttribute('aria-current'));
        tab.setAttribute('aria-current', 'page');

        const target = tab.dataset.target;
        const workspaceLabel = document.getElementById('workspace-label');
        if (workspaceLabel) workspaceLabel.textContent = target === 'beranda' ? 'Beranda / Ringkasan' : `Ruang pengguna / ${tab.textContent.trim()}`;
        panes.forEach(p => p.classList.remove('active'));
        
        const targetPane = document.getElementById(target);
        if (targetPane) {
            targetPane.classList.add('active');
        }
        if (target === 'lacak-pickup') requestAnimationFrame(initUserTrackingMap);

        // Close sidebar on mobile
        closeSidebar();
    });
});

// Mobile Sidebar Toggle
const hamburgerBtn = document.getElementById('mobileMenuToggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function openSidebar() {
    if (sidebar) sidebar.classList.add('active');
    if (sidebarOverlay) sidebarOverlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
    if (sidebar) sidebar.classList.remove('active');
    if (sidebarOverlay) sidebarOverlay.style.display = 'none';
    document.body.style.overflow = '';
    if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'false');
}

if (hamburgerBtn) hamburgerBtn.addEventListener('click', openSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar?.classList.contains('active')) {
        closeSidebar();
        if (hamburgerBtn) hamburgerBtn.focus();
    }
});

// Payout Preview Calculation

let previewRequest = 0;
async function calculateFormPreview() {
    const categorySelect = document.getElementById('form-waste-category');
    const weightInput = document.getElementById('form-waste-weight');
    if (!categorySelect || !weightInput) return;
    const request = ++previewRequest;
    const category = categorySelect.value;
    const weight = weightInput.value;
    const config = categoryConfig[category] || categoryConfig['Small Gadgets'];
    document.getElementById('category-handling-note').textContent = config.note;
    const fields = ['preview-gross-reward', 'preview-fee', 'preview-net-reward', 'preview-carbon'];
    for (const id of fields) document.getElementById(id).textContent = '—';
    if (!weight || !weightInput.validity.valid) return;
    try {
        const response = await portalFetch('/api/ecorecycle/estimate_reward', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({category, weight_kg: weight})
        });
        if (!response.ok || request !== previewRequest) return;
        const {data} = await response.json();
        if (request !== previewRequest) return;
        const currency = new Intl.NumberFormat('id-ID', {style: 'currency', currency: 'IDR', maximumFractionDigits: 2});
        const values = [currency.format(data.total_estimate), currency.format(data.processing_fee),
            currency.format(data.net_estimate), Number(data.co2_saved).toFixed(1)];
        fields.forEach((id,index) => { document.getElementById(id).textContent = values[index]; });
    } catch {
        // Leave the placeholder if the server has no valid estimate.
    }
}

const formWeight = document.getElementById('form-waste-weight');
const formCat = document.getElementById('form-waste-category');

if (formWeight) formWeight.addEventListener('input', calculateFormPreview);
if (formCat) formCat.addEventListener('change', calculateFormPreview);

function syncCategoryCards(category) {
    document.querySelectorAll('.category-helper-card').forEach(card => {
        card.classList.toggle('active', card.dataset.category === category);
    });
}

document.querySelectorAll('.category-helper-card').forEach(card => {
    card.addEventListener('click', () => {
        const categorySelect = document.getElementById('form-waste-category');
        const weightInput = document.getElementById('form-waste-weight');
        const descriptionInput = document.getElementById('form-item-description');

        if (categorySelect) categorySelect.value = card.dataset.category;
        if (weightInput) weightInput.value = card.dataset.weight;
        if (descriptionInput && (descriptionInput.value.trim() === '' || descriptionInput.value === descriptionInput.dataset.suggestedExample)) {
            descriptionInput.value = card.dataset.example;
            descriptionInput.dataset.suggestedExample = card.dataset.example;
        }

        syncCategoryCards(card.dataset.category);
        calculateFormPreview();
    });
});

if (formCat) {
    formCat.addEventListener('change', () => {
        syncCategoryCards(formCat.value);
        calculateFormPreview();
    });
}

const photoInput = document.getElementById('form-waste-photo');
const photoPreviewCard = document.getElementById('photo-preview-card');
const photoPreviewImg = document.getElementById('photo-preview-img');
const removePhotoBtn = document.getElementById('remove-photo-btn');

function clearPhotoPreview() {
    if (photoInput) photoInput.value = '';
    if (photoPreviewImg) photoPreviewImg.removeAttribute('src');
    if (photoPreviewCard) photoPreviewCard.style.display = 'none';
}

if (photoInput) {
    photoInput.addEventListener('change', () => {
        const file = photoInput.files[0];
        if (!file) {
            clearPhotoPreview();
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            clearPhotoPreview();
            Swal.fire({
                icon: 'warning',
                title: 'Format Foto Tidak Sesuai',
                text: 'Gunakan foto JPG, PNG, atau WEBP.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            clearPhotoPreview();
            Swal.fire({
                icon: 'warning',
                title: 'Foto Terlalu Besar',
                text: 'Ukuran foto maksimal 5 MB.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        if (photoPreviewImg && photoPreviewCard) {
            photoPreviewImg.src = URL.createObjectURL(file);
            photoPreviewCard.style.display = 'block';
        }
    });
}

if (removePhotoBtn) removePhotoBtn.addEventListener('click', clearPhotoPreview);

// Logout
function logoutUser() {
    logoutPortal();
}

// System Notification Alert Close
function closeNotification() {
    document.getElementById('system-notification-box').style.display = 'none';
}

function openTrackingDetail(trackingNumber) {
    const trackInput = document.getElementById('track-number-search');
    if (trackInput) trackInput.value = trackingNumber;
    const trackingTab = document.querySelector('.sidebar-item[data-target="lacak-pickup"]');
    if (trackingTab) trackingTab.click();
    searchTracking();
}


async function editPendingPickup(encodedItem) {
    const item = JSON.parse(decodeURIComponent(encodedItem));
    const result = await Swal.fire({
        title: 'Edit Pengajuan Pending',
        html: `
            <div style="text-align:left;">
                <label class="swal-form-label">Deskripsi barang</label>
                <textarea id="edit-item-description" class="swal2-textarea" style="margin:0 0 10px; width:100%;">${escapePortalHTML(item.item_description || '')}</textarea>
                <label class="swal-form-label">Alamat penjemputan</label>
                <textarea id="edit-pickup-address" class="swal2-textarea" style="margin:0 0 10px; width:100%;">${escapePortalHTML(item.pickup_address || '')}</textarea>
                <label class="swal-form-label">Nomor HP / WhatsApp</label>
                <input id="edit-contact-phone" class="swal2-input" style="margin:0 0 10px; width:100%;" value="${escapePortalHTML(item.contact_phone || '')}">
                <label class="swal-form-label">Kategori</label>
                <select id="edit-category" class="swal2-select" style="margin:0 0 10px; width:100%;">
                    ${Object.keys(categoryConfig).map(category => `<option value="${category}" ${item.category_name === category ? 'selected' : ''}>${categoryConfig[category].label}</option>`).join('')}
                </select>
                <label class="swal-form-label">Estimasi berat (KG)</label>
                <input id="edit-weight" type="number" min="0.01" max="99999.99" step="0.01" class="swal2-input" style="margin:0; width:100%;" value="${item.weight_kg || ''}">
            </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Simpan Perubahan',
        cancelButtonText: 'Batal',
        preConfirm: () => {
            const payload = {
                tracking_number: item.tracking_number,
                item_description: document.getElementById('edit-item-description').value.trim(),
                pickup_address: document.getElementById('edit-pickup-address').value.trim(),
                contact_phone: document.getElementById('edit-contact-phone').value.trim(),
                category: document.getElementById('edit-category').value,
                weight_kg: Number.parseFloat(document.getElementById('edit-weight').value)
            };
            if (payload.item_description.length < 10 || payload.pickup_address.length < 15 || !payload.contact_phone || !payload.weight_kg || payload.weight_kg <= 0) {
                Swal.showValidationMessage('Lengkapi deskripsi, alamat, kontak, dan berat dengan benar.');
                return undefined;
            }
            return payload;
        }
    });

    if (!result.isConfirmed) return;
    const headers = {'Content-Type': 'application/json'};

    portalFetch('api/ecorecycle/update_pickup', {
        method: 'POST',
        headers,
        body: JSON.stringify(result.value)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            Swal.fire({ icon: 'success', title: 'Pengajuan Diperbarui', text: 'Perubahan berhasil disimpan sebelum pickup diambil petugas.', confirmButtonColor: '#10b981' });
            loadDashboardData();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal', text: data.message, confirmButtonColor: '#10b981' });
        }
    })
    .catch(() => Swal.fire({ icon: 'error', title: 'Kesalahan', text: 'Gagal menghubungi server.', confirmButtonColor: '#10b981' }));
}

async function cancelPendingPickup(trackingNumber) {
    const result = await Swal.fire({
        title: 'Batalkan Pengajuan?',
        html: `
            <p style="color:#475569;">Pengajuan <strong>${escapePortalHTML(trackingNumber)}</strong> hanya bisa dibatalkan selama masih menunggu petugas.</p>
            <textarea id="cancel-reason" class="swal2-textarea" placeholder="Alasan pembatalan (opsional)" style="width:100%; margin:10px 0 0;"></textarea>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Batalkan',
        cancelButtonText: 'Kembali'
    });
    if (!result.isConfirmed) return;

    const headers = {'Content-Type': 'application/json'};

    portalFetch('api/ecorecycle/cancel_pickup', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            tracking_number: trackingNumber,
            reason: document.getElementById('cancel-reason') ? document.getElementById('cancel-reason').value.trim() : ''
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            Swal.fire({ icon: 'success', title: 'Pengajuan Dibatalkan', text: 'Pickup dibatalkan dan tidak akan masuk antrean petugas.', confirmButtonColor: '#10b981' });
            loadDashboardData();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal', text: data.message, confirmButtonColor: '#10b981' });
        }
    })
    .catch(() => Swal.fire({ icon: 'error', title: 'Kesalahan', text: 'Gagal menghubungi server.', confirmButtonColor: '#10b981' }));
}

function setInputValue(id, value) {
    const field = document.getElementById(id);
    if (field) field.value = value || '';
}

function populateProfileFields(profile) {
    if (!profile) return;
    setInputValue('settings-name', profile.name);
    setInputValue('settings-email', profile.email);
    setInputValue('settings-phone', profile.phone);
    setInputValue('settings-address', profile.address);
    setInputValue('settings-payout-method', profile.payout_method);
    setInputValue('settings-payout-name', profile.payout_account_name);
    setInputValue('settings-payout-number', profile.payout_account_number);

    setInputValue('form-donor-name', profile.name);
    setInputValue('form-donor-phone', profile.phone);
    setInputValue('form-pickup-address', profile.address);
}

function renderUserHistoryRow(item) {
    const weight = Number.parseFloat(item.weight_kg);
    const dateObj = new Date(item.created_at);
    const dateStr = dateObj.getDate() + ' ' + dateObj.toLocaleString('id-ID', {month: 'short'}) + ' ' + dateObj.getFullYear();
    const statusMeta = getPickupStatusMeta(item.status);
    const badgeClass = getStatusBadgeClass(item.status);
    return `
                    <tr>
                        <td style="padding: 16px;">${dateStr}</td>
                        <td style="padding: 16px;"><button type="button" class="btn btn-outline pickup-flow-track-btn" data-tracking="${escapePortalHTML(item.tracking_number)}" onclick="openTrackingDetail(this.dataset.tracking)">${escapePortalHTML(item.tracking_number)}</button></td>
                        <td style="padding: 16px;">${escapePortalHTML(item.category_name)}</td>
                        <td style="padding: 16px; font-weight:700;">${weight} KG${item.final_weight_kg == null ? "" : " / Aktual " + item.final_weight_kg + " KG"}</td>
                        <td style="padding: 16px; font-weight:800; color:#087443;">${pickupRewardLabel(item)}<br><small>${pickupPaymentLabel(item)}</small></td>
                        <td style="padding: 16px;"><span class="status-badge ${badgeClass}">${statusMeta.label}</span></td>
                    </tr>
                `;
}

function renderUserActivePickup(item) {
    if (['completed', 'cancelled'].includes(item.status)) return '';
    const weight = Number.parseFloat(item.weight_kg);
    const statusMeta = getPickupStatusMeta(item.status);
    const badgeClass = getStatusBadgeClass(item.status);
    const encodedItem = encodeURIComponent(JSON.stringify(item));
    const pendingActions = item.status === 'pending' ? `
                        <button type="button" class="btn btn-outline pickup-flow-track-btn" data-item="${encodedItem}" onclick="editPendingPickup(this.dataset.item)">Edit</button>
                        <button type="button" class="btn btn-outline pickup-flow-track-btn danger" data-tracking="${escapePortalHTML(item.tracking_number)}" onclick="cancelPendingPickup(this.dataset.tracking)">Batalkan</button>
                    ` : '';
    return `
                        <div class="active-pickup-card pickup-flow-card">
                            <div class="pickup-flow-card-main">
                                <span style="font-size:0.75rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase;">No. Tracking</span>
                                <h4 style="font-weight:900; color:var(--brand-dark); margin:2px 0;">${escapePortalHTML(item.tracking_number)}</h4>
                                <p style="font-size:0.8rem; color:var(--text-secondary); margin:4px 0 0 0;">${escapePortalHTML(item.category_name)} • ${weight} KG</p>
                            </div>
                            <div class="pickup-flow-card-status">
                                <div class="pickup-flow-icon"><i class="fas ${statusMeta.icon}"></i></div>
                                <div class="pickup-flow-copy">
                                    <span class="status-badge ${badgeClass}">${statusMeta.label}</span>
                                    <p>${statusMeta.description}</p>
                                    <small>${statusMeta.nextAction}</small>
                                </div>
                                <button type="button" class="btn btn-outline pickup-flow-track-btn" data-tracking="${escapePortalHTML(item.tracking_number)}" onclick="openTrackingDetail(this.dataset.tracking)">Lacak</button>
                                ${pendingActions}
                            </div>
                        </div>
                    `;
}

function summarizeUserPickups(pickups) {
    const summary = {totalWeight: 0, totalCarbon: 0, totalReward: 0, activeHtml: '', historyHtml: '', monthlyWeights: {}};
    for (const item of pickups) {
        if (item.status === 'completed' && item.reward_amount != null && item.final_weight_kg != null) {
            const weight = Number(item.final_weight_kg);
            summary.totalWeight += weight;
            summary.totalCarbon += weight * 2.5;
            const month = new Date(item.verified_at || item.created_at).toLocaleString('id-ID', {month: 'short', year: 'numeric'});
            summary.monthlyWeights[month] = (summary.monthlyWeights[month] || 0) + weight;
        }
        if (item.payment_status === 'paid') summary.totalReward += Number(item.reward_amount);
        summary.historyHtml += renderUserHistoryRow(item);
        summary.activeHtml += renderUserActivePickup(item);
    }
    return summary;
}

function setDashboardMarkup(id, markup, emptyMarkup) {
    const element = document.getElementById(id);
    if (element) element.innerHTML = markup || emptyMarkup;
}

function showPickupNotification(item) {
    if (!item || item.status === 'completed') return;
    const box = document.getElementById('system-notification-box');
    const message = document.getElementById('notification-message');
    if (!box || !message) return;
    message.innerHTML = 'Penjemputan <strong>' + escapePortalHTML(item.tracking_number) + '</strong> dalam status: <strong>' + escapePortalHTML(item.status.toUpperCase()) + '</strong>.';
    box.style.display = 'flex';
}

function renderUserDashboard(pickups) {
    const summary = summarizeUserPickups(pickups);
    let userLevel = 'Bronze Saver';
    if (summary.totalWeight >= 15) userLevel = 'Emerald Hero';
    else if (summary.totalWeight >= 5) userLevel = 'Silver Guardian';
    document.getElementById('user-display-level').innerText = userLevel;
    document.getElementById('profile-avatar').dataset.level = userLevel;
    document.getElementById('metric-total-weight').innerText = summary.totalWeight.toFixed(1);
    document.getElementById('metric-total-carbon').innerText = summary.totalCarbon.toFixed(1);
    document.getElementById('metric-total-reward').innerText = new Intl.NumberFormat('id-ID', {style: 'currency', currency: 'IDR', minimumFractionDigits: 0}).format(summary.totalReward);
    setDashboardMarkup('payout-history-table-body', summary.historyHtml, '<tr><td colspan="6" style="text-align:center; padding:24px;">Belum ada riwayat donasi sampah.</td></tr>');
    setDashboardMarkup('active-pickups-container', summary.activeHtml, '<div style="text-align:center; padding:24px;">Tidak ada penjemputan sampah aktif saat ini.</div>');
    if (summary.activeHtml) showPickupNotification(pickups.find(item => !['completed', 'cancelled'].includes(item.status)));
    renderChart(summary.monthlyWeights);
}

// 4. Load User Data & Pickups
async function loadDashboardData() {
    const user = await portalUser('user');
    if (!user) return;
    
    // Set Profile Info
    document.getElementById('hero-welcome').innerText = `Halo, ${user.name}!`;
    document.getElementById('user-display-name').innerText = user.name;
    document.getElementById('profile-avatar').innerText = user.name.substring(0, 2).toUpperCase();
    
    const settingsName = document.getElementById('settings-name');
    const settingsEmail = document.getElementById('settings-email');
    if (settingsName) settingsName.value = user.name;
    if (settingsEmail) settingsEmail.value = user.email;

    const donorNameInput = document.getElementById('form-donor-name');
    if (donorNameInput) donorNameInput.value = user.name;
    populateProfileFields(user);
    populateProfileFields(user);

    // Fetch Pickups from API
    portalFetch('api/ecorecycle/list_pickups?type=user', {
        method: 'GET',
    })
    .then(res => {
        if (res.status === 401) {
            logoutUser();
        }
        return res.json();
    })
    .then(data => {
        if (data.status === 'success') renderUserDashboard(data.data);
    })
    .catch(err => {
        console.error('Error fetching dashboard data:', err);
    });
}

// 5. Submit New Pickup Form
const pickupForm = document.getElementById('pickup-request-form');
if (pickupForm) {
    pickupForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const btn = this.querySelector('button[type="submit"]');
        const originalHtml = btn.innerHTML;

        const phone = document.getElementById('form-donor-phone').value.trim();
        const address = document.getElementById('form-pickup-address').value.trim();
        const description = document.getElementById('form-item-description').value.trim();
        const weight = Number.parseFloat(document.getElementById('form-waste-weight').value);

        if (!/^(\+62|62|0)8\d{8,13}$/.test(phone.replace(/[\s-]/g, ''))) {
            Swal.fire({
                icon: 'warning',
                title: 'Nomor Kontak Belum Valid',
                text: 'Masukkan nomor WhatsApp Indonesia yang aktif.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        if (address.length < 15 || description.length < 10 || !weight || weight <= 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Data Belum Lengkap',
                text: 'Pastikan alamat, deskripsi barang, dan berat sudah diisi dengan benar.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
        btn.disabled = true;

        const formData = new FormData();
        formData.append('item_description', description);
        formData.append('pickup_address', address);
        formData.append('contact_phone', phone);
        formData.append('weight_kg', weight);
        formData.append('category', document.getElementById('form-waste-category').value);

        const photoInput = document.getElementById('form-waste-photo');
        if (photoInput && photoInput.files.length > 0) {
            formData.append('photo', photoInput.files[0]);
        }

        portalFetch('api/ecorecycle/request_pickup', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                Swal.fire({
                    icon: 'success',
                    title: 'Permohonan Berhasil!',
                    html: `Nomor Tracking: <strong>${data.data.tracking_number}</strong><br>Petugas kami akan segera menghubungi Anda.`,
                    confirmButtonColor: '#10b981',
                    confirmButtonText: 'Lacak Status'
                }).then(() => {
                    pickupForm.reset();
                    clearPhotoPreview();
                    syncCategoryCards('Small Gadgets');
                    calculateFormPreview();
                    loadDashboardData();
                    const trackInput = document.getElementById('track-number-search');
                    if (trackInput) trackInput.value = data.data.tracking_number;
                    document.querySelector('.sidebar-item[data-target="lacak-pickup"]').click();
                    searchTracking();
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Gagal',
                    text: data.message,
                    confirmButtonColor: '#10b981'
                });
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        })
        .catch(err => {
            Swal.fire({
                icon: 'error',
                title: 'Kesalahan',
                text: 'Gagal menghubungi server.',
                confirmButtonColor: '#10b981'
            });
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        });
    });
}

// 6. Track Search
function searchTracking() {
    const input = document.getElementById('track-number-search');
    const container = document.getElementById('tracking-timeline-container');
    
    if (!input || !container) return;
    const trackingNum = input.value.trim();

    if (trackingNum === '') {
        Swal.fire({
            icon: 'warning',
            title: 'Kolom Kosong',
            text: 'Silakan masukkan nomor tracking terlebih dahulu.',
            confirmButtonColor: '#10b981'
        });
        return;
    }

    portalFetch(`api/ecorecycle/pickup_status?tracking_number=${encodeURIComponent(trackingNum)}`, {
        method: 'GET',
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            const item = data.data;
            const history = item.history || [];
            showPickupOnUserMap(item);

            document.getElementById('track-disp-number').innerText = item.tracking_number;
            
            const statusMeta = getPickupStatusMeta(item.status);
            const badgeClass = getStatusBadgeClass(item.status);

            const statusBadge = document.getElementById('track-disp-status');
            statusBadge.className = `status-badge ${badgeClass}`;
            statusBadge.innerText = statusMeta.label;

            document.getElementById('track-disp-detail').innerText = `${item.category_name} • Estimasi ${item.weight_kg} KG` +
                (item.final_weight_kg == null ? "" : ` • Aktual ${item.final_weight_kg} KG`);

            document.getElementById('track-disp-reward').textContent = [
                pickupRewardLabel(item), pickupPaymentLabel(item), item.payment_reference ? 'Ref. ' + item.payment_reference : ''
            ].filter(Boolean).join(' • ');

            // Populate Timeline
            const timelineList = document.getElementById('track-timeline-list');
            timelineList.innerHTML = renderStatusStepper(item.status);

            if (history.length === 0) {
                timelineList.innerHTML += '<p style="color:var(--text-secondary);">Belum ada log pelacakan.</p>';
            } else {
                history.forEach(log => {
                    const dateObj = new Date(log.updated_at);
                    const timeStr = `${dateObj.getDate()} ${dateObj.toLocaleString('id-ID', { month: 'short' })} ${dateObj.getFullYear()}, ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                    const logMeta = getPickupStatusMeta(log.status);
                    
                    timelineList.innerHTML += `
                        <div class="timeline-node">
                            <div class="timeline-node-dot"></div>
                            <div class="timeline-node-time">${timeStr}</div>
                            <div class="timeline-node-title">${logMeta.label}</div>
                            <div class="timeline-node-desc">Lokasi: <strong>${escapePortalHTML(log.location)}</strong><br>${log.status === "completed" && item.payment_status === "requires_reconciliation" ? "Catatan historis memerlukan rekonsiliasi pembayaran." : escapePortalHTML(log.notes)}</div>
                        </div>
                    `;
                });
            }

            timelineList.innerHTML += `
                <div class="tracking-next-step">
                    <strong>Langkah berikutnya</strong>
                    <span>${statusMeta.nextAction}</span>
                </div>
            `;

            container.style.display = 'block';
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Tidak Ditemukan',
                text: 'Nomor tracking tidak terdaftar.',
                confirmButtonColor: '#10b981'
            });
        }
    })
    .catch(err => {
        Swal.fire({
            icon: 'error',
            title: 'Kesalahan',
            text: 'Gagal terhubung ke server.',
            confirmButtonColor: '#10b981'
        });
    });
}

// 7. Update Settings Form
const settingsForm = document.getElementById('settings-profile-form');
if (settingsForm) {
    settingsForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const payload = {
            name: document.getElementById('settings-name').value.trim(),
            phone: document.getElementById('settings-phone').value.trim(),
            address: document.getElementById('settings-address').value.trim(),
            payout_method: document.getElementById('settings-payout-method').value,
            payout_account_name: document.getElementById('settings-payout-name').value.trim(),
            payout_account_number: document.getElementById('settings-payout-number').value.trim()
        };

        if (!payload.name) {
            Swal.fire({
                icon: 'warning',
                title: 'Nama Belum Diisi',
                text: 'Nama lengkap wajib diisi.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        if (payload.payout_method && payload.payout_method !== 'cash' && (!payload.payout_account_name || !payload.payout_account_number)) {
            Swal.fire({
                icon: 'warning',
                title: 'Data Payout Belum Lengkap',
                text: 'Isi nama penerima dan nomor rekening/e-wallet untuk metode payout non-tunai.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        const submitBtn = this.querySelector('button[type="submit"]');
        const originalHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

        portalFetch('api/user/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                populateProfileFields(data.data);
                document.getElementById('hero-welcome').innerText = `Halo, ${data.data.name}!`;
                document.getElementById('user-display-name').innerText = data.data.name;
                document.getElementById('profile-avatar').innerText = data.data.name.substring(0, 2).toUpperCase();
                Swal.fire({
                    icon: 'success',
                    title: 'Profil Disimpan',
                    text: 'Data tujuan pembayaran tersimpan di profil Anda.',
                    confirmButtonColor: '#10b981'
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Gagal',
                    text: data.message,
                    confirmButtonColor: '#10b981'
                });
            }
        })
        .catch(err => {
            Swal.fire({
                icon: 'error',
                title: 'Kesalahan',
                text: 'Gagal menghubungi server.',
                confirmButtonColor: '#10b981'
            });
        })
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        });
    });
}

// 8. Render Chart.js
function renderChart(monthlyWeights) {
    const ctx = document.getElementById('monthlyWasteChart');
    if (!ctx) return;

    const labels = Object.keys(monthlyWeights).reverse();
    const weights = Object.values(monthlyWeights).reverse();

    // Fallback if empty
    if (labels.length === 0) {
        labels.push('Mei');
        weights.push(0);
    }

    if (monthlyChart) {
        monthlyChart.destroy();
    }

    monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Berat Sampah (KG)',
                data: weights,
                backgroundColor: '#8faa73',
                borderRadius: 3,
                barThickness: 24
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
    syncCategoryCards(formCat ? formCat.value : 'Small Gadgets');
    calculateFormPreview();
});
