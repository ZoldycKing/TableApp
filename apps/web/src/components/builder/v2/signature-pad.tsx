'use client'
import { useEffect, useRef } from 'react'
import css from './dispatch.module.css'

/** Canvas signature. Pointer events cover mouse and touch; the pad does not use a letter mark. */
export function SignaturePad({ onChange, label = 'Подпись клиента' }: { onChange: (value: string | null) => void; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  useEffect(() => {
    const node = canvas.current
    if (!node) return
    const paint = () => {
      const rect = node.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      node.width = Math.max(1, Math.floor(rect.width * ratio))
      node.height = Math.max(1, Math.floor(rect.height * ratio))
      const context = node.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.lineWidth = 2.4
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.strokeStyle = '#3F6B5C'
    }
    paint()
  }, [])
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const context = () => canvas.current?.getContext('2d') ?? null
  const publish = () => {
    const node = canvas.current
    onChange(node && dirty.current ? node.toDataURL('image/png') : null)
  }
  return <div className={css.signature}>
    <div className={css.signatureHead}>
      <span>{label}</span>
      <button type="button" className={css.linkButton} onClick={() => {
        const node = canvas.current
        const draw = context()
        if (!node || !draw) return
        draw.clearRect(0, 0, node.width, node.height)
        dirty.current = false
        onChange(null)
      }}>Очистить</button>
    </div>
    <canvas
      ref={canvas}
      className={css.signaturePad}
      data-testid="signature-pad"
      aria-label={label}
      onPointerDown={event => {
        const draw = context()
        if (!draw) return
        drawing.current = true
        dirty.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        const at = point(event)
        draw.beginPath()
        draw.moveTo(at.x, at.y)
      }}
      onPointerMove={event => {
        if (!drawing.current) return
        const draw = context()
        if (!draw) return
        const at = point(event)
        draw.lineTo(at.x, at.y)
        draw.stroke()
      }}
      onPointerUp={event => { drawing.current = false; publish(); event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={() => { drawing.current = false }}
    />
  </div>
}
