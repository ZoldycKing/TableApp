'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type MouseEvent, type ReactNode } from 'react'
import { ArrowUpRightIcon, CheckIcon } from '@phosphor-icons/react/ssr'
import { TemplateIcon } from '@/components/template-icon'
import { installedTemplateHref, STARTER_GROUPS } from '@/lib/templates/starter-groups'
import { applyTemplateAction } from '@/app/template-actions'
import styles from './inner-pages.module.css'

export type ShowcaseTemplate = { id: string; name: string; description: string; features: { name: string; description: string }[]; note?: string }

export function TemplateShowcase({ templates, selectedId, startHref, preview, canInstall = false, featured = false }: { templates: ShowcaseTemplate[]; selectedId: string; startHref: string; preview: ReactNode; canInstall?: boolean; featured?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const selected = templates.find(item => item.id === selectedId)!
  const group = STARTER_GROUPS.find(item => item.templateIds.some(id => id === selectedId))!
  const visible = templates.filter(item => group.templateIds.some(id => id === item.id))
  const choose = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (lock.current) { event.preventDefault(); return }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    setError(null)
    startTransition(() => router.replace(`/templates?preview=${encodeURIComponent(id)}`, { scroll: false }))
  }
  const install = () => {
    if (lock.current) return
    lock.current = true; setInstalling(true); setError(null)
    startTransition(async () => {
      try {
        const result = await applyTemplateAction(selectedId)
        if (result.ok) { router.push(installedTemplateHref(selectedId, result.appId)); return }
        setError(result.error)
      } catch { setError('Не удалось подготовить шаблон. Проверьте соединение и попробуйте ещё раз.') }
      lock.current = false; setInstalling(false)
    })
  }
  return <div data-template-showcase aria-busy={pending || installing}>
    <div className={styles.templateGroups}><nav className={styles.segment} aria-label="Кому нужно приложение">{STARTER_GROUPS.map(item => <Link key={item.id} href={`/templates?preview=${item.templateIds[0]}`} aria-current={item.id === group.id ? 'page' : undefined} onClick={event => choose(event, item.templateIds[0])}>{item.id === 'client-apps' ? 'Для клиентов' : 'Для команды'}</Link>)}</nav></div>
    <div className={styles.templateLayout}>
      <nav className={styles.templateNav} aria-label="Выбор шаблона">{visible.map(item => <Link key={item.id} href={`/templates?preview=${item.id}`} aria-current={selectedId === item.id ? 'page' : undefined} aria-controls="selected-template" onClick={event => choose(event,item.id)}><TemplateIcon id={item.id} /><span>{item.name}</span></Link>)}</nav>
      <article id="selected-template" aria-labelledby="selected-template-title" className={`${styles.templateBody} ${pending ? styles.templateLoading : ''}`}>
        <div className={featured ? styles.templateFeatured : styles.templateDetail}>
          <div className={styles.templateCopy}><TemplateIcon id={selectedId} /><h2 id="selected-template-title">{selected.name}</h2><p>{selected.description}</p>{canInstall ? <button type="button" disabled={pending || installing} onClick={install} className={styles.primary}>{installing ? 'Подготавливаем шаблон…' : 'Начать с этого шаблона'}{!installing && <ArrowUpRightIcon size={18} aria-hidden />}</button> : <Link href={startHref} className={styles.primary}>Начать с этого шаблона<ArrowUpRightIcon size={18} aria-hidden /></Link>}<Link href={`/templates/${selectedId}`} className={styles.textLink}>Подробнее о шаблоне<ArrowUpRightIcon size={16} aria-hidden /></Link>{error && <p role="alert" className={styles.error}>{error}</p>}{!featured && <ul>{selected.features.map(feature => <li key={feature.name}><CheckIcon size={16} aria-hidden /><span><strong>{feature.name}.</strong> {feature.description.charAt(0).toUpperCase()+feature.description.slice(1)}</span></li>)}</ul>}</div>
          {featured ? preview : <div className={styles.templatePreview}><div className={styles.templatePreviewCanvas}>{preview}</div><p>Можно открывать разделы и карточки</p></div>}
        </div>
        {selected.note && <p className={styles.templateNote}>{selected.note}</p>}
      </article>
    </div>
    {(pending || installing) && <p role="status" className={styles.templatePending}><span className={styles.skeleton} aria-hidden />{installing ? 'Подготавливаем приложение…' : 'Открываем шаблон…'}</p>}
  </div>
}
