'use client'

import { useState, type ReactNode } from 'react'
import { DesktopIcon, DeviceMobileIcon } from '@phosphor-icons/react/ssr'
import { TemplateDemoStage } from './template-demo-stage'
import styles from './template-demo-stage.module.css'

export function StarterPreviewStage({ children, initialPhone = false }: { children: ReactNode; initialPhone?: boolean }) {
  const [phone, setPhone] = useState(initialPhone), [reset, setReset] = useState(0)
  return <TemplateDemoStage phone={phone} controls={<>
    <button type="button" onClick={() => setReset(value => value + 1)}>Начать заново</button>
    <div className={styles.devices} role="group" aria-label="Размер экрана">
      <button type="button" aria-label="Компьютер" aria-pressed={!phone} onClick={() => setPhone(false)}><DesktopIcon size={19} aria-hidden /></button>
      <button type="button" aria-label="Телефон" aria-pressed={phone} onClick={() => setPhone(true)}><DeviceMobileIcon size={19} aria-hidden /></button>
    </div>
  </>} note="Учебный пример. Открывайте разделы и карточки — изменения сбросятся после обновления страницы.">
    <div key={reset} className="h-full min-w-0">{children}</div>
  </TemplateDemoStage>
}
