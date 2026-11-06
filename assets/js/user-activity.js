import {base, request} from "./facility-api.js";
import {statuses} from "./facility-report-ui.js";
import {locationPoint} from "./location-routing.js";

const canvas = document.getElementById("own-location-map");
const home = document.getElementById("beranda");
const status = document.getElementById("own-map-status");
const recent = document.getElementById("sp-recent-activity");
const more = document.getElementById("own-map-more");
const reportCount = document.getElementById("metric-total-reports");
const dateFormat = new Intl.DateTimeFormat("id-ID", {dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Jakarta"});
let map, pins, observer;
let pickups = [];
let reports = [];
let cursor = null;
let revision = 0;
let closed = false;
let pickupState = "loading";
let reportState = "loading";
let tileFailed = false;

function element(tag, text, className) {
    const item = document.createElement(tag);
    if (text) item.textContent = text;
    if (className) item.className = className;
    return item;
}

function goTo(record) {
    if (record.kind === "pickup") {
        window.openTrackingDetail(record.identifier);
        return;
    }
    document.querySelector('.hub-tab[data-target="laporan-fasilitas"]').click();
    window.dispatchEvent(new CustomEvent("sampira:user-report-view", {detail:{view:"detail", id:record.id}}));
}

function recordButton(record) {
    const button = element("button", "Buka detail", "sp-location-detail");
    button.type = "button";
    button.dataset.recordKind = record.kind;
    button.setAttribute("aria-label", "Buka detail " + record.identifier);
    button.addEventListener("click", () => goTo(record));
    return button;
}

function card(record, withAddress) {
    const root = element("div", "", "sp-location-record");
    root.append(element("small", record.kind === "pickup" ? "Penjemputan" : "Laporan fasilitas"));
    root.append(element("strong", record.title));
    if (withAddress) {
        root.append(element("span", record.identifier));
        root.append(element("p", record.address || "Alamat tidak tersedia"));
        if (!record.point) root.append(element("small", "Titik presisi belum tersedia"));
    }
    const date = new Date(record.created);
    root.append(element("small", record.state + (Number.isFinite(date.valueOf()) ? " · " + dateFormat.format(date) : "")));
    root.append(recordButton(record));
    return root;
}

function records() {
    return [
        ...pickups.map(row => ({
            kind:"pickup", identifier:row.tracking_number, title:row.category_name || "Penjemputan sampah",
            address:row.pickup_address, created:row.created_at, state:window.getPickupStatusMeta(row.status).label,
            point:locationPoint(row.latitude, row.longitude)
        })),
        ...reports.map(row => ({
            kind:"facility", id:row.id, identifier:row.tracking_number, title:row.title,
            address:row.address, created:row.created_at, state:statuses[row.status] || "Status belum tersedia",
            point:locationPoint(row.latitude, row.longitude)
        }))
    ].sort((a,b) => Date.parse(b.created) - Date.parse(a.created));
}

function setupMap() {
    if (map || !window.L || !home.classList.contains("active")) return;
    map = L.map(canvas).setView([-6.9175, 107.6191], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).on("tileerror", () => {
        tileFailed = true;
        describe(records());
    }).addTo(map);
    pins = L.layerGroup().addTo(map);
    map.on("zoomend", () => renderPins(records()));
    observer = new ResizeObserver(() => {
        if (!map || !canvas.clientWidth || !canvas.clientHeight) return;
        map.invalidateSize();
        fitMarkers(records());
    });
    observer.observe(canvas);
}

function fitMarkers(items) {
    const points = items.filter(record => record.point).map(record => record.point);
    if (points.length) map.fitBounds(points, {padding:[32,32], maxZoom:15, animate:false});
}

function describe(items) {
    const located = items.filter(record => record.point).length;
    const notices = [];
    if (pickupState === "loading" || reportState === "loading") notices.push("Memuat lokasi…");
    if (pickupState === "error" || reportState === "error") notices.push("Sebagian data gagal dimuat. Buka ulang Beranda untuk mencoba lagi.");
    if (items.length) notices.push(located + " titik presisi dari " + items.length + " aktivitas yang dimuat.");
    else if (!notices.length) notices.push("Belum ada penjemputan atau laporan.");
    if (!map || tileFailed) notices.push("Peta jalan tidak tersedia. Detail aktivitas dapat dibuka melalui riwayat.");
    status.textContent = notices.join(" ");
}

function render() {
    if (closed) return;
    const items = records();
    const rows = items.slice(0, 5).map(record => {
        const item = element("li", "", "sp-location-row sp-location-row--" + record.kind);
        item.append(card(record, false));
        return item;
    });
    recent.replaceChildren(...(items.length ? rows :
        [element("li", pickupState === "loading" || reportState === "loading" ? "Memuat aktivitas…" : "Belum ada aktivitas.")]));
    reportCount.textContent = reportState === "ready" ? String(reports.length) + (cursor ? "+" : "") : "—";
    setupMap();
    describe(items);
    if (!map || !home.classList.contains("active")) return;

    map.invalidateSize();
    fitMarkers(items);
    renderPins(items);
}

function renderPins(items) {
    pins.clearLayers();
    const groups = [];
    for (const item of items.filter(record => record.point)) {
        const pixel = map.project(item.point);
        const group = groups.find(candidate => candidate.pixel.distanceTo(pixel) < 34);
        if (group) group.items.push(item);
        else groups.push({pixel, items:[item]});
    }
    for (const {items:group} of groups) {
        const kinds = ["pickup", "facility"].filter(kind => group.some(record => record.kind === kind));
        const classes = kinds.map(kind => "sp-owned-pin--" + kind);
        const icons = {pickup:"fa-truck", facility:"fa-triangle-exclamation"};
        const iconHtml = kinds.map(kind => '<i aria-hidden="true" class="fas ' + icons[kind] + '"></i>').join("");
        if (group.length > 1) classes.push("sp-owned-pin--group");
        const size = kinds.length > 1 ? [44, 33] : [33, 33];
        const icon = L.divIcon({
            className:"sp-owned-pin " + classes.join(" "),
            html:iconHtml, iconSize:size, iconAnchor:[size[0] / 2, 16]
        });
        const popup = element("div", "", "sp-map-popup");
        popup.append(...group.map(item => card(item, true)));
        L.marker(group[0].point, {icon, alt:group.length > 1 ? group.length + " aktivitas berdekatan" : group[0].identifier,
            title:group.length > 1 ? group.length + " aktivitas berdekatan" : group[0].identifier})
            .bindPopup(popup, {maxWidth:230, maxHeight:180}).addTo(pins);
    }
}

async function loadReports(append = false) {
    const sequence = ++revision;
    const query = new URLSearchParams({limit:"20"});
    if (append && cursor) query.set("before_id", cursor);
    more.disabled = true;
    reportState = "loading";
    describe(records());
    try {
        const page = await request(base + "?" + query);
        if (closed || sequence !== revision) return;
        reports = append ? [...reports, ...page.items] : page.items;
        cursor = page.next_before_id;
        reportState = "ready";
    } catch (error) {
        if (sequence !== revision || closed) return;
        if (error.status === 403) { clear(); return; }
        reportState = "error";
    } finally {
        if (sequence === revision && !closed) {
            more.disabled = false;
            more.hidden = !cursor;
            render();
        }
    }
}

function clear() {
    closed = true;
    revision++;
    pickups = [];
    reports = [];
    observer?.disconnect();
    map?.remove();
    map = null;
    recent.replaceChildren();
    reportCount.textContent = "—";
    status.textContent = "Lokasi hanya tersedia dalam sesi aktif.";
    more.hidden = true;
}

window.addEventListener("sampira:user-pickups", event => {
    if (closed) return;
    pickupState = "ready";
    pickups = event.detail;
    render();
});
window.addEventListener("sampira:user-pickups-failed", () => { pickupState = "error"; render(); });
window.addEventListener("sampira:session-ended", clear);
window.addEventListener("sampira:user-view", event => {
    if (event.detail !== "beranda" || closed) return;
    render();
    loadReports();
});
more.addEventListener("click", () => loadReports(true));
render();
loadReports();
