import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return !!sub
}

/** Request permission, subscribe this device, and store the subscription. */
export async function enablePush(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) {
    return { ok: false, error: 'Notifications are not supported on this device/browser.' }
  }
  if (!env.vapidPublicKey) {
    return { ok: false, error: 'Push not configured yet (missing VITE_VAPID_PUBLIC_KEY).' }
  }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, error: 'Notification permission was denied.' }

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey) as BufferSource,
  })
  const json = sub.toJSON()

  // Avoid duplicate rows for the same device endpoint.
  const { data: existing } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('subscription->>endpoint', json.endpoint ?? '')
  if (existing && existing.length > 0) return { ok: true }

  const { error } = await supabase
    .from('push_subscriptions')
    .insert({ user_id: userId, subscription: json })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
