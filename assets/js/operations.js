import { base, request } from "./facility-api.js";
import { categories, statuses } from "./facility-report-ui.js";
import { assignmentStatuses, handlingStatuses } from "./facility-handling-ui.js";
import { locationPoint } from "./location-routing.js";

const consoleNav = document.querySelector(".sp-admin-nav");
if (consoleNav) {
    const verify = consoleNav.querySelector("[data-open-verification]");
    const handling = consoleNav.querySelector("[data-open-handling]");
    consoleNav.addEventListener("click", event => {
        const trigger = event.target.closest("button[aria-controls]");
        if (!trigger) return;
        for (const button of consoleNav.querySelectorAll("button[aria-controls]")) {
            const panel = document.getElementById(button.getAttribute("aria-controls"));
            const active = button === trigger;
            if (!active && !panel.hidden) panel.dispatchEvent(new Event("sampira:close"));
            panel.hidden = !active;
            button.setAttribute("aria-pressed", String(active));
            if (active && button !== verify && button !== handling) panel.dispatchEvent(new Event("sampira:open"));
        }
    });
}

const root = document.querySelector("[data-operation-map]");
if (root) {
    const admin = root.dataset.operationMap === "admin";
    const form = root.querySelector("[data-operation-filter]");
    const list = root.querySelector("ul");
    const status = root.querySelector("[role=status]");
    const more = root.querySelector("[data-more]");
    const canvas = root.querySelector("[data-map-canvas]");
    const create = (tag, label, className) => {
        const element = document.createElement(tag);
        element.textContent = label || "";
        if (className) element.className = className;
        return element;
    };
    root.querySelector("[data-map-heading]").textContent = admin ? "Monitoring lokasi fasilitas" : "Peta operasional Petugas";
    root.querySelector("[data-map-intro]").textContent = admin
        ? "Pantau lokasi laporan dan penanganannya dari data yang tersedia. Pilih titik atau baris untuk membuka detail."
        : "Lihat penjemputan yang kamu ambil dan fasilitas yang ditugaskan kepadamu. Buka detail tugas untuk memeriksa tujuan dan rute.";
    form.elements.category.append(new Option("Semua", ""), ...Object.entries(admin ? categories : {
        pickup: "Penjemputan", facility: "Tugas fasilitas"
    }).map(([key, label]) => new Option(label, key)));
    const verification = Object.fromEntries(Object.entries(statuses).filter(([key]) => key !== "draft"));
    form.elements.status.append(new Option("Semua status", ""),
        ...Object.entries(admin ? verification : { pickup: "Siap dijemput", transit: "Menuju hub", arrived: "Tiba di hub" })
            .map(([key, label]) => new Option(label, key)),
        ...Object.entries(handlingStatuses).map(([key, label]) => new Option(label, "handling:" + key)),
        ...Object.entries(assignmentStatuses).map(([key, label]) => new Option(label + " (penugasan)", "assignment:" + key)));

    let map;
    let pins;
    let version = 0;
    let cursor = null;
    let loaded = [];
    let tilesFailed = false;
    let origin;
    let originMarker;
    let geoRevision = 0;
    const originForm = root.querySelector("[data-map-origin]");

    function setOrigin(point) {
        ++geoRevision;
        origin = point;
        const feedback = originForm.querySelector("output");
        originForm.closest("details").querySelector("summary").textContent = point ? "Titik awal siap · Ubah" : "Atur titik awal Petugas";
        originMarker?.remove();
        if (point && map) {
            const icon = L.divIcon({ className: "sp-map-marker sp-map-marker--origin", html: "A", iconSize: [28, 28], iconAnchor: [14, 14] });
            originMarker = L.marker(point, { icon, alt: "Titik awal A", title: "Titik awal A" }).addTo(map);
            map.panTo(point);
        }
        feedback.textContent = point ? "Titik awal A siap." : "Titik awal dihapus.";
        originForm.elements.lat.value = point?.[0] ?? "";
        originForm.elements.lon.value = point?.[1] ?? "";
    }
    originForm?.addEventListener("submit", event => {
        event.preventDefault();
        setOrigin(locationPoint(originForm.elements.lat.valueAsNumber, originForm.elements.lon.valueAsNumber));
    });
    originForm?.querySelector("[data-clear-origin]").addEventListener("click", () => setOrigin(null));
    originForm?.querySelector("[data-use-gps]").addEventListener("click", () => {
        const run = ++geoRevision;
        const feedback = originForm.querySelector("output");
        if (!navigator.geolocation) { feedback.textContent = "Lokasi perangkat tidak tersedia."; return; }
        feedback.textContent = "Meminta izin lokasi perangkat…";
        navigator.geolocation.getCurrentPosition(position => {
            if (run === geoRevision) setOrigin(locationPoint(position.coords.latitude, position.coords.longitude));
        }, () => {
            if (run === geoRevision) feedback.textContent = "Lokasi tidak dapat dibaca. Gunakan koordinat manual.";
        }, { timeout: 10000, maximumAge: 0 });
    });

    function open(item, action) {
        const navigation = { origin, action };
        if (item.type === "pickup") {
            window.viewActiveMission(item.tracking, navigation);
            return;
        }
        const selector = item.handling ? "[data-open-handling]" : "[data-open-verification]";
        const button = Array.from(document.querySelectorAll(selector)).find(element => element.getClientRects().length);
        button?.click();
        window.dispatchEvent(new CustomEvent(item.handling ? "sampira:handling-detail" : "sampira:report-detail", {
            detail: { id: item.id, navigation }
        }));
    }

    function facility(row, handling) {
        return {
            id: row.report_id || row.id, type: "facility", title: row.title, address: row.address, tracking: row.tracking_number,
            state: handling ? row.status : row.verification_status || row.status, assignment: row.assignment_status,
            point: locationPoint(row.latitude, row.longitude), handling
        };
    }

    async function getPickups() {
        const user = await window.portalUser("petugas");
        if (!user) throw new Error("Sesi berakhir. Masuk kembali.");
        const response = await window.portalFetch("/api/ecorecycle/list_pickups?type=petugas");
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data)) throw new Error("Daftar penjemputan gagal dimuat.");
        return result.data.filter(item => Number(item.collector_id) === Number(user.id) &&
            ["pickup", "transit", "arrived"].includes(item.status)).map(item => ({
            type: "pickup", tracking: item.tracking_number, title: item.tracking_number,
            address: item.pickup_address, state: item.status, point: locationPoint(item.latitude, item.longitude)
        }));
    }

    function render() {
        list.replaceChildren();
        pins?.clearLayers();
        const points = [];
        for (const item of loaded) {
            const label = (item.handling ? handlingStatuses[item.state] : statuses[item.state]) ||
                { pickup: "Siap dijemput", transit: "Menuju hub", arrived: "Tiba di hub" }[item.state] || "Belum tersedia";
            const row = create("li");
            const action = create("button", item.title, "sp-map-open");
            action.type = "button";
            action.addEventListener("click", () => open(item));
            const kind = item.type === "pickup" ? "Penjemputan" : "Fasilitas";
            row.append(create("small", kind + " · " + label), action, create("p", item.address || "Alamat belum tersedia"));
            if (item.assignment) row.append(create("small", "Penugasan · " + (assignmentStatuses[item.assignment] || item.assignment)));
            if (!item.point) row.append(create("small", "Titik presisi belum tersedia"));
            list.append(row);
            if (!item.point || !map) continue;
            points.push(item.point);
            const pin = L.divIcon({ className: "sp-map-marker sp-map-marker--" + item.type,
                html: item.type === "pickup" ? "P" : "F", iconSize: [28, 28], iconAnchor: [14, 14] });
            const marker = L.marker(item.point, { icon: pin, alt: kind + " · " + item.title, title: item.title }).addTo(pins);
            const popup = create("div", "", "sp-map-popup");
            popup.append(create("strong", item.title), create("p", [kind, label, item.tracking].filter(Boolean).join(" · ")),
                create("p", item.address || "Alamat belum tersedia"));
            const actions = [["Buka detail", null]];
            if (!admin) actions.push(["Lihat Rute", "route"], ["Buka Navigasi", "external"]);
            else if (!item.handling && item.state === "approved") {
                const handlingStatus = create("p", "Memuat status penanganan…");
                popup.append(handlingStatus);
                marker.on("popupopen", async () => {
                    try {
                        const report = await request(base + "/" + item.id + "/handling");
                        handlingStatus.textContent = "Penanganan · " + (handlingStatuses[report.status] || "Belum tersedia");
                    } catch {
                        handlingStatus.textContent = "Status penanganan belum tersedia.";
                    }
                });
                actions.push(["Buka penanganan", "handling"]);
            }
            for (const [title, action] of actions) {
                const button = create("button", title, "sp-map-open");
                button.type = "button";
                button.addEventListener("click", () => open(action === "handling" ? { ...item, handling: true } : item, action));
                popup.append(button);
            }
            marker.bindPopup(popup, { maxWidth: 235, maxHeight: 142, autoPanPadding: [14, 14] });
        }
        if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom: 15 });
        const count = loaded.filter(item => item.point).length;
        status.textContent = loaded.length ? loaded.length + " lokasi dimuat · " + count + " memiliki titik presisi."
            : "Tidak ada lokasi untuk filter ini.";
        if (tilesFailed) status.textContent += " Peta jalan gagal dimuat. Daftar tetap tersedia.";
        else if (!map) status.textContent += " Peta tidak tersedia. Gunakan daftar.";
    }

    async function load(append = false) {
        const run = ++version;
        status.textContent = "Memuat lokasi…";
        more.disabled = true;
        if (!append) {
            loaded = [];
            list.replaceChildren();
            pins?.clearLayers();
            cursor = null;
        }
        if (!map && window.L) {
            map = L.map(canvas).setView([-6.9175, 107.6191], 12);
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19
            }).on("tileerror", () => {
                if (!tilesFailed) status.textContent += " Peta jalan gagal dimuat.";
                tilesFailed = true;
            }).addTo(map);
            pins = L.layerGroup().addTo(map);
        }
        map?.invalidateSize();
        const category = form.elements.category.value;
        const selected = form.elements.status.value;
        const [group, value] = selected.split(":");
        const handling = !admin || group === "handling" || group === "assignment";
        const pickupOnly = !admin && (category === "pickup" || Boolean(selected && !value));
        const withPickups = !admin && !append && category !== "facility" && !value;
        const params = new URLSearchParams({ limit: "20" });
        if (cursor !== null) params.set("before_id", cursor);
        if (admin && category) params.set("category", category);
        if (group === "handling" || (!handling && group)) params.set("status", value || group);
        try {
            const results = await Promise.allSettled([
                pickupOnly ? null : request(base + (handling ? "/handling" : "") + "?" + params),
                withPickups ? getPickups() : []
            ]);
            if (run !== version) return;
            const [facilityResult, pickupResult] = results;
            const page = facilityResult.value;
            const pickups = (pickupResult.value || []).filter(item => !selected || item.state === selected);
            const facilities = (page?.items || []).filter(item => group !== "assignment" || item.assignment_status === value)
                .map(item => facility(item, handling));
            loaded.push(...pickups, ...facilities);
            cursor = page?.next_before_id ?? null;
            render();
            const failures = results.filter(result => result.status === "rejected");
            if (failures.length) status.textContent += " Sebagian sumber lokasi gagal dimuat. Terapkan filter untuk mencoba lagi.";
        } finally {
            if (run === version) {
                more.disabled = false;
                more.hidden = cursor === null;
            }
        }
    }

    form.addEventListener("submit", event => { event.preventDefault(); load(); });
    form.addEventListener("reset", () => requestAnimationFrame(() => load()));
    more.addEventListener("click", () => load(true));
    root.addEventListener("sampira:open", () => load());
    function clearMap() {
        ++version;
        loaded = [];
        pins?.clearLayers();
        list.replaceChildren();
        if (originForm) setOrigin(null);
    }
    root.addEventListener("sampira:close", clearMap);
    window.addEventListener("sampira:session-ended", clearMap);
    window.addEventListener("sampira:collector-view", () => {
        if (root.classList.contains("active")) load();
        else clearMap();
    });
    if (!admin) window.addEventListener("focus", () => {
        if (root.classList.contains("active") && !document.hidden) load();
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && originForm) setOrigin(null);
    });
}

