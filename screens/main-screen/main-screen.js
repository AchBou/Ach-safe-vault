// Vault screen.
//
// The page shows one table. Every entry is four cells in a row: platform, id, password, actions.
// All four cells of an entry share the same data-row number, which is how search finds a whole row.

const MASK = '•'.repeat(8); // eight bullet characters
const HEADER_CELLS = 4; // the table's first four children are the column titles

let vault = {}; // the decrypted entries: { platform: { id, pwd } }
let editingPlatform = null; // which entry the add/edit dialog is editing, or null when adding

window.addEventListener('DOMContentLoaded', async () => {
    vault = await window.homeWindow.read();
    renderTable();

    setupSearch();
    setupRowActions();
    setupEntryDialog();
    setupPasswordDialog();
    setupFooterButtons();
    reportActivity();
});

// ---------- table ----------

function renderTable() {
    const table = document.getElementById('table');
    while (table.children.length > HEADER_CELLS) table.lastChild.remove();

    Object.entries(vault).forEach(([platform, entry], row) => {
        table.append(
            createCell(platform, row),
            createCell(entry.id, row),
            createPasswordCell(platform, row),
            createActionsCell(platform, row),
        );
    });
}

// Re-draws the table after the vault changed and keeps the current search filter applied.
function refresh(newVault) {
    vault = newVault;
    renderTable();
    filterTable();
}

function createCell(text, row) {
    const cell = document.createElement('span');
    cell.className = 'cell';
    cell.dataset.row = row;
    cell.textContent = text; // textContent, never innerHTML: vault values are data, not markup
    return cell;
}

// The real password is not put in the page until the user clicks the eye icon.
function createPasswordCell(platform, row) {
    const cell = createCell(MASK, row);
    cell.classList.add('pwd-cell');
    cell.dataset.platform = platform;
    return cell;
}

const ROW_ACTIONS = [
    { icon: 'bi-eye', action: 'view' },
    { icon: 'bi-clipboard', action: 'copy' },
    { icon: 'bi-pen', action: 'edit' },
    { icon: 'bi-trash', action: 'delete' },
];

function createActionsCell(platform, row) {
    const cell = createCell('', row);
    cell.dataset.platform = platform;
    for (const { icon, action } of ROW_ACTIONS) {
        const button = document.createElement('i');
        button.className = `bi ${icon}`;
        button.dataset.action = action;
        cell.append(button);
    }
    return cell;
}

// ---------- search ----------

function setupSearch() {
    const input = document.getElementById('searchInput');
    showTypedText(input);
    input.addEventListener('input', () => {
        showTypedText(input);
        filterTable();
    });
}

// Copies the typed text into the hidden span that draws the gold underline.
// Its width follows the text, so the underline grows as you type.
function showTypedText(input) {
    document.querySelector('.input-highlight').textContent = input.value;
}

// Shows only the rows where at least one cell contains the search text.
function filterTable() {
    const searchText = document.getElementById('searchInput').value.toLowerCase();
    const cells = [...document.querySelectorAll('.cell')];

    const matchingRows = new Set(
        cells
            .filter((cell) => cell.textContent.toLowerCase().includes(searchText))
            .map((cell) => cell.dataset.row)
    );
    cells.forEach((cell) => {
        cell.style.display = matchingRows.has(cell.dataset.row) ? '' : 'none';
    });
}

// ---------- row actions: view, copy, edit, delete ----------

function setupRowActions() {
    document.getElementById('table').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const platform = button.parentElement.dataset.platform;

        switch (button.dataset.action) {
            case 'view': return toggleReveal(button, platform);
            case 'copy': return copyPassword(button, platform);
            case 'edit': return openEntryDialog(platform);
            case 'delete': return deleteEntry(platform);
        }
    });
}

function toggleReveal(button, platform) {
    const passwordCell = document.querySelector(`.pwd-cell[data-platform="${CSS.escape(platform)}"]`);
    const isRevealed = button.classList.contains('bi-eye-slash');

    passwordCell.textContent = isRevealed ? MASK : vault[platform].pwd;
    button.classList.toggle('bi-eye-slash', !isRevealed);
    button.classList.toggle('bi-eye', isRevealed);
}

async function copyPassword(button, platform) {
    const result = await window.homeWindow.copy(platform);
    if (!result.ok) return;

    // flash a check mark for a moment
    button.classList.replace('bi-clipboard', 'bi-clipboard-check');
    setTimeout(() => button.classList.replace('bi-clipboard-check', 'bi-clipboard'), 1500);
}

