import Link from 'next/link'
import { DesktopIcon, DeviceMobileIcon } from '@phosphor-icons/react/ssr'
import styles from './template-demo-stage.module.css'

/** Same screen tabs and device controls for every template presentation. */
export function TemplateDemoControls({ screens, selected, phone, label, onScreenChange, onDeviceChange, deviceLinks }: {
  screens: readonly { id: string; label: string; href?: string }[]; selected: string; phone: boolean; label: string
  onScreenChange?: (id: string) => void; onDeviceChange?: (phone: boolean) => void
  deviceLinks?: { desktop: string; phone: string }
}) {
  return <>
    <nav className={styles.screens} aria-label={label}>
      {screens.map(screen => screen.href
        ? <Link key={screen.id} href={screen.href} aria-current={selected === screen.id ? 'page' : undefined}>{screen.label}</Link>
        : <button key={screen.id} type="button" aria-pressed={selected === screen.id} onClick={() => onScreenChange?.(screen.id)}>{screen.label}</button>)}
    </nav>
    <nav className={styles.devices} aria-label="Размер экрана">
      {deviceLinks ? <>
        <Link href={deviceLinks.desktop} aria-label="Компьютер" aria-current={!phone ? 'page' : undefined}><DesktopIcon size={19} aria-hidden /></Link>
        <Link href={deviceLinks.phone} aria-label="Телефон" aria-current={phone ? 'page' : undefined}><DeviceMobileIcon size={19} aria-hidden /></Link>
      </> : <>
        <button type="button" aria-label="Компьютер" aria-pressed={!phone} onClick={() => onDeviceChange?.(false)}><DesktopIcon size={19} aria-hidden /></button>
        <button type="button" aria-label="Телефон" aria-pressed={phone} onClick={() => onDeviceChange?.(true)}><DeviceMobileIcon size={19} aria-hidden /></button>
      </>}
    </nav>
  </>
}
