window.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeBtn');
    closeBtn.addEventListener('click',async (e)=>{
        console.log("hello");
        await window.alertWindow.close()
    })

    const container = document.getElementById('container')
    console.log("container height:", container.offsetHeight)
})

