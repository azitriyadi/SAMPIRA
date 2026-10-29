// EcoRecycle Collector Portal Logic

let map;
let activeTrackingNum = null;
let globalActiveMission = null;

const upcomingList = document.getElementById('upcoming-task-list');
const historyBody = document.getElementById('history-table-body');

const collectorStatusMeta = {
    pending: {
        label: 'Menunggu Diambil',
        shortLabel: 'ANTREAN',
        description: 'Tugas baru dari Eco Warrior, belum diambil kolektor.',
        nextAction: 'Ambil tugas jika area penjemputan sesuai.'
    },
    pickup: {
        label: 'Siap Dijemput',
        shortLabel: 'JEMPUT',
        description: 'Tugas sudah menjadi milik Anda. Datangi alamat donor dan ambil sampah.',
        nextAction: 'Klik Mulai Transit setelah barang sudah diambil.'
    },
    transit: {
        label: 'Menuju Hub',
        shortLabel: 'MENUJU HUB',
        description: 'Sampah sedang Anda bawa menuju Recycling Hub.',
        nextAction: 'Klik Tiba di Hub setelah barang diterima hub.'
    },
    arrived: {
        label: 'Menunggu Admin',
        shortLabel: 'TIBA DI HUB',
        description: 'Barang sudah tiba di hub dan menunggu validasi payout admin.',
        nextAction: 'Tidak ada aksi kolektor berikutnya.'
    },
    completed: {
        label: 'Selesai',
        shortLabel: 'SELESAI',
        description: 'Pickup sudah selesai dan reward diproses admin.',
        nextAction: 'Misi masuk riwayat.'
    }
};

function getCollectorStatusMeta(status) {
    return collectorStatusMeta[status] || collectorStatusMeta.pending;
}

function getPickupNetReward(item) {
    if (item.final_eco_reward && item.final_processing_fee) {
        return Number.parseFloat(item.final_eco_reward) - Number.parseFloat(item.final_processing_fee);
    }
    return Number.parseFloat(item.eco_reward) - Number.parseFloat(item.processing_fee);
}

