import type { CSSProperties, ReactNode } from 'react'
import styles from './phone-mockup.module.css'

/** Shared metrics for layout math (demo stage scaling, shot viewports). */
export const PHONE_MOCKUP = {
  bezel: 11,
  radius: 44,
  width: 390,
  statusBar: 36,
  homeGap: 20,
} as const

function SignalIcon() {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden focusable="false">
      <rect x="0" y="7" width="2.5" height="4" rx="0.6" fill="currentColor" opacity="0.35" />
      <rect x="4" y="5" width="2.5" height="6" rx="0.6" fill="currentColor" opacity="0.55" />
      <rect x="8" y="2.5" width="2.5" height="8.5" rx="0.6" fill="currentColor" opacity="0.8" />
      <rect x="12" y="0" width="2.5" height="11" rx="0.6" fill="currentColor" />
    </svg>
  )
}

function WifiIcon() {
  return (
    <svg width="14" height="11" viewBox="0 0 14 11" aria-hidden focusable="false">
      <path d="M7 9.6a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Z" fill="currentColor" transform="translate(0 -1.2)" />
      <path d="M3.4 7.2a5.1 5.1 0 0 1 7.2 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M1.2 4.7a8.1 8.1 0 0 1 11.6 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <path d="M-.6 2.3a11 11 0 0 1 15.2 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
    </svg>
  )
}

function BatteryIcon() {
  return (
    <svg width="24" height="11" viewBox="0 0 24 11" aria-hidden focusable="false">
      <rect x="0.6" y="0.6" width="19.5" height="9.8" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
      <rect x="2.2" y="2.2" width="14.2" height="6.6" rx="1.2" fill="currentColor" />
      <path d="M21.2 3.4h1.1c.7 0 1.1.4 1.1 1.1v2c0 .7-.4 1.1-1.1 1.1h-1.1" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

export function PhoneMockup({
  children,
  scheme,
  height,
  className = '',
  style,
}: {
  children: ReactNode
  scheme?: 'light' | 'dark'
  /** Optional fixed screen height (marketing frames). Outer height adds the bezel twice. */
  height?: number
  className?: string
  style?: CSSProperties
}) {
  const shellStyle: CSSProperties | undefined = height
    ? { ...style, height: height + PHONE_MOCKUP.bezel * 2 }
    : style
  return (
    <div
      className={`${styles.shell} ${className}`.trim()}
      data-phone="true"
      data-phone-mockup=""
      data-scheme={scheme}
      style={shellStyle}
    >
      <div className={styles.screen}>
        <div className={styles.status} aria-hidden="true">
          <span className={styles.time}>9:41</span>
          <span className={styles.island} />
          <span className={styles.icons}>
            <SignalIcon />
            <WifiIcon />
            <BatteryIcon />
          </span>
        </div>
        <div className={styles.body}>{children}</div>
        <span className={styles.home} aria-hidden="true" />
      </div>
    </div>
  )
}
