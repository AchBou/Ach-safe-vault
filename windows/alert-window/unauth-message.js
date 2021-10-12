window.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeBtn');
    console.log(closeBtn)
    closeBtn.addEventListener('click',async (e)=>{
        console.log("hello");
        await window.alertWindow.close()
    })
})

