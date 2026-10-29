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
        label: 'Menunggu Kolektor',
        icon: 'fa-clock',
        description: 'Pengajuan diterima dan sedang menunggu kolektor mengambil tugas.',
        nextAction: 'Berikutnya: kolektor menerima pickup.'
    },
    pickup: {
        label: 'Kolektor Ditugaskan',
        icon: 'fa-truck-pickup',
        description: 'Kolektor sudah mengambil tugas dan akan menuju alamat penjemputan.',
        nextAction: 'Berikutnya: barang dijemput dan dibawa menuju hub.'
    },
    transit: {
        label: 'Menuju Hub',
        icon: 'fa-truck-fast',
        description: 'Sampah sedang dalam perjalanan menuju Recycling Hub.',
        nextAction: 'Berikutnya: barang diterima oleh hub.'
    },
    arrived: {
        label: 'Menunggu Payout',
        icon: 'fa-clipboard-check',
        description: 'Sampah sudah tiba di hub dan menunggu validasi payout admin.',
        nextAction: 'Berikutnya: admin memproses reward.'
    },
    completed: {
        label: 'Selesai Dibayar',
        icon: 'fa-circle-check',
        description: 'Pickup selesai dan reward sudah diproses.',
        nextAction: 'Proses selesai.'
    },
    cancelled: {
        label: 'Dibatalkan',
        icon: 'fa-ban',
        description: 'Pengajuan dibatalkan sebelum kolektor mengambil tugas.',
        nextAction: 'Buat pengajuan baru jika masih ingin menyetor sampah.'
    }
};

function getPickupNetReward(item) {
    if (item.final_eco_reward && item.final_processing_fee) {
        return Number.parseFloat(item.final_eco_reward) - Number.parseFloat(item.final_processing_fee);
    }
    return Number.parseFloat(item.eco_reward) - Number.parseFloat(item.processing_fee);
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
function calculateFormPreview() {
    const categorySelect = document.getElementById('form-waste-category');
    const weightInput = document.getElementById('form-waste-weight');
    
    if (!categorySelect || !weightInput) return;

    const weight = Number.parseFloat(weightInput.value) || 0;
    
    const category = categorySelect.value;
    const config = categoryConfig[category] || categoryConfig['Small Gadgets'];

    const gross = weight * config.rate;
    const fee = weight * config.feePerKg;
    const net = gross - fee;
    const carbon = (weight * 2.5).toFixed(1);
    document.getElementById("category-handling-note").textContent = config.note;

    const formatter = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    });

    document.getElementById('preview-gross-reward').innerText = formatter.format(gross);
    document.getElementById('preview-fee').innerText = formatter.format(fee);
    document.getElementById('preview-net-reward').innerText = formatter.format(net);
    document.getElementById('preview-carbon').innerText = carbon;
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
    localStorage.removeItem('user');
    window.location.href = 'login';
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

function getUserAuthHeaders() {
    const userSession = localStorage.getItem('user');
    if (!userSession) return null;
    const user = JSON.parse(userSession);
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + user.token
    };
}

