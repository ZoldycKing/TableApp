'use client'
import { Select } from '@/components/ui/select'
import { FIELDS, KINDS, SOURCES, makeBlock, type Block, type Column, type Document, type Kind, type Page, type Source } from './model'
import { ProtoIcon } from './icons'
import styles from './prototype.module.css'

const ICONS = [
  { value: 'home', label: 'Главная' },
  { value: 'table', label: 'Таблица' },
  { value: 'template', label: 'Записи' },
  { value: 'plus', label: 'Добавление' },
  { value: 'apps', label: 'Обзор' },
]
const TYPE_TILES: Kind[] = ['heading', 'text', 'metric', 'collection', 'button', 'form']

function ToggleRow({ title, hint, checked, disabled = false, onChecked }: { title: string; hint: string; checked: boolean; disabled?: boolean; onChecked: (checked: boolean) => void }) {
  return <div className={styles.toggleRow}><span><strong>{title}</strong><small>{hint}</small></span><button type="button" role="switch" aria-label={title} aria-checked={checked} disabled={disabled} className={styles.tg} data-on={checked ? 'true' : undefined} onClick={() => onChecked(!checked)}><span /></button></div>
}

export function PrototypeInspector({ document, page, block, onBlock, onPage, onHome, onActions, onDuplicate, onDelete, onMove }: { document: Document; page: Page; block?: Block; onBlock: (patch: Partial<Block>) => void; onPage: (patch: Partial<Page>) => void; onHome: () => void; onActions: (id: string) => void; onDuplicate: () => void; onDelete: () => void; onMove: (delta: number) => void }) {
  if (!block) return <div className={styles.inspectorContent}><div className={styles.inspectorHeading}><span className={styles.elementMark}><ProtoIcon name={page.icon} /></span><div><span>Экран</span><h2>{page.name}</h2></div></div>
    <label>Название экрана<input value={page.name} onChange={event => onPage({ name: event.target.value })} maxLength={60} /></label>
    <Select label="Иконка" value={page.icon} onValue={icon => onPage({ icon })} options={ICONS} />
    <div className={styles.toggles}>
      <ToggleRow title="Показывать в меню" hint="Экран виден в навигации клиента" checked={page.navigation !== false} onChecked={checked => onPage({ navigation: checked })} />
      <ToggleRow title="Стартовый экран" hint={document.home === page.id ? 'Открывается первым при входе' : 'Сделайте экран стартовым'} checked={document.home === page.id} disabled={document.home === page.id} onChecked={() => onHome()} />
    </div>
    <p className={styles.help}>Выберите элемент на экране, чтобы настроить его.</p>
  </div>
  const kind = KINDS[block.kind]
  return <div className={styles.inspectorContent}><div className={styles.inspectorHeading}><span className={styles.elementMark}><ProtoIcon name={kind.icon} /></span><div><span>{kind.name}</span><h2>{block.title}</h2></div></div>
    {block.kind !== 'divider' && <label>{block.kind === 'button' ? 'Надпись на кнопке' : 'Название'}<input value={block.title} onChange={event => onBlock({ title: event.target.value })} maxLength={120} /></label>}
    {(block.kind === 'heading' || block.kind === 'text') && <label>{block.kind === 'heading' ? 'Подпись' : 'Текст'}<textarea rows={4} value={block.text} onChange={event => onBlock({ text: event.target.value })} /></label>}
    {TYPE_TILES.includes(block.kind) && <div className={styles.typeBlock}><span className={styles.fieldCaption}>Тип</span><div className={styles.typeGrid}>{TYPE_TILES.map(item => <button type="button" key={item} aria-pressed={block.kind === item} className={styles.typeTile} onClick={() => onBlock({ ...makeBlock(item, block.id), title: block.title, children: [] })}><ProtoIcon name={KINDS[item].icon} size={16} /><span>{KINDS[item].name}</span></button>)}</div></div>}
    {['metric', 'collection', 'fields', 'form', 'button'].includes(block.kind) && <Select label="Таблица" value={block.source} onValue={source => onBlock({ source: source as Source })} options={Object.entries(SOURCES).map(([id, title]) => ({ value: id, label: title }))} />}
    {block.kind === 'metric' && <Select label="Что посчитать" value={block.metric} onValue={metric => onBlock({ metric: metric as Block['metric'] })} options={[{ value: 'count', label: 'Количество записей' }, { value: 'sum', label: 'Сумму по полю «Сумма»' }]} />}
    {block.kind === 'collection' && <>
      <Select label="Внешний вид" value={block.layout} onValue={layout => onBlock({ layout: layout as Block['layout'] })} options={[{ value: 'list', label: 'Список' }, { value: 'cards', label: 'Карточки' }]} />
      <Select label="При нажатии открыть" value={block.targetPage} onValue={targetPage => onBlock({ targetPage })} options={document.pages.map(item => ({ value: item.id, label: item.name }))} />
    </>}
    {(block.kind === 'button' || block.kind === 'form') && <div className={styles.behaviorSetting}><Select label={block.kind === 'button' ? 'При нажатии' : 'При отправке формы'} value={block.flowId} onValue={flowId => onBlock({ flowId })} options={document.flows.map(flow => ({ value: flow.id, label: flow.name }))} /><button type="button" className={styles.textButton} onClick={() => onActions(block.flowId)}>Настроить шаги<ProtoIcon name="arrow" size={16} /></button></div>}
    {block.kind === 'columns' && <p className={styles.help}>На широком экране элементы стоят рядом. На телефоне они идут друг под другом.</p>}
    <div className={styles.elementActions}><button type="button" className={styles.iconButton} title="Переместить выше" aria-label="Переместить выше" onClick={() => onMove(-1)}><ProtoIcon name="up" /></button><button type="button" className={styles.iconButton} title="Переместить ниже" aria-label="Переместить ниже" onClick={() => onMove(1)}><ProtoIcon name="down" /></button><button type="button" className={styles.iconButton} title="Дублировать элемент" aria-label="Дублировать элемент" onClick={onDuplicate}><ProtoIcon name="copy" /></button></div>
    <button type="button" className={styles.dangerText} aria-label="Удалить элемент" onClick={onDelete}><ProtoIcon name="trash" size={16} />Удалить элемент</button>
  </div>
}

export function FieldSelect({ value, onChange, label = 'Поле' }: { value: Column; onChange: (value: Column) => void; label?: string }) {
  return <Select label={label} value={value} onValue={next => onChange(next as Column)} options={Object.entries(FIELDS).map(([id, name]) => ({ value: id, label: name }))} />
}
