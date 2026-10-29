// EcoRecycle Admin Command Center Logic

let liveMap;
let financeChart;
let globalPickups = [];
let globalAnnouncements = [];
let globalCollectors = [];
let activeFilterRange = 'all'; // all, today, week, month

const adminStatusMeta = {
    pending: {
        label: 'Perlu Ditugaskan',
        badgeClass: 'status-pending',
        nextAction: 'Tugaskan collector'
    },
    pickup: {
        label: 'Dijadwalkan Pickup',
        badgeClass: 'status-processing',
        nextAction: 'Pantau collector'
    },
    transit: {
        label: 'Menuju Hub',
        badgeClass: 'status-processing',
        nextAction: 'Tunggu tiba di hub'
    },
    arrived: {
        label: 'Siap Payout',
        badgeClass: 'status-processing',
        nextAction: 'Validasi dan cairkan'
    },
    completed: {
        label: 'Selesai Dibayar',
        badgeClass: 'status-success',
        nextAction: 'Selesai'
    },
    cancelled: {
        label: 'Dibatalkan User',
        badgeClass: 'status-cancelled',
        nextAction: 'Tidak diproses'
    }
};

function getAdminStatusMeta(status) {
    return adminStatusMeta[status] || adminStatusMeta.pending;
}

function getPayoutMethodLabel(method) {
    if (method === 'bank') return 'Transfer Bank';
    if (method === 'ewallet') return 'E-Wallet';
    if (method === 'cash') return 'Tunai';
    return 'Belum diisi';
}

function renderPayoutDestination(item) {
    const method = item.payout_method || '';
    if (!method) {
        return '<span class="payout-destination warning">Data payout belum diisi user</span>';
    }
    if (method === 'cash') {
        return '<span class="payout-destination">Tunai saat validasi hub</span>';
    }
    return `
        <div class="payout-destination">
            <strong>${getPayoutMethodLabel(method)}</strong>
            <span>${item.payout_account_name || '-'}</span>
            <small>${item.payout_account_number || '-'}</small>
        </div>
    `;
}

async function loadCollectors() {
    const session = localStorage.getItem('user');
    if (!session) return;
    const user = JSON.parse(session);

    try {
        const response = await fetch('api/users/collectors', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + user.token }
        });
        const result = await response.json();
        if (result.status === 'success') {
            globalCollectors = result.data || [];
        }
    } catch (error) {
        console.error('Error loading collectors:', error);
        globalCollectors = [];
    }
}

function getEstimatedNetReward(item) {
    return Number.parseFloat(item.eco_reward || 0) - Number.parseFloat(item.processing_fee || 0);
}

function isPickupVerified(item) {
    return Boolean(item?.verified_at && item.final_weight_kg != null && item.final_eco_reward != null && item.final_processing_fee != null);
}

function getFinalNetReward(item) {
    if (!isPickupVerified(item)) return getEstimatedNetReward(item);
    return Number.parseFloat(item.final_eco_reward || 0) - Number.parseFloat(item.final_processing_fee || 0);
}

function renderVerificationSummary(item) {
    const estimate = getEstimatedNetReward(item);
    if (!isPickupVerified(item)) {
        return `
            <div class="verification-summary warning">
                <strong>Belum ditimbang final</strong>
                <span>Estimasi user: ${item.weight_kg} KG - Rp ${estimate.toLocaleString('id-ID')}</span>
            </div>
        `;
    }
    const finalNet = getFinalNetReward(item);
    return `
        <div class="verification-summary">
            <strong>Final: ${item.final_weight_kg} KG</strong>
            <span>Reward final: Rp ${finalNet.toLocaleString('id-ID')}</span>
            <small>${item.verification_notes || 'Sudah diverifikasi hub.'}</small>
        </div>
    `;
}

function toggleAdminSidebar() {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').style.display = 'block';
}

function closeAdminSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebarOverlay').style.display = 'none';
}

