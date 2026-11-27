'use client'
import { useState, type FormEvent } from 'react'
import { FIELDS, SOURCES, visibleRows, type Block, type Data, type Document, type Row, type Source } from './model'
import { ProtoIcon } from './icons'
import styles from './prototype.module.css'

const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })
type Props = { document: Document; data: Data; blocks: Block[]; editing: boolean; selected: string | null; rowId: string; recordSource?: Source | null; role: 'owner' | 'staff'; onSelect: (id: string) => void; onOpen: (pageId: string, rowId: string, source: Source) => void; onRun: (block: Block, form?: Partial<Row>) => boolean; onAdd: (parent: string | null) => void }

function RecordForm({ block, editing, onRun }: { block: Block; editing: boolean; onRun: Props['onRun'] }) {
  const [title, setTitle] = useState(''), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) { setError('Введите название заявки.'); return }
    const value = amount.trim() ? Number(amount.replace(',', '.')) : 0
    if (!Number.isFinite(value)) { setError('Укажите сумму числом.'); return }
    setError('')
    if (onRun(block, { title, amount: value, note })) { setTitle(''); setAmount(''); setNote('') }
  }
  return <form onSubmit={submit} className={styles.recordForm} aria-label={block.title}>
    <fieldset disabled={editing}>
      <label>Название<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Например, проверить принтер" /></label>
      <label>Сумма, ₽<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" /></label>
      <label>Описание<textarea rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Что нужно сделать" /></label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <button className={styles.primary} type="submit">Добавить</button>
    </fieldset>
  </form>
}

export function PrototypeCanvas(props: Props) {
  const { document, data, blocks, editing, selected, rowId, role, onSelect, onOpen, onRun, onAdd } = props
  return <div className={styles.canvasBlocks}>{blocks.map(block => {
    const rows = visibleRows(data, block.source, role)
    const row = !editing && props.recordSource ? (props.recordSource === block.source ? rows.find(item => item.id === rowId) : undefined) : rows[0]
    let content
    if (block.kind === 'heading') content = <div className={styles.headingBlock}><h2>{block.title}</h2>{block.text && <p>{block.text}</p>}</div>
    else if (block.kind === 'text') content = <p className={styles.bodyText}>{block.text || 'Введите текст в свойствах элемента.'}</p>
    else if (block.kind === 'divider') content = <hr className={styles.divider} />
    else if (block.kind === 'metric') content = <div className={styles.metric}><span>{block.title}</span><strong>{block.metric === 'sum' ? money.format(rows.reduce((sum, item) => sum + item.amount, 0)) : rows.length}</strong><small>{SOURCES[block.source]}</small></div>
    else if (block.kind === 'collection') content = <div className={styles.collection}><div className={styles.collectionHeading}><h3>{block.title}</h3><span>Записей: {rows.length}</span></div><div className={styles.collectionRows} data-layout={block.layout}>
      {rows.length === 0 ? <p className={styles.empty}>Здесь появятся записи из таблицы «{SOURCES[block.source]}».</p> : rows.map(item => {
        const body = <><span className={styles.recordMark}><ProtoIcon name={block.source === 'tasks' ? 'check' : 'template'} /></span><span className={styles.rowTitle}><strong>{item.title}</strong><small>{item.assignee}</small></span><span className={styles.status} data-done={item.status === 'Готово'}>{item.status}</span>{!editing && <ProtoIcon name="arrow" size={16} />}</>
        return editing ? <div key={item.id} className={styles.recordRow}>{body}</div> : <button type="button" key={item.id} className={styles.recordRow} onClick={() => onOpen(block.targetPage, item.id, block.source)}>{body}</button>
      })}
    </div></div>
    else if (block.kind === 'fields') content = <div className={styles.fieldsBlock}>{row ? <><span className={styles.overline}>{block.title}</span><h2>{row.title}</h2><dl>{(['status', 'assignee', 'amount', 'note'] as const).map(field => <div key={field}><dt>{FIELDS[field]}</dt><dd>{field === 'amount' ? money.format(row.amount) : row[field] || 'Не заполнено'}</dd></div>)}</dl></> : <p className={styles.empty}>В таблице пока нет доступных записей.</p>}</div>
    else if (block.kind === 'button') content = editing ? <span className={styles.primary}>{block.title}</span> : <button type="button" className={styles.primary} onClick={() => onRun(block)}>{block.title}<ProtoIcon name="arrow" size={16} /></button>
    else if (block.kind === 'form') content = <div className={styles.formBlock}><h3>{block.title}</h3><RecordForm block={block} editing={editing} onRun={onRun} /></div>
    else content = <div className={styles.columns}><PrototypeCanvas {...props} blocks={block.children} />{editing && <button type="button" className={styles.addInside} onClick={() => onAdd(block.id)}><ProtoIcon name="plus" />Добавить сюда</button>}</div>
    return <section key={block.id} className={styles.canvasBlock} data-kind={block.kind} data-selected={editing && selected === block.id} data-editing={editing}>
      {editing && <button type="button" className={block.kind === 'columns' ? styles.groupPick : styles.blockPick} aria-label={`Выбрать «${block.kind === 'columns' ? 'Колонки' : block.title}»`} onClick={() => onSelect(block.id)}><span>{block.kind === 'columns' ? 'Колонки' : block.title}</span></button>}{content}
    </section>
  })}{editing && blocks.length === 0 && <button type="button" className={styles.emptyCanvas} onClick={() => onAdd(null)}><ProtoIcon name="plus" size={24} /><strong>С чего начать этот экран?</strong><span>Нажмите, чтобы добавить заголовок, список или форму</span></button>}</div>
}
