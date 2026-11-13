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
})

// unique token so a stored value of "actions" can't be mistaken for the icon cell
const ACTIONS = Symbol('actions');

// header = first 4 children; everything after is data rows
function renderTable(table, data){
    while (table.children.length > 4) table.lastChild.remove();
    let i = 0;
    for(const [platform , {id,pwd}] of Object.entries(data)){
        table.appendChild(createSpanElement(platform,i));
        table.appendChild(createSpanElement(id,i));
        table.appendChild(createSpanElement(pwd,i));
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

const ACTION_ICONS = [['bi-eye', 'view'], ['bi-pen', 'edit'], ['bi-trash', 'delete']];

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
        if (icon.dataset.action === 'edit') openDialog(platform);
        else if (icon.dataset.action === 'delete') await deleteEntry(table, platform);
    });
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
