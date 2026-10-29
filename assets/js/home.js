// Landing page tariffs mirror the initial database categories.
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
estimatorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const weight = Number(weightInput.value);
    if (!estimatorForm.reportValidity() || !Number.isFinite(weight) || weight <= 0) return;
    const category = wasteCategories.find(item => item.name === categorySelect.value);
    const grossReward = category.rate * weight;
    const processingFee = category.feePerKg * weight;
    document.getElementById('result-rate-label').textContent = `${compactRupiah(category.rate)} × ${new Intl.NumberFormat('id-ID').format(weight)} kg`;
    document.getElementById('result-gross-val').textContent = compactRupiah(grossReward);
    document.getElementById('result-fee-val').textContent = compactRupiah(processingFee);
    document.getElementById('result-reward-val').textContent = compactRupiah(grossReward - processingFee);
    document.getElementById('result-net-val').textContent = compactRupiah(grossReward - processingFee);
    document.getElementById("estimator-category-note").textContent = category.note;
    resultCard.hidden = false;
});
estimatorForm.addEventListener('input', () => { resultCard.hidden = true; });

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