async function editPendingPickup(encodedItem) {
    const item = JSON.parse(decodeURIComponent(encodedItem));
    const result = await Swal.fire({
        title: 'Edit Pengajuan Pending',
        html: `
            <div style="text-align:left;">
                <label class="swal-form-label">Deskripsi barang</label>
                <textarea id="edit-item-description" class="swal2-textarea" style="margin:0 0 10px; width:100%;">${item.item_description || ''}</textarea>
                <label class="swal-form-label">Alamat penjemputan</label>
                <textarea id="edit-pickup-address" class="swal2-textarea" style="margin:0 0 10px; width:100%;">${item.pickup_address || ''}</textarea>
                <label class="swal-form-label">Nomor HP / WhatsApp</label>
                <input id="edit-contact-phone" class="swal2-input" style="margin:0 0 10px; width:100%;" value="${item.contact_phone || ''}">
                <label class="swal-form-label">Kategori</label>
                <select id="edit-category" class="swal2-select" style="margin:0 0 10px; width:100%;">
                    ${Object.keys(categoryConfig).map(category => `<option value="${category}" ${item.category_name === category ? 'selected' : ''}>${categoryConfig[category].label}</option>`).join('')}
                </select>
                <label class="swal-form-label">Estimasi berat (KG)</label>
                <input id="edit-weight" type="number" min="0.1" step="0.1" class="swal2-input" style="margin:0; width:100%;" value="${item.weight_kg || ''}">
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
    const headers = getUserAuthHeaders();
    if (!headers) return;

    fetch('api/ecorecycle/update_pickup', {
        method: 'POST',
        headers,
        body: JSON.stringify(result.value)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            Swal.fire({ icon: 'success', title: 'Pengajuan Diperbarui', text: 'Perubahan berhasil disimpan sebelum pickup diambil kolektor.', confirmButtonColor: '#10b981' });
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
            <p style="color:#475569;">Pengajuan <strong>${trackingNumber}</strong> hanya bisa dibatalkan selama masih menunggu kolektor.</p>
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

    const headers = getUserAuthHeaders();
    if (!headers) return;

    fetch('api/ecorecycle/cancel_pickup', {
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
            Swal.fire({ icon: 'success', title: 'Pengajuan Dibatalkan', text: 'Pickup dibatalkan dan tidak akan masuk antrean kolektor.', confirmButtonColor: '#10b981' });
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

function mergeSessionUser(profile) {
    const userSession = localStorage.getItem('user');
    if (!userSession || !profile) return;
    const current = JSON.parse(userSession);
    const merged = { ...current, ...profile, token: current.token };
    localStorage.setItem('user', JSON.stringify(merged));
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

function loadUserProfileSettings() {
    const userSession = localStorage.getItem('user');
    if (!userSession) return;
    const user = JSON.parse(userSession);

    fetch('api/user/profile', {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + user.token
        }
    })
    .then(res => {
        if (res.status === 401) logoutUser();
        return res.json();
    })
    .then(data => {
        if (data.status === 'success') {
            mergeSessionUser(data.data);
            populateProfileFields(data.data);
        }
    })
    .catch(err => console.error('Error loading profile:', err));
}

function renderUserHistoryRow(item) {
    const weight = Number.parseFloat(item.weight_kg);
    const netReward = getPickupNetReward(item);
    const dateObj = new Date(item.created_at);
    const dateStr = dateObj.getDate() + ' ' + dateObj.toLocaleString('id-ID', {month: 'short'}) + ' ' + dateObj.getFullYear();
    const statusMeta = getPickupStatusMeta(item.status);
    const badgeClass = getStatusBadgeClass(item.status);
    return `
                    <tr>
                        <td style="padding: 16px;">${dateStr}</td>
                        <td style="padding: 16px;"><strong>${item.tracking_number}</strong></td>
                        <td style="padding: 16px;">${item.category_name}</td>
                        <td style="padding: 16px; font-weight:700;">${weight} KG</td>
                        <td style="padding: 16px; font-weight:800; color:#087443;">Rp ${netReward.toLocaleString('id-ID')}</td>
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
                        <button type="button" class="btn btn-outline pickup-flow-track-btn" onclick="editPendingPickup('${encodedItem}')">Edit</button>
                        <button type="button" class="btn btn-outline pickup-flow-track-btn danger" onclick="cancelPendingPickup('${item.tracking_number}')">Batalkan</button>
                    ` : '';
    return `
                        <div class="active-pickup-card pickup-flow-card">
                            <div class="pickup-flow-card-main">
                                <span style="font-size:0.75rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase;">No. Tracking</span>
                                <h4 style="font-weight:900; color:var(--brand-dark); margin:2px 0;">${item.tracking_number}</h4>
                                <p style="font-size:0.8rem; color:var(--text-secondary); margin:4px 0 0 0;">${item.category_name} • ${weight} KG</p>
                            </div>
                            <div class="pickup-flow-card-status">
                                <div class="pickup-flow-icon"><i class="fas ${statusMeta.icon}"></i></div>
                                <div class="pickup-flow-copy">
                                    <span class="status-badge ${badgeClass}">${statusMeta.label}</span>
                                    <p>${statusMeta.description}</p>
                                    <small>${statusMeta.nextAction}</small>
                                </div>
                                <button type="button" class="btn btn-outline pickup-flow-track-btn" onclick="openTrackingDetail('${item.tracking_number}')">Lacak</button>
                                ${pendingActions}
                            </div>
                        </div>
                    `;
}

function summarizeUserPickups(pickups) {
    const summary = {totalWeight: 0, totalCarbon: 0, totalReward: 0, activeHtml: '', historyHtml: '', monthlyWeights: {}};
    for (const item of pickups) {
        const weight = Number.parseFloat(item.weight_kg);
        summary.totalWeight += weight;
        summary.totalCarbon += weight * 2.5;
        if (item.status === 'completed') summary.totalReward += getPickupNetReward(item);
        const month = new Date(item.created_at).toLocaleString('id-ID', {month: 'short'});
        summary.monthlyWeights[month] = (summary.monthlyWeights[month] || 0) + weight;
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
    message.innerHTML = 'Penjemputan <strong>' + item.tracking_number + '</strong> dalam status: <strong>' + item.status.toUpperCase() + '</strong>.';
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
    if (summary.activeHtml) showPickupNotification(pickups[0]);
    renderChart(summary.monthlyWeights);
}

// 4. Load User Data & Pickups
function loadDashboardData() {
    const userSession = localStorage.getItem('user');
    if (!userSession) {
        window.location.href = 'login';
        return;
    }

    const user = JSON.parse(userSession);
    
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
    loadUserProfileSettings();

    // Fetch Pickups from API
    fetch('api/ecorecycle/list_pickups?type=user', {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + user.token
        }
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

        const userSession = localStorage.getItem('user');
        if (!userSession) return;
        const user = JSON.parse(userSession);

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

        fetch('api/ecorecycle/request_pickup', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + user.token
            },
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                Swal.fire({
                    icon: 'success',
                    title: 'Permohonan Berhasil!',
                    html: `Nomor Tracking: <strong>${data.data.tracking_number}</strong><br>Kolektor kami akan segera menghubungi Anda.`,
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

    const userSession = localStorage.getItem('user');
    if (!userSession) return;
    const user = JSON.parse(userSession);

    fetch(`api/ecorecycle/pickup_status?tracking_number=${trackingNum}`, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + user.token
        }
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

            document.getElementById('track-disp-detail').innerText = `${item.category_name} • ${item.weight_kg} KG`;

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
                            <div class="timeline-node-desc">Lokasi: <strong>${log.location}</strong><br>${log.notes}</div>
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

        const userSession = localStorage.getItem('user');
        if (!userSession) return;
        const user = JSON.parse(userSession);

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

        fetch('api/user/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + user.token
            },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                mergeSessionUser(data.data);
                populateProfileFields(data.data);
                document.getElementById('hero-welcome').innerText = `Halo, ${data.data.name}!`;
                document.getElementById('user-display-name').innerText = data.data.name;
                document.getElementById('profile-avatar').innerText = data.data.name.substring(0, 2).toUpperCase();
                Swal.fire({
                    icon: 'success',
                    title: 'Profil Disimpan',
                    text: 'Data payout sudah siap digunakan admin saat reward dicairkan.',
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