const metrics = document.querySelector("#sp-system-metrics");
if (metrics) {
    const message = metrics.querySelector("[role=status]");
    const number = new Intl.NumberFormat("id-ID");
    const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
    window.portalFetch("/api/ecorecycle/pickup_status?type=stats")
        .then(async response => {
            if (!response.ok) throw new Error("Ringkasan sistem gagal dimuat.");
            const result = await response.json();
            for (const field of metrics.querySelectorAll("[data-metric]")) {
                const value = result.data?.[field.dataset.metric];
                if (typeof value === "number") field.textContent = (field.hasAttribute("data-currency") ? rupiah : number).format(value);
            }
            message.textContent = "";
        }).catch(error => { message.textContent = error.message; });
}

const overview = document.querySelector("#admin-overview");
if (overview) overview.addEventListener("sampira:open", async () => {
    const notice = overview.querySelector("[role=status]");
    notice.textContent = "Memuat ringkasan laporan…";
    const fields = overview.querySelectorAll("[data-overview-status]");
    for (const field of fields) field.textContent = "—";
    try {
        const [verification, handling] = await Promise.all([
            request(base + "?status=pending&limit=20"), request(base + "/handling?limit=20")
        ]);
        for (const field of fields) {
            const key = field.dataset.overviewStatus;
            field.textContent = key === "pending" ? verification.items.length : handling.items.filter(item => item.status === key).length;
        }
        notice.textContent = verification.items.length + " laporan menunggu verifikasi dan " + handling.items.length +
            " laporan penanganan dalam cuplikan ini." +
            (verification.next_before_id || handling.next_before_id ? " Masih ada halaman berikutnya pada antrean." : "");
    } catch {
        notice.textContent = "Ringkasan gagal dimuat. Buka kembali menu Ringkasan untuk mencoba lagi.";
    }
});
