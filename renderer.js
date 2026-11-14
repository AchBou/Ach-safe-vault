// Login screen.
//
// - If a vault exists:  Ctrl+Enter unlocks it. A plain Enter shows the "you shall not pass" popup (on purpose!).
// - If no vault exists: the page switches to "first-run setup" and a plain Enter creates the vault.
window.addEventListener('DOMContentLoaded', async () => {
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('password-confirm');
    const importButton = document.getElementById('importBtn');
    const greeting = document.querySelector('.greeting');
    const hint = document.querySelector('.hint');
    const errorMessage = document.getElementById('password-error');

    const showError = (text) => {
        errorMessage.textContent = text;
        errorMessage.style.visibility = 'visible';
    };

    const { exists } = await window.mainWindow.status();
    const isSetup = !exists;
    if (isSetup) showSetupMode();

    function showSetupMode() {
        greeting.textContent = 'First time here! Choose a master password';
        passwordInput.placeholder = 'New master password';
        confirmInput.hidden = false;
        importButton.hidden = false;

        const reminder = 'There is no way to recover it!';
        hint.textContent = `At least 8 characters. ${reminder}`;
        passwordInput.addEventListener('input', () => {
            const { label } = window.passwordStrength(passwordInput.value);
            hint.textContent = label
                ? `Strength: ${label}. ${reminder}`
                : `At least 8 characters. ${reminder}`;
        });

        importButton.addEventListener('click', async () => {
            const result = await window.mainWindow.importVault();
            if (!result.ok && result.error) showError(result.error);
        });
    }

    async function createVault() {
        errorMessage.style.visibility = 'hidden';
        if (passwordInput.value !== confirmInput.value) return showError('Passwords do not match');
        const result = await window.mainWindow.setup(passwordInput.value);
        if (!result.ok) showError(result.error);
    }

    async function unlock() {
        errorMessage.style.visibility = 'hidden';
        const result = await window.mainWindow.welcome(passwordInput.value);
        if (result.ok) return; // the main process loads the vault page
        showError(result.wait ? `Too many attempts, wait ${result.wait}s` : 'Type slower dear Ach!');
    }

    async function onKeyUp(event) {
        if (event.key !== 'Enter') return;
        if (isSetup) return createVault();
        if (event.ctrlKey) return unlock();
        return window.alertWindow.show();
    }

    passwordInput.addEventListener('keyup', onKeyUp);
    confirmInput.addEventListener('keyup', onKeyUp);
});
