'use client'
import ui from './view.module.css'

/** Track-and-thumb control used by screen and component settings. */
export function SettingSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={ui.switch}>
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  )
}