async function switchAdminTab(targetId) {
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));

    const targetSection = document.getElementById(targetId);
    if (targetSection) targetSection.classList.add('active');

    const sidebarItem = document.querySelector(`.sidebar-item[data-target="${targetId}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');

    if (targetId === 'admin-view') {
        setTimeout(initLiveMap, 200);
    } else if (targetId === 'finance-view') {
        setTimeout(initFinanceChart, 200);
    } else if (targetId === 'content-view') {
        await loadAdminAnnouncements();
    }

    closeAdminSidebar();
}

function logoutAdmin() {
    localStorage.removeItem('user');
    window.location.href = 'login';
}

// 1. Initialize Map
function initLiveMap() {
    try {
        const mapEl = document.getElementById('live-map');
        if (!mapEl) return;
        if (liveMap) liveMap.remove();
        if (typeof L === 'undefined') return;

        liveMap = L.map('live-map', { zoomControl: false }).setView([-6.9175, 107.6191], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(liveMap);

        // Add markers for active pickups (pickup/transit/arrived)
        const activePickups = globalPickups.filter(p => p.status === 'pickup' || p.status === 'transit' || p.status === 'arrived');
        
        activePickups.forEach((item, index) => {
            const hash = Array.from(item.tracking_number).reduce((acc, char) => acc + char.codePointAt(0), 0);
            const latOffset = (((hash * (index + 1)) % 100) - 50) / 10000;
            const lngOffset = (((hash * (index + 2)) % 100) - 50) / 10000;
            
            const markerColors = {arrived: '#15803d', transit: '#0d9488'};
            const markerColor = markerColors[item.status] || '#1d4ed8';
            
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background:${markerColor}; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 10px rgba(0,0,0,0.2);"></div>`
            });

            L.marker([-6.9175 + latOffset, 107.6191 + lngOffset], { icon: customIcon })
                .addTo(liveMap)
                .bindPopup(`<strong>${item.tracking_number}</strong><br>Pengirim (Masyarakat): ${item.donor_name}<br>Status: ${item.status.toUpperCase()}`);
        });

        setTimeout(() => { liveMap.invalidateSize(); }, 400);
    } catch (e) {
        console.error('Failed to initialize admin map:', e);
    }
}

// 2. Load KPIs and Data
async function loadAdminCommandData() {
    const userSession = localStorage.getItem('user');
    if (!userSession) {
        window.location.href = 'login';
        return;
    }
    const user = JSON.parse(userSession);

    if (user.role !== 'admin') {
        window.location.href = 'login';
        return;
    }

    // Set Header profile
    document.getElementById('welcome-message').innerText = `Selamat Datang, ${user.name}`;
    document.getElementById('admin-display-name').innerText = user.name;
    document.getElementById('admin-avatar').innerText = user.name.substring(0, 2).toUpperCase();
    await loadAdminAnnouncements();
    await loadCollectors();

    try {
        const response = await fetch('api/ecorecycle/list_pickups?type=all', {headers: {Authorization: 'Bearer ' + user.token}});
        if (response.status === 401) { logoutAdmin(); return; }
        const result = await response.json();
        if (result.status !== 'success') return;
        globalPickups = result.data;
        renderPickupsTables();
        await loadAdminStats(user);
        initLiveMap();
    } catch (error) {
        console.error('Error loading admin dashboard data:', error);
    }
}
async function loadAdminStats(user) {
    const response = await fetch('api/ecorecycle/pickup_status?type=stats', {headers: {Authorization: 'Bearer ' + user.token}});
    const result = await response.json();
    if (result.status !== 'success') return;
    const stats = result.data;
    document.getElementById('kpi-total-weight').innerText = Number.parseFloat(stats.total_weight).toFixed(1);
    document.getElementById('kpi-total-pickups').innerText = stats.total_pickups;
    document.getElementById('kpi-pending-pickups').innerText = stats.pending_verifications;
    document.getElementById('kpi-active-collectors').innerText = stats.collectors_online;
    const formatter = new Intl.NumberFormat('id-ID', {style: 'currency', currency: 'IDR', minimumFractionDigits: 0});
    document.getElementById('finance-paid-amount').innerText = formatter.format(stats.total_reward_paid);
    document.getElementById('finance-pending-amount').innerText = formatter.format(stats.total_reward_pending);
}

