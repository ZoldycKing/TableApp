'use client'

import { useEffect, useRef, useState, useTransition, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MODULE_DEFINITIONS, type App } from '@tableapp/schema'
import { hasUnsaved } from '@/lib/unsaved'
import { availableModuleStarters } from '@/lib/module-options'
import { legacyAppModules } from '@/lib/app-modules'
import { connectModuleAction, enableModuleAccessAction, previewModuleConnectionAction, setCommunicationsAction, setModuleIntakeAction, setPrimaryClientAppAction } from '@/app/module-actions'

function useMenuOpen(open: boolean, root: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) onClose() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, onClose, root])
}

/** Custom single-select — no native <select>, same listbox pattern as SupportSelect / ServiceSelect. */
function ModuleSelect({ label, value, options, onChange, disabled = false }: {
  label: string
  value: string
  options: { id: string; name: string }[]
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useMenuOpen(open, root, () => setOpen(false))
  const selected = options.find(item => item.id === value)
  return <div className="block space-y-1 text-sm">
    <span id={`${label}-label`}>{label}</span>
    <div className="relative max-w-lg" ref={root}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-sand-200 bg-white px-3 py-2 text-left text-sm disabled:opacity-50 hover:bg-sand-50"
        aria-labelledby={`${label}-label`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
      >
        <span className="min-w-0 break-words">{selected?.name ?? 'Выберите'}</span>
        <span aria-hidden="true" className="text-ink-muted">▾</span>
      </button>
      {open ? <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-sand-200 bg-white p-1 shadow-lift" role="listbox" aria-label={label}>
        {options.map(option => <button
          key={option.id || option.name}
          type="button"
          role="option"
          aria-selected={option.id === value}
          className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sand-50 ${option.id === value ? 'bg-sand-50 font-medium' : ''}`}
          onClick={() => { onChange(option.id); setOpen(false) }}
        >{option.name}</button>)}
      </div> : null}
    </div>
  </div>
}

export function ModuleManager({ app, primary, sources, owner = false }: { app: App; primary: boolean; sources: { id: string; name: string; kind: string }[]; owner?: boolean }) {
  const router = useRouter(), [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null), [source, setSource] = useState('')
  const [preview, setPreview] = useState<Extract<Awaited<ReturnType<typeof previewModuleConnectionAction>>, { ok: true }> | null>(null)
  const [selection, setSelection] = useState('')
  const modules = app.modules ?? legacyAppModules(app), clientApp = Boolean((app.booking || app.customer) && app.screens.some(screen => screen.access.public || screen.access.roles.includes('client')))
  const choices = availableModuleStarters(modules.map(module => module.kind))
  const choice = choices.find(choice => choice.templateId === selection) ?? choices[0]
  const addition = choice?.templateId, desiredKind = choice?.kind
  const sourceOptions = [
    { id: '', name: 'Создать пустые таблицы для нового раздела' },
    ...(desiredKind !== 'inventory' && desiredKind !== 'production'
      ? sources.filter(item => item.kind === desiredKind).map(item => ({ id: item.id, name: `Использовать таблицы: ${item.name}` }))
      : []),
  ]
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => start(async () => {
    if (hasUnsaved()) { setMessage('Дождитесь сохранения изменений конструктора. Если сохранение завершилось ошибкой, сначала исправьте её.'); return }
    const result = await action()
    setMessage(result.ok ? success : result.error ?? 'Не удалось сохранить')
    if (result.ok) { setPreview(null); setSource(''); setSelection(''); router.refresh() }
  })
  if (!modules.length) return null
  const button = 'rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm disabled:opacity-50 hover:bg-sand-50'
  return <section className="mb-5 space-y-3 rounded-xl border border-sand-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Возможности приложения</h2>
      {clientApp ? primary ? <span className="text-xs text-ink-muted">Основное приложение бизнеса</span> : <button className={button} disabled={pending} onClick={() => run(() => setPrimaryClientAppAction(app.id), 'Основное приложение выбрано. Его ссылка сохранена.')}>Выбрать основным для клиентов</button> : null}
    </div>
    <p className="text-sm text-ink-muted">Подключение меняет черновик. Клиенты увидят изменения после публикации. Приостановка сохраняет текущие обращения и историю.</p>
    <div className="flex flex-wrap gap-3">{modules.map(module => <div key={module.id} className="flex items-center gap-3 rounded-lg bg-sand-50 px-3 py-2">
      <span className="text-sm">{MODULE_DEFINITIONS[module.kind].name}{module.intakeEnabled === false ? ' · новые оформления приостановлены' : ''}</span>
      {['booking', 'customer'].includes(module.source.type) ? <button disabled={pending} className="text-xs underline underline-offset-2 disabled:opacity-50" onClick={() => run(() => setModuleIntakeAction(app.id, module.id, module.intakeEnabled === false), 'Режим сохранён в черновике. Опубликуйте изменения.')}>{module.intakeEnabled === false ? 'Возобновить' : 'Приостановить'}</button> : null}
    </div>)}</div>
    {clientApp ? <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-3" data-communications-toggle>
      <span className="text-sm">Переписка и документы по обращениям</span>
      <button className={button} disabled={pending} onClick={() => run(() => setCommunicationsAction(app.id, !app.communications?.enabled), 'Режим переписки сохранён в черновике. Опубликуйте изменения.')}>{app.communications?.enabled ? 'Отключить новые переписки' : 'Включить переписку'}</button>
      {owner ? <Link href="/messages" className="text-sm text-sage-700 underline">Открыть сообщения клиентов</Link> : null}
      <p className="w-full text-xs text-ink-muted">В карточке записи и в разделе «Чат» / «Сообщения». Сообщения и файлы доступны участникам конкретного обращения. Отключение сохраняет существующие диалоги.</p>
    </div> : null}
    {!app.moduleAccess ? <button className={button} disabled={pending} onClick={() => run(() => enableModuleAccessAction(app.id), 'Рабочие права разделены по модулям в черновике. Прежние приглашения сохранены.')}>Разделить рабочие права по возможностям</button> : null}
    {addition ? <div className="space-y-3 border-t border-sand-200 pt-3">
      <ModuleSelect
        label="Добавить возможность"
        value={addition}
        disabled={pending}
        options={choices.map(item => ({ id: item.templateId, name: item.name }))}
        onChange={id => { setSelection(id); setSource(''); setPreview(null); setMessage(null) }}
      />
      <ModuleSelect
        label="Данные нового раздела"
        value={source}
        disabled={pending}
        options={sourceOptions}
        onChange={id => { setSource(id); setPreview(null) }}
      />
      <button className={button} disabled={pending} onClick={() => start(async () => {
        const result = await previewModuleConnectionAction(app.id, addition, source || undefined)
        if (result.ok) { setPreview(result); setMessage(null) } else { setPreview(null); setMessage(result.error) }
      })}>Проверить подключение</button>
      {preview ? <div className="space-y-2 rounded-lg bg-sand-50 p-3 text-sm"><p>{preview.already ? 'Раздел уже подключён.' : preview.reused ? 'Будут использованы существующие таблицы и записи. Новые таблицы не создаются.' : `Будут созданы ${preview.newTables} таблицы без демонстрационных записей: ${preview.resources.join(', ')}.`}</p>
        {desiredKind === 'production' ? <p>Годные изделия поступят на общий склад; материалы списываются по нормам. Резервы заказов сохраняются.</p> : null}
        <p>Ссылка приложения сохранится. Рабочие права текущих сотрудников не расширятся. Изменения потребуют публикации.</p>
        {!preview.already ? <button className={button} disabled={pending} onClick={() => run(() => connectModuleAction(app.id, addition, preview.expectedHash, source || undefined, preview.sourceHash), 'Возможность подключена в черновик. Проверьте данные и опубликуйте приложение.')}>Подключить в черновик</button> : null}
      </div> : null}
    </div> : null}
    {message ? <p role="status" className="text-sm text-ink-soft">{message}</p> : null}
  </section>
}
