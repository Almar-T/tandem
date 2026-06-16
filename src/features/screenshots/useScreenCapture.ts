import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const MAX_WIDTH = 1280 // downscale to keep within the free storage tier

/**
 * Consent-based screen capture. The user picks a screen via getDisplayMedia
 * (the browser shows its own sharing indicator the whole time), and we grab a
 * downscaled JPEG frame on an interval, uploading each to Storage.
 */
export function useScreenCapture(userId: string) {
  const qc = useQueryClient()
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const intervalRef = useRef<number | null>(null)

  function stop() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    videoRef.current = null
    setCapturing(false)
  }

  async function capture(retentionDays: number) {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.6))
    if (!blob) return

    const path = `${userId}/${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage
      .from('screenshots')
      .upload(path, blob, { contentType: 'image/jpeg' })
    if (upErr) {
      setError(upErr.message)
      return
    }
    const expires = new Date(Date.now() + retentionDays * 86400000).toISOString()
    await supabase.from('screenshots').insert({ user_id: userId, storage_path: path, expires_at: expires })
    qc.invalidateQueries({ queryKey: ['screenshots'] })
  }

  async function start(freqSec: number, retentionDays: number) {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      })
      streamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()
      videoRef.current = video
      // If the user ends sharing via the browser's own control, clean up.
      stream.getVideoTracks()[0].addEventListener('ended', stop)
      setCapturing(true)
      await capture(retentionDays)
      intervalRef.current = window.setInterval(() => void capture(retentionDays), freqSec * 1000)
    } catch (e) {
      setError((e as Error).message)
      stop()
    }
  }

  return { capturing, error, start, stop }
}
