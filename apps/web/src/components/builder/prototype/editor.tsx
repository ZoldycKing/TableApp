'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Logo } from '@/components/marketing/logo'
import { PrototypeCanvas } from './canvas'
import { PrototypeDialog } from './dialog'
import { ProtoIcon } from './icons'
import { PrototypeInspector } from './inspector'
import { PrototypeWorkflows } from './workflows'
import { addBlock, cloneBlock, executeFlow, FIELDS, findBlock, KINDS, makeBlock, moveBlock, PEOPLE, removeBlock, reorderBlocks, restorePrototype, SOURCES, STATUSES, STORAGE_KEY, uid, visibleRows, type Block, type Data, type Document, type Kind, type Page, type Prototype, type Row, type Source } from './model'
import styles from './prototype.module.css'

type History = { past: Document[]; present: Document; future: Document[] }
type Panel = 'screens' | 'canvas' | 'properties'
type Modal = { type: 'library'; parent: string | null } | { type: 'page' } | { type: 'delete-page' } | null
const countBlocks = (items: Block[]): number => items.reduce((sum, block) => sum + 1 + countBlocks(block.children), 0)

function Outline({ blocks, selected, onSelect, onReorder, level = 0 }: { blocks: Block[]; selected: string | null; onSelect: (id: string) => void; onReorder: (from: string, to: string) => void; level?: number }) {
  const dragging = useRef<string | null>(null)
  return <ul className={styles.outline} data-level={level}>{blocks.map(block => <li key={block.id}>
    <div className={styles.outlineItem} data-selected={selected === block.id} draggable onDragStart={event => { dragging.current = block.id; event.dataTransfer.setData('text/plain', block.id); event.dataTransfer.effectAllowed = 'move' }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={event => { event.preventDefault(); const from = event.dataTransfer.getData('text/plain') || dragging.current; if (from) onReorder(from, block.id); dragging.current = null }}>
      <span className={styles.grip} aria-hidden><ProtoIcon name="grip" size={16} /></span><button type="button" aria-pressed={selected === block.id} onClick={() => onSelect(block.id)}><ProtoIcon name={KINDS[block.kind].icon} size={16} /><span>{block.title || KINDS[block.kind].name}</span></button>
    </div>{block.kind === 'columns' && <Outline blocks={block.children} selected={selected} onSelect={onSelect} onReorder={onReorder} level={level + 1} />}
  </li>)}</ul>
}

function DataPanel({ data, onData }: { data: Data; onData: (data: Data) => void }) {
  const [source, setSource] = useState<Source | 'history'>('requests')
  const change = (rowId: string, field: keyof Row, value: string) => {
    if (source === 'history') return
    const clean = field === 'amount' ? Number(value) : value
    if (typeof clean === 'number' && !Number.isFinite(clean)) return
    onData({ ...data, rows: { ...data.rows, [source]: data.rows[source].map(row => row.id === rowId ? { ...row, [field]: clean } : row) } })
  }
  return <div className={styles.dataWorkspace}><aside className={styles.sidebar}><div className={styles.panelHeading}><h2>Таблицы</h2></div>{[...Object.entries(SOURCES), ['history', 'История']].map(([id, name]) => <button key={id} type="button" className={styles.treePage} aria-current={id === source ? 'true' : undefined} onClick={() => setSource(id as Source | 'history')}><ProtoIcon name="table" /><span>{name}</span><small>{id === 'history' ? data.history.length : data.rows[id as Source].length}</small></button>)}</aside>
    <main id="builder-main" className={styles.dataMain}><header className={styles.dataHeading}><div><span className={styles.overline}>Проверочные таблицы</span><h1>{source === 'history' ? 'История' : SOURCES[source]}</h1></div><span>Изменения видны в приложении</span></header><div className={styles.dataTableScroll}>
      {source === 'history' ? <table className={styles.dataTable}><thead><tr><th>Запись</th><th>Событие</th></tr></thead><tbody>{data.history.map(item => <tr key={item.id}><td>{item.title}</td><td>{item.text}</td></tr>)}</tbody></table> : <table className={styles.dataTable}><thead><tr>{Object.values(FIELDS).map(field => <th key={field}>{field}</th>)}</tr></thead><tbody>{data.rows[source].map(row => <tr key={row.id}>{(Object.keys(FIELDS) as (keyof typeof FIELDS)[]).map(field => <td key={field}>{field === 'status' || field === 'assignee' ? <select aria-label={`${FIELDS[field]}: ${row.title}`} value={row[field]} onChange={event => change(row.id, field, event.target.value)}>{(field === 'status' ? STATUSES : PEOPLE).map(value => <option key={value}>{value}</option>)}</select> : <input aria-label={`${FIELDS[field]}: ${row.title}`} value={row[field]} type={field === 'amount' ? 'number' : 'text'} onChange={event => change(row.id, field, event.target.value)} />}</td>)}</tr>)}</tbody></table>}
    </div>{source === 'history' && !data.history.length && <div className={styles.historyEmpty}><span className={styles.elementMark}><ProtoIcon name="action" size={24} /></span><h2>История появится после действия</h2><p>В режиме «Попробовать» откройте заявку и нажмите «Завершить заявку».</p></div>}</main></div>
}

function NewPage({ onCreate }: { onCreate: (name: string, preset: string) => void }) {
  const [name, setName] = useState(''), [preset, setPreset] = useState('empty')
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) onCreate(name.trim(), preset) }
  return <form className={styles.newPageForm} onSubmit={submit}><label>Название экрана<input value={name} onChange={event => setName(event.target.value)} placeholder="Например, Мои задачи" maxLength={60} required /></label><fieldset><legend>С чего начать</legend><div className={styles.presetChoices}>{[['empty', 'Пустой экран', 'apps'], ['list', 'Список', 'table'], ['form', 'Форма', 'plus']].map(([id, title, icon]) => <label key={id}><input type="radio" name="preset" checked={preset === id} onChange={() => setPreset(id!)} /><ProtoIcon name={icon!} size={24} /><span>{title}</span></label>)}</div></fieldset><button type="submit" className={styles.primary} disabled={!name.trim()}>Создать экран<ProtoIcon name="arrow" /></button></form>
}

