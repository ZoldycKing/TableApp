'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MODULE_DEFINITIONS, type App } from '@tableapp/schema'
import { hasUnsaved } from '@/lib/unsaved'
import { availableModuleStarters } from '@/lib/module-options'
import { legacyAppModules } from '@/lib/app-modules'
import { connectModuleAction, enableModuleAccessAction, previewModuleConnectionAction, setCommunicationsAction, setModuleIntakeAction, setPrimaryClientAppAction } from '@/app/module-actions'

export function ModuleManager({ app, primary, sources, owner = false }: { app: App; primary: boolean; sources: { id: string; name: string; kind: string }[]; owner?: boolean }) {
  const router = useRouter(), [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null), [source, setSource] = useState('')
  const [preview, setPreview] = useState<Extract<Awaited<ReturnType<typeof previewModuleConnectionAction>>, { ok: true }> | null>(null)
  const [selection, setSelection] = useState('')
  const modules = app.modules ?? legacyAppModules(app), clientApp = Boolean((app.booking || app.customer) && app.screens.some(screen => screen.access.public || screen.access.roles.includes('client')))
  const choices = availableModuleStarters(modules.map(module => module.kind))
  const choice = choices.find(choice => choice.templateId === selection) ?? choices[0]
  const addition = choice?.templateId, desiredKind = choice?.kind
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
    {clientApp ? <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-3"><span className="text-sm">Переписка и документы по обращениям</span>
      <button className={button} disabled={pending} onClick={() => run(() => setCommunicationsAction(app.id, !app.communications?.enabled), 'Режим переписки сохранён в черновике. Опубликуйте изменения.')}>{app.communications?.enabled ? 'Отключить новые переписки' : 'Включить переписку'}</button>
      {owner ? <Link href="/messages" className="text-sm text-sage-700 underline">Открыть сообщения клиентов</Link> : null}
      <p className="w-full text-xs text-ink-muted">Сообщения и файлы доступны участникам конкретного обращения. Отключение сохраняет существующие диалоги.</p>
    </div> : null}
    {!app.moduleAccess ? <button className={button} disabled={pending} onClick={() => run(() => enableModuleAccessAction(app.id), 'Рабочие права разделены по модулям в черновике. Прежние приглашения сохранены.')}>Разделить рабочие права по возможностям</button> : null}
    {addition ? <div className="space-y-3 border-t border-sand-200 pt-3">
      <label className="block space-y-1 text-sm"><span>Добавить возможность</span><select value={addition} disabled={pending} onChange={event => { setSelection(event.target.value); setSource(''); setPreview(null); setMessage(null) }} className="w-full max-w-lg rounded-lg border border-sand-200 px-3 py-2">
        {choices.map(choice => <option key={choice.templateId} value={choice.templateId}>{choice.name}</option>)}
      </select></label>
      <label className="block space-y-1 text-sm"><span>Данные нового раздела</span><select value={source} disabled={pending} onChange={event => { setSource(event.target.value); setPreview(null) }} className="w-full max-w-lg rounded-lg border border-sand-200 px-3 py-2">
        <option value="">Создать пустые таблицы для нового раздела</option>
        {desiredKind !== 'inventory' && desiredKind !== 'production' ? sources.filter(item => item.kind === desiredKind).map(item => <option key={item.id} value={item.id}>Использовать таблицы: {item.name}</option>) : null}
      </select></label>
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
