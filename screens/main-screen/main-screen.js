window.addEventListener('DOMContentLoaded', () => {
    const data= window.homeWindow.read();
    const table = document.getElementById('table');
    const input = document.getElementById('searchInput');

    tableInit(table, data);
    handleInput(input);

    handleLogout();
})


function tableInit(table, data){
    let i = 0;
    for(const [platform , {id,pwd}] of Object.entries(data)){
        let platformSpan = createSpanElement(platform,i);
        table.appendChild(platformSpan);
        let idSpan = createSpanElement(id,i);
        table.appendChild(idSpan);
        let pwdSpan = createSpanElement(pwd,i);
        table.appendChild(pwdSpan);
        let actionSpan = createSpanElement("actions",i);
        table.appendChild(actionSpan);
        i++;
    }
}

function createSpanElement(content,i){
    let span = document.createElement('span');
    span.textContent = content;
    span.className = `cell ${i}`;
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
    let containingRows = new Set();
    let cells, filter, txtValue;
    filter = input.value.toUpperCase();
    cells = document.getElementsByClassName("cell");
    for (let i = 0; i <cells.length; i++) {
        txtValue = cells[i].textContent || cells.innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            console.log('there:',cells[i].textContent)
            containingRows.add(i);
        }
        hideAllRows(cells);
        showRows(containingRows);
    }
}

function showRows(containingRows) {
    console.log(containingRows)
    for (let i = 0; i <containingRows.size; i++) {
        let result_cells = document.getElementsByClassName(`cell ${containingRows[i]}`);
        result_cells = [...result_cells];
        result_cells.forEach((c)=>{
            console.log(c)
            c.style.display = '';
        })
    }
}

function hideAllRows(cells){
    cells = [...cells]
    console.log(cells)
    cells.forEach((c)=>{
        c.style.display = 'none'
    })
}
