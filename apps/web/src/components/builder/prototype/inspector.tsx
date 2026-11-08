'use client'
import { FIELDS, KINDS, SOURCES, type Block, type Column, type Document, type Page, type Source } from './model'
import { ProtoIcon } from './icons'
import styles from './prototype.module.css'

export function PrototypeInspector({ document, page, block, onBlock, onPage, onHome, onActions, onDuplicate, onDelete, onMove }: { document: Document; page: Page; block?: Block; onBlock: (patch: Partial<Block>) => void; onPage: (patch: Partial<Page>) => void; onHome: () => void; onActions: (id: string) => void; onDuplicate: () => void; onDelete: () => void; onMove: (delta: number) => void }) {
  if (!block) return <div className={styles.inspectorContent}><div className={styles.inspectorHeading}><span className={styles.elementMark}><ProtoIcon name={page.icon} /></span><div><span>Экран</span><h2>{page.name}</h2></div></div>
    <label>Название экрана<input value={page.name} onChange={event => onPage({ name: event.target.value })} maxLength={60} /></label>
    <label>Иконка<select value={page.icon} onChange={event => onPage({ icon: event.target.value })}><option value="home">Главная</option><option value="table">Таблица</option><option value="template">Записи</option><option value="plus">Добавление</option><option value="apps">Обзор</option></select></label>
    <label className={styles.checkbox}><input type="checkbox" checked={page.navigation !== false} onChange={event => onPage({ navigation: event.target.checked })} />Показывать в меню</label>
    <button type="button" className={styles.secondary} onClick={onHome} disabled={document.home === page.id}><ProtoIcon name="home" />{document.home === page.id ? 'Стартовый экран' : 'Сделать стартовым'}</button>
    <p className={styles.help}>Выберите элемент в приложении, чтобы настроить его.</p>
  </div>
  const kind = KINDS[block.kind]
  return <div className={styles.inspectorContent}><div className={styles.inspectorHeading}><span className={styles.elementMark}><ProtoIcon name={kind.icon} /></span><div><span>{kind.name}</span><h2>{block.title}</h2></div></div>
    {block.kind !== 'divider' && <label>{block.kind === 'button' ? 'Надпись на кнопке' : 'Название'}<input value={block.title} onChange={event => onBlock({ title: event.target.value })} maxLength={120} /></label>}
    {(block.kind === 'heading' || block.kind === 'text') && <label>{block.kind === 'heading' ? 'Подпись' : 'Текст'}<textarea rows={4} value={block.text} onChange={event => onBlock({ text: event.target.value })} /></label>}
    {['metric', 'collection', 'fields', 'form', 'button'].includes(block.kind) && <label>Таблица<select value={block.source} onChange={event => onBlock({ source: event.target.value as Source })}>{Object.entries(SOURCES).map(([id, title]) => <option value={id} key={id}>{title}</option>)}</select></label>}
    {block.kind === 'metric' && <label>Что посчитать<select value={block.metric} onChange={event => onBlock({ metric: event.target.value as Block['metric'] })}><option value="count">Количество записей</option><option value="sum">Сумму по полю «Сумма»</option></select></label>}
    {block.kind === 'collection' && <><label>Внешний вид<select value={block.layout} onChange={event => onBlock({ layout: event.target.value as Block['layout'] })}><option value="list">Список</option><option value="cards">Карточки</option></select></label><label>При нажатии открыть<select value={block.targetPage} onChange={event => onBlock({ targetPage: event.target.value })}>{document.pages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
    {(block.kind === 'button' || block.kind === 'form') && <div className={styles.behaviorSetting}><label>{block.kind === 'button' ? 'При нажатии' : 'При отправке формы'}<select value={block.flowId} onChange={event => onBlock({ flowId: event.target.value })}>{document.flows.map(flow => <option key={flow.id} value={flow.id}>{flow.name}</option>)}</select></label><button type="button" className={styles.textButton} onClick={() => onActions(block.flowId)}>Настроить шаги<ProtoIcon name="arrow" size={16} /></button></div>}
    {block.kind === 'columns' && <p className={styles.help}>На широком экране элементы стоят рядом. На телефоне они идут друг под другом.</p>}
    <div className={styles.elementActions}><div><button type="button" className={styles.iconButton} title="Переместить выше" aria-label="Переместить выше" onClick={() => onMove(-1)}><ProtoIcon name="up" /></button><button type="button" className={styles.iconButton} title="Переместить ниже" aria-label="Переместить ниже" onClick={() => onMove(1)}><ProtoIcon name="down" /></button></div><button type="button" className={styles.iconButton} title="Дублировать элемент" aria-label="Дублировать элемент" onClick={onDuplicate}><ProtoIcon name="copy" /></button><button type="button" className={styles.iconButton} title="Удалить элемент" aria-label="Удалить элемент" onClick={onDelete}><ProtoIcon name="trash" /></button></div>
  </div>
}

export function FieldSelect({ value, onChange }: { value: Column; onChange: (value: Column) => void }) { return <select value={value} onChange={event => onChange(event.target.value as Column)}>{Object.entries(FIELDS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select> }