function matchesAdminPickupFilter(item, search, now) {
    if (search && !item.tracking_number.toLowerCase().includes(search)) return false;
    const date = new Date(item.created_at);
    if (activeFilterRange === 'today') return date.toDateString() === now.toDateString();
    if (activeFilterRange === 'week') return Math.ceil(Math.abs(now - date) / 86400000) <= 7;
    if (activeFilterRange === 'month') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    return true;
}
function renderAdminPickupRow(item) {
    const dateObj = new Date(item.created_at);
    const dateStr = dateObj.getDate() + '/' + (dateObj.getMonth() + 1) + '/' + dateObj.getFullYear();
    const statusMeta = getAdminStatusMeta(item.status);
    return `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding:16px; font-weight:800; color:#0f172a;">${item.tracking_number}</td>
                <td style="padding:16px;">${dateStr}</td>
                <td style="padding:16px; font-weight:600;">${item.donor_name}</td>
                <td style="padding:16px;">${item.category_name}</td>
                <td style="padding:16px; font-weight:700;">${item.weight_kg} KG</td>
                <td style="padding:16px; font-weight:600; color:#475569;">${item.collector_name || 'Belum Ditugaskan'}</td>
                <td style="padding:16px;">
                    <span class="status-pill ${statusMeta.badgeClass}">${statusMeta.label}</span>
                    <div style="font-size:0.72rem; color:#64748b; margin-top:5px;">${statusMeta.nextAction}</div>
                </td>
            </tr>
        `;
}
function renderAdminPendingRow(item) {
    if (item.status !== 'pending') return '';
    const statusMeta = getAdminStatusMeta(item.status);
    return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding:12px; font-weight:800; color:#0f172a;">${item.tracking_number}</td>
                    <td style="padding:12px; font-weight:600;">${item.donor_name}</td>
                    <td style="padding:12px;">${item.category_name} • ${item.weight_kg} KG<br><span style="font-size:0.72rem; color:#b45309; font-weight:800;">${statusMeta.nextAction}</span></td>
                    <td style="padding:12px; text-align:right;">
                        <button class="btn btn-primary" style="padding:6px 12px; font-size:0.75rem; border-radius:8px;" onclick="approveAndAssign('${item.tracking_number}')">Terima & Tugaskan</button>
                    </td>
                </tr>
            `;
}
function renderAdminPayoutRow(item) {
    if (!['arrived', 'completed'].includes(item.status)) return '';
    let actionBtn = '<span class="status-pill status-success"><i class="fas fa-check-double"></i> SUDAH DIBAYAR</span>';
    if (item.status === 'arrived') {
        const payoutReady = item.payout_method === 'cash' || (item.payout_method && item.payout_account_name && item.payout_account_number);
        let actionLabel = 'Review Payout';
        if (!isPickupVerified(item)) actionLabel = 'Verifikasi Berat';
        else if (payoutReady) actionLabel = 'Cairkan Payout';
        const background = payoutReady ? '#087a5b' : '#526159';
        actionBtn = '<button class="btn btn-primary" style="padding:6px 12px; font-size:0.75rem; border-radius:8px; background:' + background + ';" onclick="processPayout(' + item.id + ')">' + actionLabel + '</button>';
    }
    return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding:12px; font-weight:800; color:#0f172a;">${item.tracking_number}</td>
                    <td style="padding:12px; font-weight:600;">${item.donor_name}</td>
                    <td style="padding:12px;">${renderPayoutDestination(item)}</td>
                    <td style="padding:12px; font-weight:800; color: #087443;">${renderVerificationSummary(item)}</td>
                    <td style="padding:12px; text-align:right;">${actionBtn}</td>
                </tr>
            `;
}
function setAdminTable(id, markup, columns, emptyText) {
    const body = document.getElementById(id);
    if (body) body.innerHTML = markup || '<tr><td colspan="' + columns + '" style="text-align:center; padding:16px; color:#64748b;">' + emptyText + '</td></tr>';
}
function renderPickupsTables() {
    const search = document.getElementById('admin-search-input').value.toLowerCase().trim();
    const now = new Date();
    const items = globalPickups.filter(item => matchesAdminPickupFilter(item, search, now));
    setAdminTable('pendingPickupsTableBody', items.map(renderAdminPendingRow).join(''), 4, 'Tidak ada permohonan pending baru.');
    setAdminTable('globalPickupsTableBody', items.map(renderAdminPickupRow).join(''), 7, 'Tidak ada data penjemputan terdaftar.');
    setAdminTable('payoutLedgerTableBody', items.map(renderAdminPayoutRow).join(''), 5, 'Tidak ada data penyerahan siap payout.');
}

// Search and Date Filter Handlers
function filterPickupsTable() {
    renderPickupsTables();
}

function setFilterRange(range) {
    activeFilterRange = range;
    
    // Highlight active button style in future if we want
    document.querySelectorAll('.filter-panel button').forEach(btn => {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-outline');
    });

    renderPickupsTables();
}