function initMap() {
    try {
        const mapElement = document.getElementById('map');
        if (!mapElement) return;
        if (map) { map.remove(); }
        if (typeof L === 'undefined') return;

        // Center on Bandung City
        map = L.map('map', { zoomControl: false }).setView([-6.9175, 107.6191], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        if (globalActiveMission) {
            // Draw route between Collector and Donor
            const collIcon = L.divIcon({ className: 'marker-coll', html: '<div style="background:#10b981; width:14px; height:14px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(16,185,129,0.5);"></div>' });
            const donorIcon = L.divIcon({ className: 'marker-donor', html: '<div style="background:#064e3b; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(6,78,59,0.5);"></div>' });

            const hash = Array.from(globalActiveMission.tracking_number).reduce((acc, char) => acc + char.codePointAt(0), 0);
            const latOffset1 = ((hash % 80) - 40) / 10000;
            const lngOffset1 = (((hash * 2) % 80) - 40) / 10000;
            const latOffset2 = (((hash * 3) % 80) - 40) / 10000;
            const lngOffset2 = (((hash * 5) % 80) - 40) / 10000;

            const p1 = [-6.9175 + latOffset1, 107.6191 + lngOffset1]; // Mock Collector Location
            const p2 = [-6.9250 + latOffset2, 107.6300 + lngOffset2]; // Mock Donor Location

            L.marker(p1, { icon: collIcon }).addTo(map).bindPopup('Lokasi Anda (Kolektor)');
            L.marker(p2, { icon: donorIcon }).addTo(map).bindPopup(`Pengirim (Masyarakat): ${globalActiveMission.donor_name}`);

            const polyline = L.polyline([p1, p2], { color: '#10b981', weight: 4, dashArray: '6, 12' }).addTo(map);
            map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
        }

        setTimeout(() => { map.invalidateSize(); }, 400);
    } catch (e) {
        console.error("Map initialization failed:", e);
    }
}

function switchView(viewId, element) {
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) {
        target.classList.add('active');
        if (viewId === 'dashboard') setTimeout(initMap, 100);
    }

    document.querySelectorAll('.sidebar-item, .nav-item').forEach(item => item.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    } else {
        const navItems = document.querySelectorAll('.sidebar-item, .nav-item');
        navItems.forEach(item => {
            const text = item.innerText.toLowerCase();
            const matchesView = text.includes(viewId.replace('-', ' '));
            const matchesHome = viewId === 'dashboard' && (text.includes('home') || text.includes('beranda'));
            if (matchesView || matchesHome) item.classList.add('active');
        });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openActiveMission() {
    if (globalActiveMission) {
        viewActiveMission(globalActiveMission);
    } else {
        Swal.fire({
            icon: 'info',
            title: 'Tidak Ada Misi Aktif',
            text: 'Saat ini Anda tidak memiliki misi penjemputan aktif. Silakan ambil tugas dari Antrean.',
            confirmButtonColor: '#126048'
        });
        switchView('dashboard');
    }
}

function viewActiveMission(item) {
    activeTrackingNum = item.tracking_number;
    globalActiveMission = item;
    const statusMeta = getCollectorStatusMeta(item.status);
    
    document.getElementById('mission-resi').innerText = item.tracking_number;
    document.getElementById('mission-status').innerText = statusMeta.label;
    document.getElementById('mission-status').dataset.status = item.status;

    const statusOrder = ['pickup', 'transit', 'arrived'];
    const currentStatusIndex = statusOrder.indexOf(item.status);
    document.querySelectorAll('.mission-progress-step').forEach((step, index) => {
        step.classList.toggle('completed', index < currentStatusIndex);
        step.classList.toggle('current', index === currentStatusIndex);
    });

    document.getElementById('mission-dest').innerText = item.pickup_address;
    document.getElementById('mission-details').innerHTML = `
        <dl class="mission-detail-list">
            <div><dt>Kategori</dt><dd>${item.category_name}</dd></div>
            <div><dt>Deskripsi</dt><dd>${item.item_description}</dd></div>
            <div><dt>Estimasi berat</dt><dd>${item.weight_kg} KG</dd></div>
            <div><dt>Donor</dt><dd>${item.donor_name} &middot; ${item.contact_phone}</dd></div>
            <div class="mission-next-action"><dt>Arahan berikutnya</dt><dd>${statusMeta.nextAction}</dd></div>
        </dl>
    `;

    const btn = document.getElementById('mission-btn');
    if (btn) {
        if (item.status === 'pickup') {
            btn.innerHTML = '<i class="fas fa-truck-fast"></i> Mulai Transit (Bawa Sampah ke Hub)';
            btn.style.background = '#276e57';
            btn.onclick = () => updateMissionStatus(item.tracking_number, 'transit', 'Di Perjalanan', 'Limbah telah diangkut oleh kolektor menuju Recycling Hub.');
        } else if (item.status === 'transit') {
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Selesai Verifikasi & Tiba di Hub';
            btn.style.background = '#087443';
            btn.onclick = () => updateMissionStatus(item.tracking_number, 'arrived', 'Recycling Hub Bandung', 'Sampah telah tiba di Recycling Hub dan siap diverifikasi admin untuk payout.');
        } else if (item.status === 'arrived') {
            btn.innerHTML = '<i class="fas fa-clipboard-check"></i> Menunggu Payout Admin';
            btn.style.background = '#64748b';
            btn.onclick = null;
        }
    }
    switchView('active-mission');
}

function openMissionRoute() {
    if (!globalActiveMission?.pickup_address) {
        Swal.fire({
            icon: 'info',
            title: 'Alamat Belum Tersedia',
            text: 'Pilih misi aktif terlebih dahulu untuk membuka rute.',
            confirmButtonColor: '#087a5b'
        });
        return;
    }

    const destination = encodeURIComponent(globalActiveMission.pickup_address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank', 'noopener,noreferrer');
}

async function updateMissionStatus(trackingNum, newStatus, location, notes) {
    const session = localStorage.getItem('user');
    if (!session) return;
    const user = JSON.parse(session);
    const result = await Swal.fire({title: 'Konfirmasi Perubahan Status', text: 'Ubah status penjemputan ' + trackingNum + ' menjadi ' + newStatus.toUpperCase() + '?', icon: 'question', showCancelButton: true, confirmButtonColor: '#126048', cancelButtonColor: '#64748b', confirmButtonText: 'Ya, Update!', cancelButtonText: 'Batal'});
    if (!result.isConfirmed) return;
    try {
        const response = await fetch('api/ecorecycle/pickup_status', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token}, body: JSON.stringify({tracking_number: trackingNum, status: newStatus, location, notes})});
        const data = await response.json();
        if (data.status !== 'success') {
            await Swal.fire({icon: 'error', title: 'Gagal', text: data.message, confirmButtonColor: '#126048'});
            return;
        }
        await Swal.fire({icon: 'success', title: 'Berhasil', text: 'Status misi berhasil diperbarui!', timer: 1500, showConfirmButton: false});
        loadCollectorData();
        switchView('dashboard');
    } catch {
        await Swal.fire({icon: 'error', title: 'Kesalahan', text: 'Gagal terhubung ke server.', confirmButtonColor: '#126048'});
    }
}

async function claimPickup(trackingNum) {
    const session = localStorage.getItem('user');
    if (!session) return;
    const user = JSON.parse(session);
    const result = await Swal.fire({title: 'Ambil Tugas Penjemputan', text: 'Apakah Anda bersedia menjemput sampah ' + trackingNum + '?', icon: 'question', showCancelButton: true, confirmButtonColor: '#126048', cancelButtonColor: '#64748b', confirmButtonText: 'Ya, Jemput!', cancelButtonText: 'Batal'});
    if (!result.isConfirmed) return;
    try {
        const response = await fetch('api/ecorecycle/assign_collector', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token}, body: JSON.stringify({tracking_number: trackingNum})});
        const data = await response.json();
        if (data.status !== 'success') {
            await Swal.fire({icon: 'error', title: 'Gagal', text: data.message, confirmButtonColor: '#126048'});
            return;
        }
        await Swal.fire({icon: 'success', title: 'Tugas Diambil!', text: 'Silakan lihat rincian alamat penjemputan masyarakat di tab Misi Aktif.', confirmButtonColor: '#126048'});
        loadCollectorData();
    } catch {
        await Swal.fire({icon: 'error', title: 'Kesalahan', text: 'Gagal menghubungi server.', confirmButtonColor: '#126048'});
    }
}

