window.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('logout');

    closeBtn.addEventListener('click',async ()=>{
        await window.mainWindow.bye_bye()
    })

    let data=window.homeWindow.read();

    const table = document.getElementById('table');

    for(let entry of Object.entries(data)){
        let platform = entry[0]
        let platformSpan = createSpanElement(platform);
        table.appendChild(platformSpan);
        for(let el of Object.entries(entry[1])){
            console.log(el)
            let credentialSpan= el[1]
            credentialSpan = createSpanElement(credentialSpan);
            table.appendChild(credentialSpan);
        }
        let actionSpan = createSpanElement("actions");
        table.appendChild(actionSpan);
    }

})

function createSpanElement(content){
    let span = document.createElement('span');
    span.textContent = content;
    return span;
}