// 3. Admin Accept & Assign Collector
async function approveAndAssign(trackingNum) {
    const userSession = localStorage.getItem('user');
    if (!userSession) return;
    const user = JSON.parse(userSession);

    if (globalCollectors.length === 0) {
        await loadCollectors();
    }

    if (globalCollectors.length === 0) {
        await Swal.fire({
            icon: 'warning',
            title: 'Belum Ada Kolektor',
            text: 'Tambahkan atau aktifkan akun Eco Collector terlebih dahulu sebelum menugaskan pickup.',
            confirmButtonColor: '#087a5b'
        });
        return;
    }

    const result = await Swal.fire({
        title: 'Terima Permohonan & Tugaskan',
        html: `
            <div style="text-align:left;">
                <p style="margin:0 0 12px; color:#475569;">Pilih Eco Collector yang akan menangani pickup <strong>${trackingNum}</strong>.</p>
                <label for="collector-select" style="display:block; font-weight:800; color:#334155; margin-bottom:6px;">Eco Collector</label>
                <select id="collector-select" class="swal2-select" style="width:100%; margin:0;">
                    ${globalCollectors.map(collector => `
                        <option value="${collector.id}">${collector.name} - ${collector.email}</option>
                    `).join('')}
                </select>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#087a5b',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Tugaskan!',
        cancelButtonText: 'Batal',
        preConfirm: () => {
            const selected = document.getElementById('collector-select').value;
            if (!selected) {
                Swal.showValidationMessage('Pilih kolektor terlebih dahulu.');
                return undefined;
            }
            return selected;
        }
    });
    if (!result.isConfirmed) return;
    try {
        const response = await fetch('api/ecorecycle/assign_collector', {
            method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token},
            body: JSON.stringify({tracking_number: trackingNum, collector_id: result.value})
        });
        const data = await response.json();
        if (data.status !== 'success') {
            await Swal.fire({icon: 'error', title: 'Gagal', text: data.message, confirmButtonColor: '#087a5b'});
            return;
        }
        await Swal.fire({icon: 'success', title: 'Berhasil!', text: 'Tugas penjemputan berhasil diberikan ke Kolektor.', timer: 1500, showConfirmButton: false});
        await loadAdminCommandData();
    } catch {
        await Swal.fire({icon: 'error', title: 'Kesalahan', text: 'Gagal menghubungi server.', confirmButtonColor: '#087a5b'});
    }
}

async function verifyPickupWeight(user, pickup) {
    const result = await Swal.fire({
        title: 'Verifikasi Berat Final',
        html: `
            <div style="text-align:left;">
                <div style="display:block; font-weight:800; color:#334155; margin-bottom:6px;">Berat estimasi user</div>
                <div style="padding:10px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:12px;">${pickup.weight_kg} KG</div>
                <label for="final-weight-input" style="display:block; font-weight:800; color:#334155; margin-bottom:6px;">Berat final hasil timbangan hub (KG)</label>
                <input id="final-weight-input" type="number" min="0.1" step="0.1" value="${pickup.final_weight_kg || pickup.weight_kg || ''}" class="swal2-input" style="margin:0 0 12px; width:100%;" placeholder="Contoh: 4.2">
                <label for="verification-notes-input" style="display:block; font-weight:800; color:#334155; margin-bottom:6px;">Catatan verifikasi</label>
                <textarea id="verification-notes-input" class="swal2-textarea" style="margin:0; width:100%;" placeholder="Contoh: Berat final sesuai hasil timbangan hub.">${pickup.verification_notes || ''}</textarea>
            </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#087a5b',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Simpan Verifikasi',
        cancelButtonText: 'Batal',
        preConfirm: () => {
            const finalWeight = Number.parseFloat(document.getElementById('final-weight-input').value);
            const notes = document.getElementById('verification-notes-input').value.trim();
            if (!finalWeight || finalWeight <= 0) {
                Swal.showValidationMessage('Berat final harus lebih besar dari 0 KG.');
                return undefined;
            }
            return { finalWeight, notes };
        }
    });

    if (!result.isConfirmed) return null;

    const response = await fetch('api/ecorecycle/verify_pickup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + user.token
        },
        body: JSON.stringify({
            pickup_id: pickup.id,
            final_weight_kg: result.value.finalWeight,
            verification_notes: result.value.notes
        })
    });
    const data = await response.json();
    if (data.status !== 'success') {
        throw new Error(data.message || 'Verifikasi berat final gagal.');
    }
    return data.data;
}

