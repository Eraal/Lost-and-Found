import React, { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

export type QrCameraScannerProps = {
  onResult: (code: string) => void
  onError?: (err: Error) => void
  facingMode?: 'environment' | 'user'
  pause?: boolean
  className?: string
  style?: React.CSSProperties
  continuous?: boolean // if false, stops after first decode
  intervalMs?: number
}

/**
 * Lightweight QR camera scanner using getUserMedia + jsQR.
 * - No external UI dependencies.
 * - Works best over HTTPS; on localhost it's allowed.
 */
export const QrCameraScanner: React.FC<QrCameraScannerProps> = ({
  onResult,
  onError,
  facingMode = 'environment',
  pause = false,
  className,
  style,
  continuous = false,
  intervalMs = 220,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [scanning, setScanning] = useState(false)
  const rafRef = useRef<number | null>(null)
  const lastScanRef = useRef<number>(0)
  const stoppedRef = useRef(false)

  const stopStream = useCallback(() => {
    stoppedRef.current = true
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
    }
    setStream(null)
    setScanning(false)
  }, [stream])

  useEffect(() => {
    if (pause) return
    let active = true
    ;(async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        })
        if (!active) {
          media.getTracks().forEach(t => t.stop())
          return
        }
        setStream(media)
        setReady(true)
      } catch (e) {
        onError?.(e as Error)
      }
    })()
    return () => { active = false }
  }, [facingMode, pause, onError])

  const tick = useCallback(() => {
    if (pause || stoppedRef.current) return
    rafRef.current = requestAnimationFrame(tick)
    const now = performance.now()
    if (now - lastScanRef.current < intervalMs) return
    lastScanRef.current = now

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    const img = ctx.getImageData(0, 0, w, h)
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
    if (code && code.data) {
      onResult(code.data.trim())
      if (!continuous) {
        stopStream()
      }
    }
  }, [continuous, intervalMs, onResult, pause, stopStream])

  useEffect(() => {
    if (!ready || pause || scanning || stoppedRef.current) return
    setScanning(true)
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [ready, pause, scanning, tick])

  useEffect(() => () => stopStream(), [stopStream])

  // Attach stream to video element when available (avoids using non-standard attr in JSX)
  useEffect(() => {
    const vid = videoRef.current
    if (vid && stream) {
      try {
        if (vid.srcObject !== stream) {
          vid.srcObject = stream
        }
      } catch {
        // ignore: most modern browsers support srcObject
      }
    }
  }, [stream])

  return (
    <div className={className} style={style}>
      <div className="relative w-full aspect-video overflow-hidden rounded-md bg-black/40">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setReady(true)}
          className="w-full h-full object-cover"
        />
        {/* Guide overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2/3 h-2/3 border-2 border-white/70 rounded-lg backdrop-blur-[1px]" />
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--ink-600)]">
        <span>{ready ? (scanning ? 'Scanning…' : 'Starting…') : 'Requesting camera…'}</span>
        {stream && (
          <button type="button" onClick={stopStream} className="text-[color:var(--brand)] hover:underline">Stop</button>
        )}
      </div>
    </div>
  )
}

export default QrCameraScanner
