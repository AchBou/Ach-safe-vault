window.addEventListener('DOMContentLoaded', () => {
    console.log(window.myAPI)

    const passwordInput = document.getElementById('password');
    passwordInput.addEventListener('keyup', async (e) => {
        console.log(window.mainWindow)
        if(e.key ==='Enter') {
            if(e.ctrlKey){
                if(passwordInput.value==='hello') await window.mainWindow.welcome();
                else{
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