async function deleteEntry(platform) {
    if (!confirm(`Delete "${platform}"? This cannot be undone.`)) return;

    const result = await window.homeWindow.remove(platform);
    if (result.ok) refresh(result.data);
    else alert(result.error);
}

// ---------- add / edit dialog ----------

function openEntryDialog(platform = null) {
    editingPlatform = platform;
    const entry = platform ? vault[platform] : { id: '', pwd: '' };

    document.getElementById('dialogTitle').textContent = platform ? 'Edit entry' : 'Add entry';
    document.getElementById('fPlatform').value = platform || '';
    document.getElementById('fId').value = entry.id;
    document.getElementById('fPwd').value = entry.pwd;
    document.getElementById('dialogError').textContent = '';
    document.getElementById('entryDialog').showModal();
    document.getElementById('fPlatform').focus();
}

function setupEntryDialog() {
    const dialog = document.getElementById('entryDialog');
    const errorText = document.getElementById('dialogError');

    document.getElementById('addBtn').addEventListener('click', () => openEntryDialog());
    document.getElementById('dialogCancel').addEventListener('click', () => dialog.close());

    document.getElementById('dialogSave').addEventListener('click', async () => {
        const platform = document.getElementById('fPlatform').value.trim();
        const id = document.getElementById('fId').value;
        const pwd = document.getElementById('fPwd').value;
        if (!platform) {
            errorText.textContent = 'Platform is required';
            return;
        }

        const isAdding = editingPlatform === null;
        const result = isAdding
            ? await window.homeWindow.add(platform, id, pwd)
            : await window.homeWindow.update(editingPlatform, platform, id, pwd);
        if (!result.ok) {
            errorText.textContent = result.error;
            return;
        }

        dialog.close();
        refresh(result.data);
    });
}

// ---------- change master password dialog ----------

function setupPasswordDialog() {
    const dialog = document.getElementById('pwdDialog');
    const currentInput = document.getElementById('pCurrent');
    const newInput = document.getElementById('pNew');
    const confirmInput = document.getElementById('pConfirm');
    const errorText = document.getElementById('pwdError');
    const strengthText = document.getElementById('pStrength');

    const clearInputs = () => {
        currentInput.value = '';
        newInput.value = '';
        confirmInput.value = '';
    };

    document.getElementById('pwdBtn').addEventListener('click', () => {
        clearInputs();
        errorText.textContent = '';
        strengthText.textContent = '';
        dialog.showModal();
        currentInput.focus();
    });

    document.getElementById('pwdCancel').addEventListener('click', () => {
        clearInputs();
        dialog.close();
    });

    newInput.addEventListener('input', () => {
        const { label, level } = window.passwordStrength(newInput.value);
        strengthText.textContent = label ? `Strength: ${label}` : '';
        strengthText.dataset.level = level; // the CSS colours the text by level
    });

    document.getElementById('pwdSave').addEventListener('click', async () => {
        if (newInput.value !== confirmInput.value) {
            errorText.textContent = 'New passwords do not match';
            return;
        }

        const result = await window.homeWindow.changePassword(currentInput.value, newInput.value);
        if (!result.ok) {
            errorText.textContent = result.error;
            return;
        }

        clearInputs();
        dialog.close();
        alert('Master password changed.');
    });
}

// ---------- footer buttons ----------

function setupFooterButtons() {
    document.getElementById('logout').addEventListener('click', () => window.mainWindow.bye_bye());

    document.getElementById('exportBtn').addEventListener('click', () => window.homeWindow.exportVault());

    document.getElementById('importBtn').addEventListener('click', async () => {
        const result = await window.homeWindow.importVault();
        // On success the main process locks the vault and returns to the login page.
        if (!result.ok && result.error) alert(result.error);
    });
}

// ---------- idle auto-lock ----------

// Tells the main process the user is still here so the idle lock does not fire.
// Sends at most one message every 5 seconds.
function reportActivity() {
    const MIN_GAP_MS = 5000;
    let lastReport = 0;

    const report = () => {
        const now = Date.now();
        if (now - lastReport < MIN_GAP_MS) return;
        lastReport = now;
        window.homeWindow.activity();
    };

    for (const eventName of ['mousemove', 'mousedown', 'keydown', 'wheel']) {
        window.addEventListener(eventName, report, { passive: true });
    }
}
