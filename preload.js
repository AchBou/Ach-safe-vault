window.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    passwordInput.addEventListener('keyup',  (e) => {
        if(e.key ==='Enter') {
            if(e.ctrlKey){
                if(passwordInput.value=='hello') console.log('logged in')
                else{
                    console.log("password incorrect")
                }
            }
            else {
                window.open('./windows/alert-window/unauth-message.html')
            }
        }
    })
})