// 4. Process Payout with Digital Transfer
async function processPayout(pickupId) {
    const userSession = localStorage.getItem('user');
    if (!userSession) return;
    const user = JSON.parse(userSession);

    const pickup = globalPickups.find(item => Number(item.id) === Number(pickupId));
    if (!pickup) return;

    try {
        if (!isPickupVerified(pickup)) {
            const verification = await verifyPickupWeight(user, pickup);
            if (!verification) return;
            pickup.final_weight_kg = verification.final_weight_kg;
            pickup.final_eco_reward = verification.final_eco_reward;
            pickup.final_processing_fee = verification.final_processing_fee;
            pickup.verification_notes = verification.verification_notes || 'Berat final sudah diverifikasi hub.';
            pickup.verified_at = new Date().toISOString();
        }
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'Verifikasi Gagal',
            text: error.message,
            confirmButtonColor: '#087a5b'
        });
        return;
    }

    const amount = getFinalNetReward(pickup);
    const payoutDestination = renderPayoutDestination(pickup);

    const result = await Swal.fire({
        title: 'Verifikasi & Cairkan Reward',
        html: `Pastikan data timbangan fisik dan tujuan payout sudah benar.<br><br>
            <div style="text-align:left; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px;">
                <strong>Nominal:</strong> Rp ${amount.toLocaleString('id-ID')}<br>
                <strong>Tujuan:</strong><br>${payoutDestination}
            </div>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#087a5b',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Cairkan Dana!',
        cancelButtonText: 'Batal'
    });
    if (!result.isConfirmed) return;
    try {
        const response = await fetch('api/ecorecycle/process_payout', {
            method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token},
            body: JSON.stringify({pickup_id: pickupId})
        });
        const data = await response.json();
        if (data.status !== 'success') {
            await Swal.fire({icon: 'error', title: 'Payout Gagal', text: data.message, confirmButtonColor: '#087a5b'});
            return;
        }
        const ref = data.data.transaction_reference || data.data.bank_reference || '';
        await Swal.fire({icon: 'success', title: 'Payout Sukses!', html: 'Dana berhasil ditransfer.<br>Ref Referensi: <strong>' + ref + '</strong>', confirmButtonColor: '#087a5b'});
        await loadAdminCommandData();
    } catch {
        await Swal.fire({icon: 'error', title: 'Kesalahan', text: 'Gagal terhubung ke server.', confirmButtonColor: '#087a5b'});
    }
}

// 5. Initialize Finance Chart.js
function initFinanceChart() {
    const ctx = document.getElementById('financeChart');
    if (!ctx) return;

    if (financeChart) {
        financeChart.destroy();
    }

    // Process chart values based on completed payouts in database
    const completedPayments = globalPickups.filter(p => p.status === 'completed');
    
    // Group payments by category
    const categoryTotals = {};
    completedPayments.forEach(p => {
        const net = Number.parseFloat(p.eco_reward) - Number.parseFloat(p.processing_fee);
        categoryTotals[p.category_name] = (categoryTotals[p.category_name] || 0) + net;
    });

    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);

    // Fallback if empty
    if (labels.length === 0) {
        labels.push('Gadgets', 'Computers', 'Appliances');
        data.push(50000, 120000, 75000);
    }

    financeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#10b981', '#0d9488', '#0f766e', '#047857', '#059669'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        font: { family: 'Outfit', weight: 'bold' }
                    }
                }
            }
        }
    });
}

async function loadAdminAnnouncements() {
    const session = localStorage.getItem('user');
    const list = document.getElementById('announcement-admin-list');
    if (!session || !list) return;

    try {
        const user = JSON.parse(session);
        const response = await fetch('api/ecorecycle/announcements', {
            headers: { 'Authorization': 'Bearer ' + user.token }
        });
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        globalAnnouncements = result.data || [];
        renderAdminAnnouncements();
    } catch (error) {
        list.innerHTML = '<div class="portal-empty-state">Pengumuman belum dapat dimuat.</div>';
        console.error('Error loading announcements:', error);
    }
}

function renderAdminAnnouncements() {
    const list = document.getElementById('announcement-admin-list');
    const count = document.getElementById('announcement-count');
    if (!list) return;
    if (count) count.innerText = `${globalAnnouncements.length} konten`;

    if (globalAnnouncements.length === 0) {
        list.innerHTML = '<div class="portal-empty-state">Belum ada pengumuman. Buat konten pertama dari formulir.</div>';
        return;
    }

    const escape = window.PortalAnnouncements.escapeHTML;
    const roleLabels = { all: 'Semua peran', user: 'Eco Warrior', collector: 'Eco Collector' };
    list.innerHTML = globalAnnouncements.map(item => {
        const date = new Date(item.created_at).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
        return `
            <article class="cms-announcement-item ${item.is_active ? '' : 'is-inactive'}">
                <div class="cms-announcement-copy">
                    <div class="cms-announcement-meta">
                        <span class="cms-role-tag">${roleLabels[item.target_role] || 'Semua peran'}</span>
                        <span>${date}</span>
                    </div>
                    <h4>${escape(item.title)}</h4>
                    <p>${escape(item.message)}</p>
                </div>
                <div class="cms-announcement-actions">
                    <button type="button" class="cms-icon-btn ${item.is_active ? 'active' : ''}" title="${item.is_active ? 'Nonaktifkan' : 'Aktifkan'}" onclick="toggleAnnouncement(${item.id}, ${!item.is_active})">
                        <i class="fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                    </button>
                    <button type="button" class="cms-icon-btn danger" title="Hapus" onclick="deleteAnnouncement(${item.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </article>
        `;
    }).join('');
}

async function toggleAnnouncement(id, active) {
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        const response = await fetch('api/ecorecycle/announcements', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + user.token
            },
            body: JSON.stringify({ action: 'toggle', id, is_active: active })
        });
        const result = await response.json();
        if (result.status === 'success') {
            await loadAdminAnnouncements();
        } else {
            await Swal.fire({ icon: 'error', title: 'Gagal', text: result.message });
        }
    } catch (error) {
        await Swal.fire({icon: 'error', title: 'Gagal', text: error.message || 'Gagal menghubungi server.'});
    }
}

async function deleteAnnouncement(id) {
    const confirmation = await Swal.fire({
        icon: 'warning',
        title: 'Hapus pengumuman?',
        text: 'Konten akan dihapus dari seluruh portal tujuan.',
        showCancelButton: true,
        confirmButtonText: 'Hapus',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#c34444'
    });
    if (!confirmation.isConfirmed) return;

    try {
        const user = JSON.parse(localStorage.getItem('user'));
        const response = await fetch(`api/ecorecycle/announcements?id=${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + user.token }
        });
        const result = await response.json();
        if (result.status === 'success') {
            loadAdminAnnouncements();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal', text: result.message });
        }
    } catch (error) {
        await Swal.fire({icon: 'error', title: 'Gagal', text: error.message || 'Gagal menghubungi server.'});
    }
}