export function PrototypeEditor({ initial }: { initial: Prototype }) {
  const [history, setHistory] = useState<History>({ past: [], present: initial.document, future: [] })
  const document = history.present
  const [data, setData] = useState(initial.data), [tab, setTab] = useState<'screens' | 'data' | 'actions'>('screens')
  const [pageId, setPageId] = useState(initial.document.home), [selectedId, setSelectedId] = useState<string | null>(null)
  const [flowId, setFlowId] = useState('complete'), [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [editing, setEditing] = useState(true), [role, setRole] = useState<'owner' | 'staff'>('owner'), [rowId, setRowId] = useState('request-1')
  const [rowSource, setRowSource] = useState<Source | null>(null)
  const [panel, setPanel] = useState<Panel>('canvas'), [modal, setModal] = useState<Modal>(null), [search, setSearch] = useState('')
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [ready, setReady] = useState(false), [save, setSave] = useState('Загружаем прототип…')
  const page = document.pages.find(item => item.id === pageId) ?? document.pages[0]!
  const selected = selectedId ? findBlock(page.blocks, selectedId) : undefined
  const update = (next: Document) => setHistory(current => ({ past: [...current.past.slice(-39), current.present], present: next, future: [] }))
  const undo = () => setHistory(current => current.past.length ? { past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] } : current)
  const redo = () => setHistory(current => current.future.length ? { past: [...current.past, current.present], present: current.future[0]!, future: current.future.slice(1) } : current)
  const updatePage = (patch: Partial<Page>) => update({ ...document, pages: document.pages.map(item => item.id === page.id ? { ...item, ...patch } : item) })
  const pickBlock = (id: string) => { setSelectedId(id); if (window.innerWidth < 1100) setPanel('properties') }
  const pickPage = (id: string) => { setPageId(id); setSelectedId(null); setRowSource(null); setPanel('canvas'); setError(''); setNotice('') }
  const openLibrary = (parent: string | null = null) => { setSearch(''); setModal({ type: 'library', parent }) }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const value = restorePrototype(raw)
        if (value) { setHistory({ past: [], present: value.document, future: [] }); setData(value.data); setPageId(value.document.home) }
        else setNotice('Сохранённый прототип не удалось восстановить. Открыт исходный пример.')
      }
    } catch { setNotice('Хранилище браузера недоступно. Прототип работает до обновления страницы.') }
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready) return
    setSave('Сохраняем в браузере…')
    const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, document, data })); setSave('Сохранено в браузере') } catch { setSave('Не удалось сохранить в браузере') } }
    const timer = setTimeout(persist, 300)
    window.addEventListener('pagehide', persist)
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', persist) }
  }, [document, data, ready])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || (event.target instanceof HTMLElement && (event.target.closest('input,textarea,select,[contenteditable=true]')))) return
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [])

  const addElement = (kind: Kind) => {
    if (document.pages.reduce((sum, item) => sum + countBlocks(item.blocks), 0) + (kind === 'columns' ? 3 : 1) > 150) { setError('В этом прототипе доступно до 150 элементов.'); setModal(null); return }
    const block = makeBlock(kind)
    if (kind === 'columns') block.children = [makeBlock('metric'), makeBlock('metric')]
    const blocks = addBlock(page.blocks, block, modal?.type === 'library' ? modal.parent : null)
    const next = { ...document, pages: document.pages.map(item => item.id === page.id ? { ...item, blocks } : item) }
    if (!restorePrototype(JSON.stringify({ version: 1, document: next, data }))) { setError('Слишком много вложенных колонок. Добавьте элемент на уровень выше.'); setModal(null); return }
    update(next)
    setModal(null); setSelectedId(block.id); setPanel(window.innerWidth < 1100 ? 'properties' : 'canvas')
  }
  const duplicate = () => {
    if (!selected) return
    if (document.pages.reduce((sum, item) => sum + countBlocks(item.blocks), 0) + countBlocks([selected]) > 150) { setError('В этом прототипе доступно до 150 элементов.'); return }
    const copy = cloneBlock(selected); copy.title = `${selected.title} (копия)`
    const insert = (blocks: Block[]): Block[] => blocks.flatMap(block => block.id === selected.id ? [block, copy] : [{ ...block, children: insert(block.children) }])
    updatePage({ blocks: insert(page.blocks) }); setSelectedId(copy.id)
  }
  const run = (block: Block, form?: Partial<Row>): boolean => {
    if (!form && rowSource !== block.source) { setError(rowSource ? 'Для кнопки выбрана другая таблица. Проверьте её свойства.' : 'Сначала откройте нужную запись из списка.'); setNotice(''); return false }
    const row = visibleRows(data, block.source, role).find(item => item.id === rowId) ?? visibleRows(data, block.source, role)[0]
    const result = executeFlow(document, data, block.flowId, { source: block.source, rowId: form ? undefined : row?.id, form, role, requestId: uid() })
    if (!result.ok) { setError(result.error); setNotice(''); return false }
    setData(result.data); setNotice(result.notice); setError('')
    if (result.pageId) { setPageId(result.pageId); setSelectedId(null) }
    if (result.rowId) { setRowId(result.rowId); setRowSource(block.source) }
    return true
  }
  const createPage = (name: string, preset: string) => {
    if (document.pages.length >= 30) { setError('В прототипе доступно до 30 экранов.'); setModal(null); return }
    const id = uid(), block = preset === 'empty' ? null : makeBlock(preset === 'form' ? 'form' : 'collection')
    if (block && document.pages.reduce((sum, item) => sum + countBlocks(item.blocks), 0) >= 150) { setError('В этом прототипе доступно до 150 элементов.'); setModal(null); return }
    if (block?.kind === 'form') block.flowId = 'create'
    update({ ...document, pages: [...document.pages, { id, name, icon: preset === 'form' ? 'plus' : 'apps', blocks: block ? [block] : [] }] })
    setPageId(id); setSelectedId(null); setModal(null); setPanel('canvas')
  }
  const deletePage = () => {
    if (document.pages.length < 2) return
    const pages = document.pages.filter(item => item.id !== page.id)
    update({ ...document, pages, home: document.home === page.id ? pages[0]!.id : document.home })
    setPageId(pages[0]!.id); setSelectedId(null); setModal(null)
  }

  return <div className={styles.editor}>
    <a href="#builder-main" className={styles.skip}>Перейти к рабочей области</a>
    <header className={styles.header}><div className={styles.brandArea}><Link href="/apps" prefetch={false} aria-label="К приложениям" className={styles.brand}><Logo /></Link><span className={styles.headerDivider} /><input aria-label="Название приложения" value={document.name} placeholder="Моё приложение" onChange={event => update({ ...document, name: event.target.value })} /><span className={styles.prototypeLabel}>Прототип</span></div><div className={styles.headerActions}><span className={styles.saveState} role="status">{save}</span><div className={styles.undoGroup}><button type="button" aria-label="Отменить изменение" title="Отменить изменение" className={styles.iconButton} disabled={!history.past.length} onClick={undo}><ProtoIcon name="undo" /></button><button type="button" aria-label="Повторить изменение" title="Повторить изменение" className={styles.iconButton} disabled={!history.future.length} onClick={redo}><ProtoIcon name="redo" /></button></div><button type="button" className={editing ? styles.primary : styles.secondary} onClick={() => { setEditing(!editing); setTab('screens'); setPanel('canvas'); setError(''); setNotice('') }}>{editing ? <><ProtoIcon name="arrow" size={16} />Попробовать</> : <><ProtoIcon name="back" size={16} />К редактору</>}</button></div></header>
    <nav className={styles.mainNav} aria-label="Конструктор">{([['screens', 'Экраны', 'apps'], ['data', 'Данные', 'table'], ['actions', 'Действия', 'action']] as const).map(([id, name, icon]) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); setNotice('') }}><ProtoIcon name={icon} /><span>{name}</span></button>)}<span className={styles.contextNote}>Проверочные данные · сохранение только в этом браузере</span></nav>
    {(notice || error) && <div className={error ? styles.errorBanner : styles.noticeBanner} role={error ? 'alert' : 'status'}><ProtoIcon name={error ? 'action' : 'check'} /><span>{error || notice}</span><button type="button" className={styles.iconButton} aria-label="Закрыть сообщение" onClick={() => { setNotice(''); setError('') }}><ProtoIcon name="close" size={16} /></button></div>}
    {tab === 'data' ? <DataPanel data={data} onData={setData} /> : tab === 'actions' ? <PrototypeWorkflows document={document} flowId={flowId} onSelect={setFlowId} onUpdate={flow => update({ ...document, flows: document.flows.map(item => item.id === flow.id ? flow : item) })} onCreate={() => {
      if (document.flows.length >= 50) { setError('В прототипе доступно до 50 действий.'); return }
      const id = uid(); update({ ...document, flows: [...document.flows, { id, name: 'Новое действие', steps: [] }] }); setFlowId(id)
    }} /> : <>
      {editing && <nav className={styles.mobilePanels} aria-label="Панели редактора">{([['screens', 'Экраны'], ['canvas', 'Приложение'], ['properties', 'Свойства']] as const).map(([id, title]) => <button type="button" key={id} aria-current={panel === id ? 'page' : undefined} onClick={() => setPanel(id)}>{title}</button>)}</nav>}
      <div className={styles.workspace} data-panel={panel} data-editing={editing}>
        {editing && <aside className={styles.sidebar} data-area="screens"><div className={styles.panelHeading}><h2>Экраны</h2><button type="button" className={styles.iconButton} aria-label="Добавить экран" onClick={() => setModal({ type: 'page' })}><ProtoIcon name="plus" /></button></div>
          <div className={styles.pageList}>{document.pages.map(item => <button type="button" key={item.id} className={styles.treePage} aria-current={item.id === page.id ? 'true' : undefined} onClick={() => pickPage(item.id)}><ProtoIcon name={item.icon} /><span>{item.name || 'Без названия'}</span>{document.home === item.id && <span title="Стартовый экран" className={styles.homeMark}><ProtoIcon name="home" size={12} /></span>}</button>)}</div>
          <div className={styles.panelHeading}><h2>Элементы</h2><span>{page.blocks.length}</span></div><Outline blocks={page.blocks} selected={selectedId} onSelect={pickBlock} onReorder={(from, to) => updatePage({ blocks: reorderBlocks(page.blocks, from, to) })} />
          <button type="button" className={styles.addElement} onClick={() => openLibrary()}><ProtoIcon name="plus" />Добавить элемент</button>
        </aside>}
        <main id="builder-main" className={styles.canvasMain} data-area="canvas"><div className={styles.previewToolbar}><span className={styles.modeCaption}>{editing ? 'Редактирование' : 'Проверка приложения'}</span><div className={styles.deviceToggle} role="group" aria-label="Размер приложения"><button type="button" aria-label="Компьютер" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><ProtoIcon name="desktop" /><span>Компьютер</span></button><button type="button" aria-label="Телефон" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><ProtoIcon name="phone" /><span>Телефон</span></button></div>{!editing && <label className={styles.rolePicker}><span>Смотреть как</span><select aria-label="Смотреть как" value={role} onChange={event => setRole(event.target.value as typeof role)}><option value="owner">Владелец</option><option value="staff">Сотрудник</option></select></label>}</div>
          <div className={styles.previewStage} data-device={device}><div className={styles.surface}><header className={styles.appHeader}><div><span>{document.name || 'Моё приложение'}</span><strong>{page.name || 'Новый экран'}</strong></div><span className={styles.avatar}>АС</span></header><div className={styles.appContent}><PrototypeCanvas document={document} data={data} blocks={page.blocks} editing={editing} selected={selectedId} rowId={rowId} role={editing ? 'owner' : role} recordSource={rowSource} onSelect={pickBlock} onOpen={(id, row, source) => { if (document.pages.some(item => item.id === id)) { setPageId(id); setRowId(row); setRowSource(source) } else setError('Выберите существующий экран в свойствах списка.') }} onRun={run} onAdd={openLibrary} /></div><nav className={styles.appNavigation} aria-label="Экраны приложения">{document.pages.filter(item => item.navigation !== false).map(item => <button type="button" key={item.id} aria-current={page.id === item.id ? 'page' : undefined} onClick={() => pickPage(item.id)}><ProtoIcon name={item.icon} /><span>{item.name || 'Новый экран'}</span></button>)}</nav></div></div>
        </main>
        {editing && <aside className={styles.properties} data-area="properties"><div className={styles.panelHeading}><h2>Свойства</h2><button type="button" className={styles.mobileBack} onClick={() => setPanel('canvas')}><ProtoIcon name="back" size={16} />К приложению</button></div><PrototypeInspector document={document} page={page} block={selected} onBlock={patch => { if (selected) updatePage({ blocks: updateBlockAt(page.blocks, selected.id, patch) }) }} onPage={updatePage} onHome={() => update({ ...document, home: page.id })} onActions={id => { setFlowId(id); setTab('actions') }} onDuplicate={duplicate} onDelete={() => { if (selected) { updatePage({ blocks: removeBlock(page.blocks, selected.id) }); setSelectedId(null) } }} onMove={delta => { if (selected) updatePage({ blocks: moveBlock(page.blocks, selected.id, delta) }) }} />
          {!selected && <div className={styles.pageTools}><button type="button" className={styles.textButton} disabled={document.pages.length < 2} onClick={() => setModal({ type: 'delete-page' })}><ProtoIcon name="trash" size={16} />Удалить экран</button></div>}
        </aside>}
      </div>
    </>}
    {modal?.type === 'library' && <PrototypeDialog title="Добавить элемент" onClose={() => setModal(null)}><input className={styles.librarySearch} aria-label="Найти элемент" placeholder="Название элемента" value={search} onChange={event => setSearch(event.target.value)} /><div className={styles.library}>{Object.entries(KINDS).filter(([, value]) => `${value.name} ${value.hint}`.toLowerCase().includes(search.toLowerCase())).map(([kind, value]) => <button key={kind} type="button" onClick={() => addElement(kind as Kind)}><span className={styles.elementMark}><ProtoIcon name={value.icon} size={22} /></span><span><strong>{value.name}</strong><small>{value.hint}</small></span><ProtoIcon name="plus" size={16} /></button>)}</div>{!Object.values(KINDS).some(value => `${value.name} ${value.hint}`.toLowerCase().includes(search.toLowerCase())) && <p className={styles.empty}>Попробуйте другое название.</p>}</PrototypeDialog>}
    {modal?.type === 'page' && <PrototypeDialog title="Новый экран" onClose={() => setModal(null)}><NewPage onCreate={createPage} /></PrototypeDialog>}
    {modal?.type === 'delete-page' && <PrototypeDialog title={`Удалить экран «${page.name}»?`} onClose={() => setModal(null)}><p className={styles.deleteCopy}>Проверочные таблицы и записи останутся. Переходы на этот экран потребуется настроить заново.</p><div className={styles.confirmButtons}><button type="button" className={styles.secondary} onClick={() => setModal(null)}>Оставить</button><button type="button" className={styles.danger} onClick={deletePage}>Удалить экран</button></div></PrototypeDialog>}
  </div>
}

function updateBlockAt(blocks: Block[], id: string, patch: Partial<Block>): Block[] { return blocks.map(block => block.id === id ? { ...block, ...patch } : { ...block, children: updateBlockAt(block.children, id, patch) }) }
