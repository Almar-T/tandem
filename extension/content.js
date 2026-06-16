// Counts keystrokes and clicks within this page, then reports to the background
// worker every 30 s, on blur, and on page unload.

let keystrokes = 0
let clicks = 0

document.addEventListener('keydown', () => keystrokes++, { capture: true, passive: true })
document.addEventListener('click', () => clicks++, { capture: true, passive: true })

function flush() {
  if (keystrokes === 0 && clicks === 0) return
  try {
    chrome.runtime.sendMessage({ type: 'activity', keystrokes, clicks })
  } catch {
    // Extension context may be invalidated after an update — ignore.
  }
  keystrokes = 0
  clicks = 0
}

setInterval(flush, 30_000)
window.addEventListener('beforeunload', flush)
document.addEventListener('visibilitychange', () => { if (document.hidden) flush() })
