const kind = document.body.dataset.authPage;
const form = document.getElementById(kind + '-form');
const submit = form.querySelector('.submit-button');
const submitLabel = submit.querySelector('span');
const errorBanner = form.querySelector('.auth-error');
const progress = document.getElementById('auth-progress');
const email = document.getElementById(kind + '-email');
const password = document.getElementById(kind + '-password');
const nameInput = document.getElementById('register-name');
const confirmation = document.getElementById('register-confirm-password');
const destinations = {user: '/dashboard', petugas: '/petugas', admin: '/admin', administrator: '/administrator'};
let pending = false;

function fieldError(input, message = '') {
    document.getElementById(input.id + '-error').textContent = message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
}

form.addEventListener('invalid', event => {
    const input = event.target;
    const message = input.validity.valueMissing
        ? 'Isi ' + input.labels[0].textContent.toLowerCase() + '.'
        : 'Gunakan format email yang valid.';
    fieldError(input, message);
}, true);

form.addEventListener('input', event => {
    fieldError(event.target);
    if (event.target === password && confirmation) fieldError(confirmation);
    errorBanner.hidden = true;
});

function validateRegistration() {
    const length = new TextEncoder().encode(password.value).length;
    const errors = [
        [nameInput, nameInput.value.trim() ? '' : 'Isi nama lengkap.'],
        [password, length >= 6 && length <= 72 ? '' : 'Kata sandi harus terdiri dari 6 hingga 72 byte.'],
        [confirmation, password.value === confirmation.value ? '' : 'Konfirmasi kata sandi belum cocok.']
    ];
    for (const [input, message] of errors) fieldError(input, message);
    const first = errors.find(([, message]) => message);
    if (first) first[0].focus();
    return !first;
}

function serverMessage(status) {
    if (status === 403) return 'Permintaan ditolak. Muat ulang halaman dan coba lagi.';
    if (status === 429) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
    if (status >= 500) return 'Layanan sedang bermasalah. Coba lagi dalam beberapa saat.';
    return kind === 'login'
        ? 'Tidak dapat masuk. Periksa email dan kata sandi Anda.'
        : 'Pendaftaran belum berhasil. Periksa isian atau masuk jika Anda sudah memiliki akun.';
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
    errorBanner.focus();
}

function setPending(value) {
    pending = value;
    submit.disabled = value;
    form.setAttribute('aria-busy', String(value));
    submitLabel.textContent = value ? (kind === 'login' ? 'Sedang masuk…' : 'Sedang mendaftar…') : (kind === 'login' ? 'Masuk' : 'Daftar');
    progress.textContent = value ? submitLabel.textContent : '';
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || form.hidden) return;
    errorBanner.hidden = true;
    if (kind === 'register' && !validateRegistration()) return;
    const payload = {email: email.value, password: password.value};
    if (nameInput) payload.name = nameInput.value.trim();
    setPending(true);
    let navigating = false;
    try {
        const response = await fetch('/api/auth/' + kind, {
            method: 'POST', credentials: 'same-origin',
            headers: {'Content-Type': 'application/json', 'X-SAMPIRA-Portal': '1'},
            body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.status !== 'success') {
            showError(serverMessage(response.status));
            return;
        }
        if (kind === 'register') {
            form.reset();
            form.hidden = true;
            document.querySelector('.switch-account').hidden = true;
            const success = document.getElementById('register-success');
            success.hidden = false;
            success.focus();
            return;
        }
        const role = result.data?.role;
        if (!Object.hasOwn(destinations, role)) {
            showError('Sesi tidak dapat dibuka. Muat ulang halaman dan coba lagi.');
            return;
        }
        form.reset();
        navigating = true;
        window.location.assign(destinations[role]);
    } catch {
        showError('Tidak dapat terhubung ke layanan. Periksa koneksi dan coba lagi.');
    } finally {
        if (!navigating) setPending(false);
    }
});

for (const toggle of form.querySelectorAll('.password-toggle')) {
    toggle.addEventListener('click', () => {
        const input = document.getElementById(toggle.getAttribute('aria-controls'));
        const revealed = input.type === 'password';
        input.type = revealed ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(revealed));
    });
}
window.addEventListener('pageshow', event => {
    if (event.persisted) setPending(false);
});
