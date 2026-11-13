window.addEventListener('DOMContentLoaded', async () => {
    const data = await window.homeWindow.read();
    console.log(data)
    const table = document.getElementById('table');
    const input = document.getElementById('searchInput');

    tableInit(table, data);
    handleInput(input);

    handleLogout();
})


// unique token so a stored value of "actions" can't be mistaken for the icon cell
const ACTIONS = Symbol('actions');

function tableInit(table, data){
    let i = 0;
    for(const [platform , {id,pwd}] of Object.entries(data)){
        let platformSpan = createSpanElement(platform,i);
        table.appendChild(platformSpan);
        let idSpan = createSpanElement(id,i);
        table.appendChild(idSpan);
        let pwdSpan = createSpanElement(pwd,i);
        table.appendChild(pwdSpan);
        let actionSpan = createSpanElement(ACTIONS,i);
        table.appendChild(actionSpan);
        i++;
    }
}

const ACTION_ICONS = ['bi-eye', 'bi-pen', 'bi-trash'];

function createSpanElement(content,i){
    let span = document.createElement('span');
    span.className = `cell ${i}`;
    if (content === ACTIONS) {
        ACTION_ICONS.forEach((icon) => {
            const el = document.createElement('i');
            el.className = `bi ${icon}`;
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
