// Shared submit lifecycle keeps loading/error handling consistent on both forms.
function authFormPayload(kind) {
    const email = document.getElementById(kind + '-email').value;
    const password = document.getElementById(kind + '-password').value;
    if (kind === 'login') return {email, password};
    return {name: document.getElementById('register-name').value, email, password, role: 'user'};
}

async function finishAuthentication(kind, data) {
    if (kind === 'register') {
        await Swal.fire({icon: 'success', title: 'Registrasi Berhasil', text: 'Akun Anda telah dibuat. Silakan login.', confirmButtonText: 'Login Sekarang'});
        window.location.href = 'login';
        return;
    }
    localStorage.setItem('user', JSON.stringify(data));
    await Swal.fire({icon: 'success', title: 'Login Berhasil', text: 'Selamat datang kembali di EcoRecycle!', timer: 1500, showConfirmButton: false});
    const destinations = {admin: 'admin', collector: 'collector'};
    window.location.href = destinations[data.role] || 'dashboard';
}

async function submitAuthForm(event, kind) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const originalText = button.innerText;
    button.innerText = 'Memproses...';
    button.disabled = true;
    button.style.opacity = '0.8';
    try {
        const response = await fetch('api/auth/' + kind, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(authFormPayload(kind))});
        const result = await response.json();
        if (result.status === 'success') await finishAuthentication(kind, result.data);
        else await Swal.fire({icon: 'error', title: kind === 'login' ? 'Login Gagal' : 'Registrasi Gagal', text: result.message});
    } catch {
        await Swal.fire({icon: 'error', title: 'Kesalahan', text: 'Gagal terhubung ke server.'});
    } finally {
        button.innerText = originalText;
        button.disabled = false;
        button.style.opacity = '1';
    }
}

for (const kind of ['login', 'register']) {
    document.getElementById(kind + '-form')?.addEventListener('submit', event => submitAuthForm(event, kind));
}

// Keep password visibility separate from form submission.
document.querySelectorAll('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
        const input = document.getElementById(button.getAttribute('aria-controls'));
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.textContent = visible ? 'Tutup' : 'Lihat';
        button.setAttribute('aria-label', visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
        button.setAttribute('aria-pressed', String(visible));
    });
});

// Let both panels leave before following normal login/register links.
const authPage = document.body.dataset.authPage;
if (authPage) {
    let navigating = false;
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
        const destination = new URL(link.href, window.location.href);
        const nextPage = destination.pathname.replace(/\/$/, '').split('/').pop();
        if (destination.origin !== window.location.origin || !['login', 'register'].includes(nextPage) || nextPage === authPage) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        event.preventDefault();
        if (navigating) return;
        navigating = true;
        document.body.classList.add('auth-leaving');
        // A bounded delay also works when animation events are unavailable.
        window.setTimeout(() => window.location.assign(destination.href), 190);
    });
    window.addEventListener('pageshow', () => {
        navigating = false;
        document.body.classList.remove('auth-leaving');
    });
}
