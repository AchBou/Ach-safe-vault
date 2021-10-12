window.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeBtn');
    console.log(closeBtn)
    closeBtn.addEventListener('click', (e)=>{
        console.log("close window");
    })
})