const announcementForm = document.getElementById('announcement-form');
if (announcementForm) {
    announcementForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const user = JSON.parse(localStorage.getItem('user'));
        const submitButton = this.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            const response = await fetch('api/ecorecycle/announcements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + user.token
                },
                body: JSON.stringify({
                    title: document.getElementById('announcement-title').value.trim(),
                    message: document.getElementById('announcement-message').value.trim(),
                    target_role: document.getElementById('announcement-target').value
                })
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            this.reset();
            await loadAdminAnnouncements();
            await Swal.fire({ icon: 'success', title: 'Diterbitkan', text: 'Pengumuman sudah tampil pada portal tujuan.', timer: 1600, showConfirmButton: false });
        } catch (error) {
            await Swal.fire({ icon: 'error', title: 'Gagal', text: error.message || 'Pengumuman gagal diterbitkan.' });
        } finally {
            submitButton.disabled = false;
        }
    });
}

// Global scope bindings
window.switchAdminTab = switchAdminTab;
window.toggleAdminSidebar = toggleAdminSidebar;
window.closeAdminSidebar = closeAdminSidebar;
window.logoutAdmin = logoutAdmin;
window.approveAndAssign = approveAndAssign;
window.processPayout = processPayout;
window.filterPickupsTable = filterPickupsTable;
window.setFilterRange = setFilterRange;
window.toggleAnnouncement = toggleAnnouncement;
window.deleteAnnouncement = deleteAnnouncement;

document.addEventListener('DOMContentLoaded', loadAdminCommandData);
