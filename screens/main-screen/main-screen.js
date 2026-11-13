let vault = {};

window.addEventListener('DOMContentLoaded', async () => {
    const table = document.getElementById('table');
    const input = document.getElementById('searchInput');

    vault = await window.homeWindow.read();
    renderTable(table, vault);
    handleInput(input);
    handleActions(table);
    handleDialog(table, input);
    handleLogout();
    handleBackup();
    handlePasswordDialog();
    trackActivity();
})

// unique token so a stored value of "actions" can't be mistaken for the icon cell
const ACTIONS = Symbol('actions');
const MASK = '\u2022'.repeat(8);

// header = first 4 children; everything after is data rows
function renderTable(table, data){
    while (table.children.length > 4) table.lastChild.remove();
    let i = 0;
    for(const [platform , {id,pwd}] of Object.entries(data)){
        table.appendChild(createSpanElement(platform,i));
        table.appendChild(createSpanElement(id,i));
        // password stays out of the DOM until revealed
        const pwdSpan = createSpanElement(MASK,i);
        pwdSpan.classList.add('pwd-cell');
        pwdSpan.dataset.platform = platform;
        table.appendChild(pwdSpan);
        const actionSpan = createSpanElement(ACTIONS,i);
        actionSpan.dataset.platform = platform;
        table.appendChild(actionSpan);
        i++;
    }
}

function refresh(table, input, data){
    vault = data;
    renderTable(table, vault);
    filterTable(input);
}

const ACTION_ICONS = [['bi-eye', 'view'], ['bi-clipboard', 'copy'], ['bi-pen', 'edit'], ['bi-trash', 'delete']];

function createSpanElement(content,i){
    let span = document.createElement('span');
    span.className = `cell ${i}`;
    if (content === ACTIONS) {
        ACTION_ICONS.forEach(([icon, action]) => {
            const el = document.createElement('i');
            el.className = `bi ${icon}`;
            el.dataset.action = action;
            span.appendChild(el);
        });
    } else {
        // textContent: vault values are data, never markup
        span.textContent = String(content);
    }
    return span;
}

function handleInput(input){
    highlightInput(input);
    input.oninput = () => {
        highlightInput(input);
        filterTable(input)
    }
}

function highlightInput(input){
    const inputHighlight = document.getElementsByClassName('input-highlight')[0];
    inputHighlight.innerHTML=input.value.replace(/ /g, "\u00a0")
}

function handleLogout(){
    const closeBtn = document.getElementById('logout');

    closeBtn.addEventListener('click',async ()=>{
        await window.mainWindow.bye_bye()
    })
}

function filterTable(input){
    const containingRows = new Set();
    const filter = input.value.toUpperCase();
    const cells = document.getElementsByClassName("cell");
    for (let i = 0; i < cells.length; i++) {
        const txtValue = cells[i].textContent || '';
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            containingRows.add(cells[i].className.split(' ')[1]);
        }
    }
    hideAllRows(cells);
    showRows(containingRows);
}

function showRows(containingRows) {
   containingRows = [...containingRows];
    for (let i = 0; i <containingRows.length; i++) {
        let result_cells = document.getElementsByClassName(`cell ${containingRows[i]}`);
        result_cells = [...result_cells];
        result_cells.forEach((c)=>{
            c.style.display = '';
        })
    }
}

function hideAllRows(cells){
    cells = [...cells]
    cells.forEach((c)=>{
        c.style.display = 'none'
    })
}


// ---------- add / edit / delete ----------

function handleActions(table){
    table.addEventListener('click', async (e) => {
        const icon = e.target.closest('i[data-action]');
        if (!icon) return;
        const platform = icon.parentElement.dataset.platform;
        if (icon.dataset.action === 'view') toggleReveal(table, icon, platform);
        else if (icon.dataset.action === 'copy') await copyPassword(icon, platform);
        else if (icon.dataset.action === 'edit') openDialog(platform);
        else if (icon.dataset.action === 'delete') await deleteEntry(table, platform);
    });
}

function toggleReveal(table, icon, platform){
    const cell = [...table.querySelectorAll('.pwd-cell')].find((c) => c.dataset.platform === platform);
    const showing = icon.classList.contains('bi-eye-slash');
    cell.textContent = showing ? MASK : vault[platform].pwd;
    icon.classList.toggle('bi-eye-slash', !showing);
    icon.classList.toggle('bi-eye', showing);
}

