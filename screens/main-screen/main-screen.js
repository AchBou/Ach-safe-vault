window.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('logout');

    closeBtn.addEventListener('click',async (e)=>{
        console.log("hello");
        await window.mainWindow.bye_bye()
    })
})

