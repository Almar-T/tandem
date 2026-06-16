// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://zcyxixadcqmwarmnysxg.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_j0giWNW4qSA7geUwOHCMYA_ZaYgK7it'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDomain(url) {
  try { return new URL(url).hostname } catch { return '' }
}

function isTrackable(url) {
  return url && !url.startsWith('chrome://') && !url.startsWith('about:') &&
    !url.startsWith('chrome-extension://') && !url.startsWith('moz-extension://')
}

// ─── Auth ────────────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error_description || body.msg || 'Sign-in failed')
  const auth = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    user_id: body.user.id,
    email: body.user.email,
    expires_at: Date.now() + body.expires_in * 1000,
  }
  await chrome.storage.local.set({ auth })
  return auth
}

async function refreshAuth(auth) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: auth.refresh_token }),
  })
  if (!res.ok) { await chrome.storage.local.remove('auth'); return null }
  const body = await res.json()
  const next = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    user_id: body.user.id,
    email: body.user.email,
    expires_at: Date.now() + body.expires_in * 1000,
  }
  await chrome.storage.local.set({ auth: next })
  return next
}

async function getValidAuth() {
  const { auth } = await chrome.storage.local.get('auth')
  if (!auth) return null
  if (Date.now() > auth.expires_at - 60_000) return await refreshAuth(auth)
  return auth
}

async function signOut() {
  await chrome.storage.local.remove('auth')
}

// ─── Timer gate ───────────────────────────────────────────────────────────────
// Only flush data when the user has an active Tandem timer session.

async function isTimerRunning(auth) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/work_sessions?user_id=eq.${auth.user_id}&ended_at=is.null&select=id&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.access_token}` } },
  )
  if (!res.ok) return false
  const rows = await res.json()
  return rows.length > 0
}

// ─── Activity buffer ──────────────────────────────────────────────────────────

async function getPending() {
  const { pending } = await chrome.storage.local.get('pending')
  return pending || {}
}

async function setPending(pending) {
  await chrome.storage.local.set({ pending })
}

// Only tracks domain — no full URLs, no page titles, no content.
async function accumulate(domain, keystrokes, clicks, activeSec) {
  if (!domain) return
  const pending = await getPending()
  if (!pending[domain]) pending[domain] = { keystrokes: 0, clicks: 0, active_sec: 0 }
  pending[domain].keystrokes += keystrokes
  pending[domain].clicks += clicks
  pending[domain].active_sec += activeSec
  await setPending(pending)
}

async function flushPending() {
  const auth = await getValidAuth()
  if (!auth) return

  // Gate: discard and reset if the Tandem timer isn't running.
  const timerActive = await isTimerRunning(auth)
  if (!timerActive) {
    await setPending({})
    return
  }

  const pending = await getPending()
  const entries = Object.entries(pending)
  if (entries.length === 0) return

  const rows = entries.map(([domain, d]) => ({
    user_id: auth.user_id,
    domain,
    url: domain, // only the domain is stored, never the full path
    keystrokes: d.keystrokes,
    clicks: d.clicks,
    active_sec: d.active_sec,
  }))

  const res = await fetch(`${SUPABASE_URL}/rest/v1/browser_activity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${auth.access_token}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  })

  if (res.ok) await setPending({})
  // On failure, data stays in pending and retries on next alarm.
}

// ─── Tab time tracking ────────────────────────────────────────────────────────

let activeTabId = null
let activeTabUrl = ''
let activeTabDomain = ''
let activeTabStartedAt = Date.now()

async function onTabFocus(tabId) {
  if (activeTabDomain && isTrackable(activeTabUrl)) {
    const elapsed = Math.round((Date.now() - activeTabStartedAt) / 1000)
    if (elapsed > 0) await accumulate(activeTabDomain, 0, 0, elapsed)
  }
  activeTabId = tabId
  activeTabStartedAt = Date.now()
  if (tabId == null) { activeTabUrl = ''; activeTabDomain = ''; return }
  try {
    const tab = await chrome.tabs.get(tabId)
    activeTabUrl = tab.url || ''
    activeTabDomain = getDomain(activeTabUrl)
  } catch { activeTabUrl = ''; activeTabDomain = '' }
}

chrome.tabs.onActivated.addListener(({ tabId }) => { void onTabFocus(tabId) })

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId !== activeTabId || !changeInfo.url) return
  void onTabFocus(tabId)
})

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    void onTabFocus(null)
  } else {
    chrome.tabs.query({ active: true, windowId }, ([tab]) => {
      if (tab) void onTabFocus(tab.id)
    })
  }
})

// ─── Content-script messages ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'activity' && sender.tab) {
    const domain = getDomain(sender.tab.url || '')
    if (domain && isTrackable(sender.tab.url || '')) {
      void accumulate(domain, msg.keystrokes, msg.clicks, 0)
    }
  }
})

// ─── Periodic flush (every 60 s) ──────────────────────────────────────────────

chrome.alarms.create('flush', { periodInMinutes: 1 })

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'flush') return
  if (activeTabDomain && isTrackable(activeTabUrl)) {
    const elapsed = Math.round((Date.now() - activeTabStartedAt) / 1000)
    if (elapsed > 0) {
      await accumulate(activeTabDomain, 0, 0, elapsed)
      activeTabStartedAt = Date.now()
    }
  }
  await flushPending()
})

// ─── Popup messages ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'popup:signIn') {
    signIn(msg.email, msg.password)
      .then((auth) => reply({ ok: true, email: auth.email }))
      .catch((e) => reply({ ok: false, error: e.message }))
    return true
  }
  if (msg.type === 'popup:signOut') {
    signOut().then(() => reply({ ok: true }))
    return true
  }
  if (msg.type === 'popup:status') {
    getValidAuth()
      .then((auth) => reply({ signedIn: !!auth, email: auth?.email ?? null }))
      .catch(() => reply({ signedIn: false, email: null }))
    return true
  }
})