function renderCollectorHistory(item) {
    const commission = getPickupNetReward(item) * 0.1;
    const statusMeta = getCollectorStatusMeta(item.status);
    const dateObj = new Date(item.created_at);
    const dateStr = dateObj.getDate() + ' ' + dateObj.toLocaleString('id-ID', {month: 'short'}) + ' ' + dateObj.getFullYear();
    return `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 16px; font-weight: 800; color:#064e3b;">${item.tracking_number}</td>
                            <td style="padding: 16px;">${dateStr}</td>
                            <td style="padding: 16px; font-weight: 800; color: #087443;">+Rp ${commission.toLocaleString('id-ID')}</td>
                            <td style="padding: 16px;"><span class="status-pill success" style="background:#f0fdf4; color:#15803d; font-weight:800; padding:4px 12px; border-radius:50px; font-size:0.75rem;">${statusMeta.label}</span></td>
                        </tr>
                    `;
}

function renderAssignedCollectorTask(item) {
    const statusMeta = getCollectorStatusMeta(item.status);
    const colors = {transit: ['#276e57', '#f0fdfa'], arrived: ['#15803d', '#f0fdf4']};
    const [badgeColor, badgeBg] = colors[item.status] || ['#1d4ed8', '#eff6ff'];
    return `
                            <button type="button" class="task-item" data-mission="${encodeURIComponent(JSON.stringify(item))}" onclick="viewActiveMission(JSON.parse(decodeURIComponent(this.dataset.mission)))">
                                <div style="display:flex; align-items:center; gap:14px;">
                                    <div style="background:#ecfdf5; color: #087443; width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;"><i class="fas fa-truck-pickup"></i></div>
                                    <div>
                                        <div style="font-weight:900; font-size: 0.9rem; color:#064e3b;">${item.tracking_number}</div>
                                        <div style="font-size:0.75rem; color:#64748b;">${item.pickup_address.substring(0,25)}...</div>
                                    </div>
                                </div>
                                <span style="background:${badgeBg}; color:${badgeColor}; font-weight:800; padding:4px 10px; border-radius:50px; font-size:0.7rem;">${statusMeta.shortLabel}</span>
                            </button>
                        `;
}

