let userTrackingMap;
const bandungMapCenter = [-6.9175, 107.6191];

function initUserTrackingMap() {
    const element = document.getElementById('user-tracking-map');
    if (!element?.offsetWidth) return;
    if (!window.L) {
        document.getElementById('user-map-load-status').textContent = 'Peta belum dapat dimuat. Kamu tetap dapat membuka peta penuh melalui tautan di bawah.';
        return;
    }
    if (userTrackingMap) {
        userTrackingMap.invalidateSize({pan: false});
        return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    userTrackingMap = L.map(element, {scrollWheelZoom: false, zoomControl: false, fadeAnimation: !reducedMotion, zoomAnimation: !reducedMotion}).setView(bandungMapCenter, 11);
    L.control.zoom({position: 'topright', zoomInTitle: 'Perbesar peta', zoomOutTitle: 'Perkecil peta'}).addTo(userTrackingMap);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(userTrackingMap);
    tiles.on('tileerror', () => {
        document.getElementById('user-map-load-status').textContent = 'Sebagian peta gagal dimuat. Periksa koneksi internet atau buka peta penuh.';
    });
    new ResizeObserver(() => {
        if (element.offsetWidth) userTrackingMap.invalidateSize({pan: false});
    }).observe(element);
}

function showPickupOnUserMap(pickup) {
    const address = String(pickup.pickup_address || '').trim();
    document.getElementById('user-map-address').textContent = address || 'Alamat penjemputan belum tersedia.';
    document.getElementById('user-map-tracking').textContent = pickup.tracking_number;
    const link = document.getElementById('user-map-address-link');
    link.hidden = !address;
    if (address) {
        const url = new URL('https://www.google.com/maps/search/');
        url.searchParams.set('api', '1');
        url.searchParams.set('query', address);
        link.href = url.href;
    } else {
        link.removeAttribute('href');
    }
    // The API supplies an address only; no fabricated pickup/collector markers or routes.
    initUserTrackingMap();
}

document.getElementById('user-map-reset').addEventListener('click', () => {
    initUserTrackingMap();
    if (userTrackingMap) userTrackingMap.setView(bandungMapCenter, 11, {animate: false});
});
