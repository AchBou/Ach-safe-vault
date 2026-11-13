window.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeBtn');
    closeBtn.addEventListener('click',async (e)=>{
        await window.alertWindow.close()
    })

    window.alertWindow.setHeight(document.body.offsetHeight);
})