function renderOpenCollectorTask(item) {
    const statusMeta = getCollectorStatusMeta(item.status);
    return `
                            <div class="task-item" style="cursor:default;">
                                <div style="display:flex; align-items:center; gap:14px; flex:1;">
                                    <div style="background:#fffbeb; color: #8a5315; width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;"><i class="fas fa-hand-holding-hand"></i></div>
                                    <div style="flex:1;">
                                        <div style="font-weight:900; font-size: 0.9rem; color:#064e3b;">${item.tracking_number}</div>
                                        <div style="font-size:0.75rem; color:#64748b;">${item.pickup_address.substring(0,25)}... (${item.weight_kg} KG)</div>
                                        <div style="font-size:0.72rem; color: #8a5315; font-weight:800; margin-top:3px;">${statusMeta.nextAction}</div>
                                    </div>
                                </div>
                                <button type="button" class="btn-primary" style="padding: 8px 16px; font-size: 0.75rem; border-radius: 8px; width:auto; border:none;" onclick="claimPickup('${item.tracking_number}')">AMBIL</button>
                            </div>
                        `;
}

function summarizeCollectorPickups(list, userId) {
    const result = {weight: 0, commission: 0, historyHtml: '', tasksHtml: '', activeMission: null};
    for (const item of list) {
        if (item.status === 'completed') {
            result.weight += Number.parseFloat(item.weight_kg);
            result.commission += getPickupNetReward(item) * 0.1;
            result.historyHtml += renderCollectorHistory(item);
        } else if (String(item.collector_id) === String(userId)) {
            if (['pickup', 'transit'].includes(item.status)) result.activeMission = item;
            result.tasksHtml += renderAssignedCollectorTask(item);
        } else if (item.status === 'pending') {
            result.tasksHtml += renderOpenCollectorTask(item);
        }
    }
    return result;
}

function renderCollectorDashboard(list, userId) {
    const result = summarizeCollectorPickups(list, userId);
    globalActiveMission = result.activeMission;
    document.getElementById('stat-packages').innerText = result.weight.toFixed(1) + ' KG';
    document.getElementById('stat-profit').innerText = 'Rp ' + result.commission.toLocaleString('id-ID');
    document.getElementById('earnings-total').innerText = 'Rp ' + result.commission.toLocaleString('id-ID');
    if (upcomingList) upcomingList.innerHTML = result.tasksHtml || '<div style="text-align:center; padding:20px; color:#64748b;">Tidak ada antrean pickup tersedia.</div>';
    if (historyBody) historyBody.innerHTML = result.historyHtml || '<tr><td colspan="4" style="text-align:center; padding:16px; color:#64748b;">Belum ada riwayat misi penjemputan selesai.</td></tr>';
    initMap();
}

function loadCollectorData() {
    const userSession = localStorage.getItem('user');
    if (!userSession) {
        window.location.href = 'login';
        return;
    }
    const user = JSON.parse(userSession);

    if (user.role !== 'collector') {
        window.location.href = 'login';
        return;
    }

    // Set UI Profile Info
    document.getElementById('desktop-greeting').innerText = `Selamat bertugas, Kolektor ${user.name}. Siap menyelamatkan bumi hari ini?`;
    document.getElementById('mobile-name').innerText = user.name;
    document.getElementById('profile-name').innerText = user.name;
    document.getElementById('mobile-avatar').innerText = user.name.substring(0, 2).toUpperCase();
    document.getElementById('profile-avatar-large').innerText = user.name.substring(0, 2).toUpperCase();

    // Fetch Collector Pickups
    fetch('api/ecorecycle/list_pickups?type=collector', {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + user.token
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') renderCollectorDashboard(data.data, user.id);
    })
    .catch(err => {
        console.error('Error loading collector data:', err);
    });
}

function logoutCollector() {
    localStorage.removeItem('user');
    window.location.href = 'login';
}

// Global Exports
window.switchView = switchView;
window.openActiveMission = openActiveMission;
window.claimPickup = claimPickup;
window.logoutCollector = logoutCollector;

document.addEventListener('DOMContentLoaded', loadCollectorData);
