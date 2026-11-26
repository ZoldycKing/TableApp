'use client'
import { Switch } from '@/components/ui/choice'

/** Track-and-thumb control used by screen and component settings. */
export function SettingSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <Switch label={label} checked={checked} onChecked={onChange} />
}