async function copyPassword(icon, platform){
    const res = await window.homeWindow.copy(platform);
    if (!res.ok) return;
    icon.classList.replace('bi-clipboard', 'bi-clipboard-check');
    setTimeout(() => icon.classList.replace('bi-clipboard-check', 'bi-clipboard'), 1500);
}

// tell the main process the user is active so the idle auto-lock doesn't fire
function trackActivity(){
    let last = 0;
    const ping = () => {
        const now = Date.now();
        if (now - last < 5000) return;
        last = now;
        window.homeWindow.activity();
    };
    ['mousemove', 'mousedown', 'keydown', 'wheel'].forEach((ev) => window.addEventListener(ev, ping, { passive: true }));
}

async function deleteEntry(table, platform){
    if (!confirm(`Delete "${platform}"? This cannot be undone.`)) return;
    const res = await window.homeWindow.remove(platform);
    if (res.ok) refresh(table, document.getElementById('searchInput'), res.data);
    else alert(res.error);
}

let editing = null; // platform being edited, or null when adding

function openDialog(platform = null){
    editing = platform;
    document.getElementById('dialogTitle').textContent = platform ? 'Edit entry' : 'Add entry';
    document.getElementById('fPlatform').value = platform || '';
    document.getElementById('fId').value = platform ? vault[platform].id : '';
    document.getElementById('fPwd').value = platform ? vault[platform].pwd : '';
    document.getElementById('dialogError').textContent = '';
    document.getElementById('entryDialog').showModal();
    document.getElementById('fPlatform').focus();
}

function handleDialog(table, input){
    const dialog = document.getElementById('entryDialog');
    document.getElementById('addBtn').addEventListener('click', () => openDialog());
    document.getElementById('dialogCancel').addEventListener('click', () => dialog.close());

    document.getElementById('dialogSave').addEventListener('click', async () => {
        const platform = document.getElementById('fPlatform').value.trim();
        const id = document.getElementById('fId').value;
        const pwd = document.getElementById('fPwd').value;
        const error = document.getElementById('dialogError');
        if (!platform) { error.textContent = 'Platform is required'; return; }
        const res = editing === null
            ? await window.homeWindow.add(platform, id, pwd)
            : await window.homeWindow.update(editing, platform, id, pwd);
        if (!res.ok) { error.textContent = res.error; return; }
        dialog.close();
        refresh(table, input, res.data);
    });
}


// ---------- export / import of the encrypted vault file ----------

function handleBackup(){
    document.getElementById('exportBtn').addEventListener('click', async () => {
        await window.homeWindow.exportVault();
    });
    document.getElementById('importBtn').addEventListener('click', async () => {
        const res = await window.homeWindow.importVault();
        if (!res.ok && res.error) alert(res.error);
        // on success the main process locks and returns to the login page
    });
}


// ---------- change master password ----------

function handlePasswordDialog(){
    const dialog = document.getElementById('pwdDialog');
    const [cur, nw, conf] = ['pCurrent', 'pNew', 'pConfirm'].map((id) => document.getElementById(id));
    const error = document.getElementById('pwdError');
    const strength = document.getElementById('pStrength');
    const clear = () => { [cur, nw, conf].forEach((i) => { i.value = ''; }); };

    document.getElementById('pwdBtn').addEventListener('click', () => {
        clear();
        error.textContent = '';
        strength.textContent = '';
        dialog.showModal();
        cur.focus();
    });
    document.getElementById('pwdCancel').addEventListener('click', () => { clear(); dialog.close(); });

    nw.addEventListener('input', () => {
        const s = window.passwordStrength(nw.value);
        strength.textContent = s.label ? `Strength: ${s.label}` : '';
        strength.dataset.level = s.level;
    });

    document.getElementById('pwdSave').addEventListener('click', async () => {
        if (nw.value !== conf.value) { error.textContent = 'New passwords do not match'; return; }
        const res = await window.homeWindow.changePassword(cur.value, nw.value);
        if (!res.ok) { error.textContent = res.error; return; }
        clear();
        dialog.close();
        alert('Master password changed.');
    });
}
