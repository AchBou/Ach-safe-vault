window.addEventListener('DOMContentLoaded', () => {
    console.log(window.myAPI)

    const passwordInput = document.getElementById('password');
    passwordInput.addEventListener('keyup', async (e) => {
        console.log(window.mainWindow)
        if(e.key ==='Enter') {
            if(e.ctrlKey){
                const ok = await window.mainWindow.welcome(passwordInput.value);
                if(!ok){
                    const errorMessage = document.getElementById('password-error')
                    errorMessage.style.visibility = 'visible';
                }
            }
            else{
                await window.alertWindow.show()
            }
        }
    })
})

console.log("called")