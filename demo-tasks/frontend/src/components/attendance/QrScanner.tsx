import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'

/**
 * Rear camera + jsQR (works in iPhone Safari / home-screen PWA, where BarcodeDetector is missing).
 * Calls onText once per distinct QR text (an expired QR is never resent; the screen shows a new one every 6 s).
 */
export function QrScanner({ onText, paused = false }: { onText: (text: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastRef = useRef('')
  const pausedRef = useRef(paused)
  const cbRef = useRef(onText)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    pausedRef.current = paused
    cbRef.current = onText
  }, [paused, onText])

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let lastScan = 0
    let stopped = false

    const tick = (t: number) => {
      if (stopped) return
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || pausedRef.current || video.readyState < 2 || t - lastScan < 150) return
      lastScan = t
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)
      if (!w || !h) return
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
      if (code?.data && code.data !== lastRef.current) {
        lastRef.current = code.data
        cbRef.current(code.data)
      }
    }

    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Камера недоступна в этом браузере. Откройте сайт в Safari по https.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play().catch(() => undefined)
        raf = requestAnimationFrame(tick)
      } catch {
        setError('Нет доступа к камере. Разрешите камеру для сайта в настройках Safari.')
      }
    })()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  if (error) return <p className="rounded-[9px] border border-danger p-3 text-sm text-danger">{error}</p>
  return (
    <div className="relative overflow-hidden rounded-[12px] bg-black">
      <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted autoPlay />
      <div className="pointer-events-none absolute inset-[18%] rounded-[12px] border-2 border-white/80" />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
