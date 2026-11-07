// Keep the landing estimate aligned with the server tariff.
const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.getElementById('main-nav');
function closeMenu() {
    mainNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
}
menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(expanded));
    mainNav.classList.toggle('is-open', expanded);
});
mainNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        closeMenu();
        menuToggle.focus();
    }
});
const estimatorForm = document.getElementById('estimator-form');
const categorySelect = document.getElementById('estimator-category');
populateWasteOptions(categorySelect, 'Computers');
const weightInput = document.getElementById('estimator-weight');
const resultCard = document.getElementById('estimator-result-card');
const rupiah = new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR',maximumFractionDigits:0});
const compactRupiah = (amount) => rupiah.format(amount).replace(/\s/g, '');
const estimateStatus = document.getElementById('estimator-status');
let estimateRequest = 0;
estimatorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!estimatorForm.reportValidity()) return;
    const request = ++estimateRequest;
    const category = wasteCategories.find(item => item.name === categorySelect.value);
    const weight = weightInput.value;
    resultCard.hidden = true;
    estimateStatus.textContent = 'Menghitung estimasi…';
    try {
        const response = await fetch('/api/ecorecycle/estimate_reward', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({category: categorySelect.value, weight_kg: weight})
        });
        const result = await response.json();
        if (request !== estimateRequest) return;
        if (!response.ok) throw new Error(result.message);
        const data = result.data;
        document.getElementById('result-rate-label').textContent = compactRupiah(data.reward_rate) + ' × ' + new Intl.NumberFormat('id-ID').format(data.weight_kg) + ' kg';
        document.getElementById('result-gross-val').textContent = compactRupiah(data.total_estimate);
        document.getElementById('result-fee-val').textContent = compactRupiah(data.processing_fee);
        document.getElementById('result-reward-val').textContent = compactRupiah(data.net_estimate);
        document.getElementById('result-net-val').textContent = compactRupiah(data.net_estimate);
        document.getElementById('estimator-category-note').textContent = category?.note || '';
        estimateStatus.textContent = '';
        resultCard.hidden = false;
    } catch (error) {
        if (request === estimateRequest) estimateStatus.textContent = error.message || 'Estimasi belum tersedia.';
    }
});
estimatorForm.addEventListener('input', () => {
    estimateRequest++;
    resultCard.hidden = true;
    estimateStatus.textContent = '';
});

// Content stays visible without JavaScript; animate each section only on first entry.
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionToggle = document.querySelector('.motion-toggle');
let motionPaused = false;
function updateMotionControl() {
    const reduced = motionPreference.matches;
    document.body.classList.toggle('motion-paused', motionPaused || reduced);
    motionToggle.disabled = reduced;
    motionToggle.setAttribute('aria-pressed', String(motionPaused || reduced));
    let label = 'Jeda animasi Ⅱ';
    if (motionPaused) label = 'Putar animasi ▷';
    if (reduced) label = 'Animasi nonaktif';
    motionToggle.textContent = label;
}
motionToggle.addEventListener('click', () => {
    motionPaused = !motionPaused;
    updateMotionControl();
});
motionPreference.addEventListener('change', updateMotionControl);
updateMotionControl();

if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            if (!motionPreference.matches && !motionPaused) entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.hero-copy, .category, .steps li, .estimate-copy, .estimator-card, .future-inner, .faq-section > h2, .faq-list, .closing-inner').forEach((element, index) => {
        element.classList.add('reveal-item');
        element.style.setProperty('--reveal-delay', `${(index % 3) * 80}ms`);
        revealObserver.observe(element);
    });
}
