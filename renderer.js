window.addEventListener('DOMContentLoaded', async () => {
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('password-confirm');
    const greeting = document.querySelector('.greeting');
    const errorMessage = document.getElementById('password-error');

    const { exists } = await window.mainWindow.status();
    const setupMode = !exists;
    if (setupMode) {
        greeting.textContent = 'First time here! Choose a master password';
        passwordInput.placeholder = 'New master password';
        confirmInput.hidden = false;
        const importBtn = document.getElementById('importBtn');
        importBtn.hidden = false;
        importBtn.addEventListener('click', async () => {
            const res = await window.mainWindow.importVault();
            if (!res.ok && res.error) showError(res.error);
        });
        const hint = document.querySelector('.hint');
        const base = 'There is no way to recover it!';
        hint.textContent = 'At least 8 characters. ' + base;
        passwordInput.addEventListener('input', () => {
            const s = window.passwordStrength(passwordInput.value);
            hint.textContent = s.label ? `Strength: ${s.label}. ${base}` : 'At least 8 characters. ' + base;
        });
    }

    const showError = (text) => {
        errorMessage.textContent = text;
        errorMessage.style.visibility = 'visible';
    };

    const submit = async () => {
        errorMessage.style.visibility = 'hidden';
        if (setupMode) {
            if (passwordInput.value !== confirmInput.value) return showError('Passwords do not match');
            const res = await window.mainWindow.setup(passwordInput.value);
            if (!res.ok) showError(res.error);
            return;
        }
        const res = await window.mainWindow.welcome(passwordInput.value);
        if (res.ok) return;
        showError(res.wait ? `Too many attempts, wait ${res.wait}s` : 'Type slower dear Ach!');
    };

    const onKey = async (e) => {
        if (e.key !== 'Enter') return;
        if (e.ctrlKey) await submit();
        else if (!setupMode) await window.alertWindow.show();
    };
    passwordInput.addEventListener('keyup', onKey);
    confirmInput.addEventListener('keyup', onKey);
})
