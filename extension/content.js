// ─── Distraction domains ──────────────────────────────────────────────────────

// These sites show the overlay immediately when the timer is running.
const DISTRACTION_DOMAINS = new Set([
  'reddit.com', 'www.reddit.com', 'old.reddit.com',
  'tiktok.com', 'www.tiktok.com',
  'netflix.com', 'www.netflix.com',
  'twitch.tv', 'www.twitch.tv',
  'hulu.com', 'www.hulu.com',
  'disneyplus.com', 'www.disneyplus.com',
  'primevideo.com', 'www.primevideo.com',
  '9gag.com', 'www.9gag.com',
  'buzzfeed.com', 'www.buzzfeed.com',
  'pinterest.com', 'www.pinterest.com',
  'snapchat.com', 'www.snapchat.com',
  'tumblr.com', 'www.tumblr.com',
])

// These sites get a 2-minute grace period before the overlay appears.
const DELAYED_DOMAINS = new Set([
  'youtube.com', 'www.youtube.com',
  'instagram.com', 'www.instagram.com',
  'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
  'facebook.com', 'www.facebook.com',
])

// ─── Keystroke / click counting ───────────────────────────────────────────────

let keystrokes = 0
let clicks = 0

document.addEventListener('keydown', () => keystrokes++, { capture: true, passive: true })
document.addEventListener('click', () => clicks++, { capture: true, passive: true })

function flushCounts() {
  if (keystrokes === 0 && clicks === 0) return
  try { chrome.runtime.sendMessage({ type: 'activity', keystrokes, clicks }) } catch { /* ok */ }
  keystrokes = 0
  clicks = 0
}

setInterval(flushCounts, 30_000)
window.addEventListener('beforeunload', flushCounts)
document.addEventListener('visibilitychange', () => { if (document.hidden) flushCounts() })

// ─── Distraction overlay ──────────────────────────────────────────────────────

function showDistractionOverlay() {
  if (document.getElementById('tandem-overlay')) return

  const domain = location.hostname

  const overlay = document.createElement('div')
  overlay.id = 'tandem-overlay'
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(0,0,0,0.85)', 'backdrop-filter:blur(8px)',
    'display:flex', 'align-items:center', 'justify-content:center',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  ].join(';')

  overlay.innerHTML = `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;max-width:440px;width:90%;box-shadow:0 25px 60px rgba(0,0,0,0.6);color:#e2e8f0">
      <div style="font-size:20px;font-weight:600;margin-bottom:8px">⏱️ Timer is running</div>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 18px">
        This site is usually one used for relaxing — but your timer is still going.
        To continue here, tell me exactly what you're working on and press <strong style="color:#e2e8f0">Enter</strong>.
      </p>

      <div style="position:relative">
        <textarea
          id="tandem-reason"
          placeholder="e.g. Watching a React tutorial for the project..."
          style="width:100%;padding:10px 12px;border-radius:8px;background:#0f172a;border:1px solid #334155;color:#e2e8f0;font-size:13px;resize:none;height:76px;box-sizing:border-box;font-family:inherit;outline:none;transition:border-color .15s"
        ></textarea>
        <button id="tandem-submit" title="Submit (Enter)" style="position:absolute;right:8px;bottom:8px;padding:5px 11px;border:none;border-radius:6px;background:#6366f1;color:#fff;font-size:12px;font-weight:500;cursor:pointer">
          Enter →
        </button>
      </div>

      <div id="tandem-ai-msg" style="display:none;margin-top:10px;padding:9px 12px;border-radius:8px;font-size:13px;line-height:1.5"></div>

      <div style="display:flex;gap:8px;margin-top:14px">
        <button id="tandem-btn-break" style="flex:1;padding:10px;border:1px solid #475569;border-radius:8px;background:transparent;color:#94a3b8;font-size:13px;cursor:pointer;transition:color .15s">
          I am taking a break
        </button>
        <button id="tandem-btn-lockin" style="flex:1;padding:10px;border:1px solid #ef4444;border-radius:8px;background:transparent;color:#f87171;font-size:13px;cursor:pointer;transition:color .15s">
          I am distracted — lock in
        </button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  const textarea = document.getElementById('tandem-reason')
  const submitBtn = document.getElementById('tandem-submit')
  const aiMsg = document.getElementById('tandem-ai-msg')

  setTimeout(() => textarea?.focus(), 60)

  // Focus ring on textarea
  textarea.addEventListener('focus', () => { textarea.style.borderColor = '#6366f1' })
  textarea.addEventListener('blur', () => { textarea.style.borderColor = '#334155' })

  function setLoading(on) {
    submitBtn.disabled = on
    submitBtn.textContent = on ? '…' : 'Enter →'
    textarea.disabled = on
  }

  function showAiMessage(msg, approved) {
    aiMsg.style.display = 'block'
    aiMsg.style.background = approved ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'
    aiMsg.style.color = approved ? '#86efac' : '#fca5a5'
    aiMsg.style.border = `1px solid ${approved ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
    aiMsg.textContent = msg
  }

  async function submitExplanation() {
    const reason = textarea.value.trim()
    if (!reason) {
      showAiMessage('Please describe what you are working on first.', false)
      return
    }
    setLoading(true)
    try {
      chrome.runtime.sendMessage(
        { type: 'distraction:explain', domain, reason },
        (res) => {
          setLoading(false)
          if (!res) { showAiMessage('Could not reach Tandem — try again.', false); return }
          if (res.approved) {
            overlay.remove()
          } else {
            showAiMessage(res.message || 'That\'s not specific enough — try again.', false)
            textarea.focus()
          }
        },
      )
    } catch {
      setLoading(false)
      showAiMessage('Extension error — try again.', false)
    }
  }

  submitBtn.addEventListener('click', submitExplanation)

  // Enter submits; Shift+Enter adds a new line
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitExplanation()
    }
  })

  document.getElementById('tandem-btn-break').addEventListener('click', () => {
    overlay.remove()
    try { chrome.runtime.sendMessage({ type: 'distraction:action', action: 'break', domain }) } catch { /* ok */ }
  })

  document.getElementById('tandem-btn-lockin').addEventListener('click', () => {
    // Navigate the current tab away to Tandem — strongest commitment signal
    try { chrome.runtime.sendMessage({ type: 'distraction:action', action: 'lock_in', domain }) } catch { /* ok */ }
  })
}

// ─── Page-load check ─────────────────────────────────────────────────────────

const isDistraction = DISTRACTION_DOMAINS.has(location.hostname)
const isDelayed = DELAYED_DOMAINS.has(location.hostname)

if (isDistraction || isDelayed) {
  const delayMs = isDelayed ? 120_000 : 800 // 2 min for YouTube etc., instant for others

  setTimeout(() => {
    try {
      chrome.runtime.sendMessage({ type: 'content:checkTimer' }, (res) => {
        if (res?.running) showDistractionOverlay()
      })
    } catch { /* extension not ready */ }
  }, delayMs)
}
