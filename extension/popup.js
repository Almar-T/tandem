const loginView = document.getElementById('login-view')
const statusView = document.getElementById('status-view')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const signinBtn = document.getElementById('signin-btn')
const signoutBtn = document.getElementById('signout-btn')
const errorEl = document.getElementById('error')
const userEmailEl = document.getElementById('user-email')

function showError(msg) {
  errorEl.textContent = msg
  errorEl.style.display = 'block'
}

function showLogin() {
  loginView.style.display = 'block'
  statusView.style.display = 'none'
  errorEl.style.display = 'none'
}

function showStatus(email) {
  loginView.style.display = 'none'
  statusView.style.display = 'block'
  userEmailEl.textContent = email
}

// Ask background for current auth state
chrome.runtime.sendMessage({ type: 'popup:status' }, (res) => {
  if (res?.signedIn) showStatus(res.email)
  else showLogin()
})

signinBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value
  if (!email || !password) { showError('Email and password are required.'); return }
  signinBtn.disabled = true
  signinBtn.textContent = 'Connecting…'
  chrome.runtime.sendMessage({ type: 'popup:signIn', email, password }, (res) => {
    signinBtn.disabled = false
    signinBtn.textContent = 'Connect to Tandem'
    if (res?.ok) showStatus(res.email)
    else showError(res?.error || 'Could not connect.')
  })
})

signoutBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'popup:signOut' }, () => showLogin())
})

// Submit on Enter
passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') signinBtn.click() })
