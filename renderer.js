window.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    passwordInput.addEventListener('keyup', async (e) => {
        if(e.key ==='Enter') {
            if(e.ctrlKey){
                if(passwordInput.value=='hello') await window.mainWindow.welcome();
                else{
                    console.log('password incorrect')
                }
            }
            else{
                await window.alertWindow.show()
            }
        }
    })
})

console.log("called")