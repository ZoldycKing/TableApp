import css from './ui.module.css'

function variantOf(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 33 + seed.charCodeAt(index)) >>> 0
  return String(hash % 4)
}

/** Geometric mark. The same seed always paints the same shape, and never letters. */
export function Avatar({ id, size = 32, fill = false, label }: { id: string; size?: number; fill?: boolean; label?: string }) {
  return (
    <span className={css.avatar} data-variant={variantOf(id)} style={fill ? { width: '100%', height: '100%' } : { width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <i /><b />
    </span>
  )
}
