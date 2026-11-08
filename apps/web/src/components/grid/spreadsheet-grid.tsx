'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { isComputed, type Field, type RowGroup } from '@tableapp/schema'
import { ArrowSquareOutIcon, CaretDownIcon, LinkSimpleIcon, LockKeyIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { groupLabel } from '@/lib/apply-view'
import type { TableRow } from '@/lib/table-store'
import type { TitleIndex } from '@/lib/table-export'
import { clipboardText, parseTsv, planGridPaste, toTsv, EditorInputError, type EditorCell, type EditorResult, type EditorLeaveGuard, type GridBookmark, type GridPoint } from '@/lib/table-editor-values'
import { useUnsaved } from '@/lib/unsaved'
import { FIELD_LABELS } from '@/lib/field-labels'
import { ownerPrimary, ownerSecondary } from '@/components/owner-ui'
import { CellContent } from './cell-content'
import { CellEditor } from './cell-editor'
import styles from './spreadsheet-grid.module.css'
import { useVirtualRows } from '@/lib/use-virtual-rows'

type Props = {
  autoEditRowId?: string | null; readOnly?: boolean; selectedRowId?: string | null
  rowOffset?: number
  onSelectRow?: (id: string) => void; fields: Field[]; groups: RowGroup<TableRow>[]; isGrouped: boolean; groupField?: Field
  relatedTitles?: TitleIndex; onEditField?: (field: Field) => void; onAddField?: () => void
  onSetCell: (rowId: string, fieldId: string, value: unknown, base?: unknown) => void | Promise<EditorResult | void>
  onBatchChange?: (cells: EditorCell[]) => Promise<EditorResult>
  onAddRow: (afterRowId?: string) => void; onDeleteRow: (id: string) => void; onRenameField: (id: string, name: string) => void; onOpenRow?: (id: string) => void
  draftRow?: TableRow | null; draftError?: Exclude<EditorResult,{ok:true}> | null; savingDraft?: boolean
  stagedCellCount?:number
  onSaveDraft?: () => Promise<boolean>; onCancelDraft?: () => void
  bookmark?: GridBookmark; onBookmarkChange?: (bookmark: GridBookmark) => void
  onDirtyChange?: (dirty: boolean) => void; registerLeaveGuard?: (guard: EditorLeaveGuard | null) => void
  onSavingChange?: (saving:boolean)=>void
}

export function SpreadsheetGrid(props: Props) {
  const { fields, groups, isGrouped, groupField, readOnly=false, relatedTitles={}, draftRow, savingDraft, draftError } = props
  const root = useRef<HTMLDivElement>(null), help = useRef<HTMLDialogElement>(null)
  const [collapsed,setCollapsed] = useState<Set<string>>(new Set())
  const rows = useMemo(() => [...groups.filter(group=>!collapsed.has(group.key)).flatMap(group=>group.rows), ...(draftRow ? [draftRow] : [])], [groups,draftRow,collapsed])
  const [anchor,setAnchor] = useState<GridPoint|null>(props.bookmark?.anchor ?? null)
  const [focus,setFocus] = useState<GridPoint|null>(props.bookmark?.focus ?? null)
  const [editing,setEditing] = useState<GridPoint|null>(null)
  const [typingValue,setTypingValue]=useState<string|undefined>(undefined)
  const [error,setError] = useState<Exclude<EditorResult,{ok:true}>|null>(null)
  const [paste,setPaste] = useState<EditorCell[]|null>(null)
  const display = useMemo(() => groups.flatMap(group => [
    ...(isGrouped ? [{ key: `group:${group.key}`, group, row: null as TableRow | null }] : []),
    ...(collapsed.has(group.key) ? [] : group.rows.map(row => ({ key: row.id, group: null, row }))),
  ]), [groups, isGrouped, collapsed])
  const virtualKeys = useMemo(() => display.map(item => item.key), [display])
  const virtual = useVirtualRows(root, virtualKeys, 44, display.flatMap((item, index) => item.row && (item.row.id === focus?.rowId || item.row.id === editing?.rowId) ? [index] : []))
  const [writing,setWriting] = useState(false)
  const [savingCell,setSavingCell]=useState(false)
  const dragging = useRef(false), suppressClick = useRef(false)
  const current = useRef({anchor,focus,editing,paste}); current.current={anchor,focus,editing,paste}
  const commitPromise = useRef<Promise<boolean>|null>(null), committing = useRef(false)
  const pasteRef = useRef(paste); pasteRef.current=paste
  const pasteLock = useRef(false)
  const pasteRequest=useRef<Promise<EditorResult>|null>(null)
  const dirty=!!editing||!!paste||writing
  useUnsaved(`spreadsheet:${fields[0]?.tableId??'table'}`,dirty)
  useEffect(()=>{props.onDirtyChange?.(dirty);return()=>props.onDirtyChange?.(false)},[dirty,props.onDirtyChange])
  useEffect(()=>{props.onSavingChange?.(writing||savingCell);return()=>props.onSavingChange?.(false)},[writing,savingCell,props.onSavingChange])
  useEffect(()=>{const stop=()=>{dragging.current=false};window.addEventListener('pointerup',stop);return()=>window.removeEventListener('pointerup',stop)},[])
  useEffect(()=>{if(root.current&&props.bookmark){root.current.scrollLeft=props.bookmark.scrollLeft;root.current.scrollTop=props.bookmark.scrollTop}},[])
  useEffect(()=>{
    if(!rows.length||!fields.length)return
    const id=props.selectedRowId
    if(id&&rows.some(row=>row.id===id)&&current.current.focus?.rowId!==id){
      const point={rowId:id,fieldId:fields.find(field=>field.id===current.current.focus?.fieldId)?.id??fields[0]!.id}
      setAnchor(point);setFocus(point);current.current={...current.current,anchor:point,focus:point}
    }else if(!current.current.focus||!rows.some(row=>row.id===current.current.focus?.rowId)){const point={rowId:rows[0]!.id,fieldId:fields[0]!.id};setAnchor(point);setFocus(point);current.current={...current.current,anchor:point,focus:point};props.onSelectRow?.(point.rowId)}
  },[props.selectedRowId,rows,fields])
  useEffect(()=>{props.onBookmarkChange?.({anchor,focus,scrollLeft:root.current?.scrollLeft??0,scrollTop:root.current?.scrollTop??0})},[anchor,focus,props.onBookmarkChange])
  const previousAuto=useRef<string|null>(null)
  useEffect(()=>{
    if(readOnly||!props.autoEditRowId||previousAuto.current===props.autoEditRowId)return
    const row=rows.find(row=>row.id===props.autoEditRowId),field=fields.find(field=>!isComputed(field.type))
    if(!row||!field)return
    previousAuto.current=row.id;const point={rowId:row.id,fieldId:field.id};setAnchor(point);setFocus(point);setEditing(point)
    requestAnimationFrame(()=>document.getElementById(cellId(point))?.scrollIntoView?.({block:'nearest',inline:'nearest'}))
  },[props.autoEditRowId,rows,fields,readOnly])

  const index=(point:GridPoint|null)=>({row:rows.findIndex(row=>row.id===point?.rowId),column:fields.findIndex(field=>field.id===point?.fieldId)})
  const a=index(anchor),f=index(focus)
  const bounds={top:Math.min(a.row,f.row),bottom:Math.max(a.row,f.row),left:Math.min(a.column,f.column),right:Math.max(a.column,f.column)}
  const selectionValid=bounds.top>=0&&bounds.left>=0
  const selectedCount=selectionValid?(bounds.bottom-bounds.top+1)*(bounds.right-bounds.left+1):0
  const choose=(point:GridPoint,extend=false)=>{
    if(committing.current||pasteRef.current||savingDraft)return
    if(!extend||!current.current.anchor){setAnchor(point);current.current.anchor=point}
    setFocus(point);current.current.focus=point;props.onSelectRow?.(point.rowId)
  }
  const move=(dr:number,dc:number,extend=false)=>{
    const at=index(current.current.focus);if(at.row<0||at.column<0)return
    let row=at.row+dr,column=at.column+dc
    if(column>=fields.length){column=0;row++}else if(column<0){column=fields.length-1;row--}
    row=Math.max(0,Math.min(rows.length-1,row));column=Math.max(0,Math.min(fields.length-1,column))
    const point={rowId:rows[row]!.id,fieldId:fields[column]!.id};choose(point,extend)
    requestAnimationFrame(() => document.getElementById(cellId(point))?.scrollIntoView?.({block:'nearest',inline:'nearest'}))
  }
  const applyPaste=async(cells:EditorCell[]):Promise<boolean>=>{
    if(readOnly||pasteLock.current||!props.onBatchChange)return false
    pasteLock.current=true;setWriting(true);setError(null)
    try{
      const request=props.onBatchChange(cells);pasteRequest.current=request
      const result=await request
      if(!result.ok){setError(result);return false}
      setPaste(null);pasteRef.current=null;return true
    }catch{setError({ok:false,error:'Не удалось сохранить вставку. Данные остались на экране — повторите попытку.'});return false}
    finally{pasteLock.current=false;pasteRequest.current=null;setWriting(false)}
  }
  const flush=useRef<()=>Promise<boolean>>(async()=>true)
  flush.current=async()=>{
    const active=document.activeElement
    if(active instanceof HTMLElement&&root.current?.contains(active)&&active!==root.current)active.blur()
    if(commitPromise.current&&!await commitPromise.current)return false
    if(pasteLock.current&&pasteRequest.current)await pasteRequest.current.catch(()=>{})
    if(pasteRef.current)return applyPaste(pasteRef.current)
    return !current.current.editing&&!committing.current
  }
  useEffect(()=>{
    props.registerLeaveGuard?.({save:()=>flush.current(),discard:()=>{setEditing(null);current.current.editing=null;setPaste(null);pasteRef.current=null;setError(null)}})
    return()=>props.registerLeaveGuard?.(null)
  },[props.registerLeaveGuard])

  const commit=(point:GridPoint,value:unknown,navigate?:'next'|'previous'|'below'|'above'|'save')=>{
    if(committing.current)return
    committing.current=true;setSavingCell(true);setError(null)
    const row=rows.find(row=>row.id===point.rowId)
    const work=(async()=>{
      try{
        const result=await props.onSetCell(point.rowId,point.fieldId,value,row?.data[point.fieldId]??null)
        if(result&&!result.ok){setError({...result,rowId:point.rowId,fieldId:point.fieldId});return false}
        setEditing(null);current.current.editing=null
        root.current?.focus({preventScroll:true})
        committing.current=false
        if(navigate==='save')await props.onSaveDraft?.()
        else if(navigate)move(navigate==='below'?1:navigate==='above'?-1:0,navigate==='next'?1:navigate==='previous'?-1:0)
        return true
      }catch{setError({ok:false,error:'Не удалось сохранить ячейку. Введённое осталось здесь.',rowId:point.rowId,fieldId:point.fieldId});return false}
      finally{committing.current=false;setSavingCell(false)}
    })()
    commitPromise.current=work
  }
  const begin=(point:GridPoint,typed?:string)=>{
    const field=fields.find(field=>field.id===point.fieldId)
    if(readOnly||!field||isComputed(field.type)||pasteRef.current||savingDraft||committing.current)return
    if(field.type==='checkbox'){commit(point,!rows.find(row=>row.id===point.rowId)?.data[field.id]);return}
    setTypingValue(typed);setEditing(point);current.current.editing=point;setError(null)
  }
  const copy=(event:ClipboardEvent)=>{
    if(editing||!selectionValid)return
    const values=rows.slice(bounds.top,bounds.bottom+1).map(row=>fields.slice(bounds.left,bounds.right+1).map(field=>clipboardText(field,row.data[field.id],relatedTitles)))
    event.preventDefault();event.clipboardData.setData('text/plain',toTsv(values))
  }
  const pasteCells=(event:ClipboardEvent)=>{
    if(readOnly||editing||!selectionValid||writing||savingDraft)return
    event.preventDefault()
    try{
      const matrix=parseTsv(event.clipboardData.getData('text/plain'))
      const cells=planGridPaste(matrix,rows,fields,bounds.top,bounds.left,relatedTitles,{rows:bounds.bottom-bounds.top+1,columns:bounds.right-bounds.left+1})
      setPaste(cells);pasteRef.current=cells;void applyPaste(cells)
    }catch(cause){setError({ok:false,error:cause instanceof Error?cause.message:'Проверьте вставляемые значения.',...(cause instanceof EditorInputError?{rowId:cause.rowId,fieldId:cause.fieldId}:{})})}
  }
  const handleKey=(event:KeyboardEvent)=>{
    if(event.target!==root.current||editing||!focus)return
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&draftRow){event.preventDefault();void props.onSaveDraft?.();return}
    if(event.key.startsWith('Arrow')){event.preventDefault();move(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0,event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0,event.shiftKey);return}
    if(event.key==='Tab'){event.preventDefault();move(0,event.shiftKey?-1:1);return}
    if(event.key==='Enter'||event.key==='F2'){event.preventDefault();begin(focus);return}
    if(event.key===' '&&fields.find(field=>field.id===focus.fieldId)?.type==='checkbox'){event.preventDefault();begin(focus);return}
    if(event.key==='Escape'){if(paste){setPaste(null);pasteRef.current=null;setError(null)}else{setAnchor(focus);current.current.anchor=focus}return}
    if(!readOnly&&!paste&&(event.key==='Delete'||event.key==='Backspace')){
      event.preventDefault()
      const cells:EditorCell[]=[]
      try{
        for(let r=bounds.top;r<=bounds.bottom;r++)for(let c=bounds.left;c<=bounds.right;c++){
          const row=rows[r]!,field=fields[c]!
          if(isComputed(field.type))throw new EditorInputError(`Поле «${field.name}» вычисляется автоматически.`,row.id,field.id)
          cells.push({rowId:row.id,fieldId:field.id,value:field.type==='checkbox'?false:field.type==='relation'||field.type==='multi_select'?[]:null,base:row.data[field.id]??null})
        }
        setPaste(cells);pasteRef.current=cells;void applyPaste(cells)
      }catch(cause){setError({ok:false,error:cause instanceof Error?cause.message:'Не удалось очистить диапазон.'})}
      return
    }
    if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key.length===1){event.preventDefault();begin(focus,event.key)}
  }

  const renderRow=(row:TableRow)=>{
    const rowIndex=rows.findIndex(candidate=>candidate.id===row.id),isDraft=row.id===draftRow?.id
    const rowNumber=rowIndex+1+(props.rowOffset??0)
    return <tr key={row.id} role="row" aria-rowindex={rowIndex + 2} data-virtual-key={row.id} ref={virtual.measure}>
      <td role="rowheader" className={styles.number}><span className={styles.rowTools}><span className={styles.rowIndex}>{isDraft?'+':rowNumber}</span>{!isDraft&&props.onOpenRow?<button type="button" title="Открыть запись" aria-label={`Открыть запись ${rowNumber}`} onClick={()=>props.onOpenRow?.(row.id)}><ArrowSquareOutIcon size={14}/></button>:null}{!readOnly&&!isDraft?<button type="button" className={styles.delete} title="Удалить строку" onClick={()=>props.onDeleteRow(row.id)}><TrashIcon size={14}/></button>:null}</span></td>
      {fields.map((field,columnIndex)=>{
        const point={rowId:row.id,fieldId:field.id},selected=selectionValid&&rowIndex>=bounds.top&&rowIndex<=bounds.bottom&&columnIndex>=bounds.left&&columnIndex<=bounds.right
        const active=focus?.rowId===row.id&&focus.fieldId===field.id,isEditing=editing?.rowId===row.id&&editing.fieldId===field.id
        const issue=(error?.rowId===row.id&&error.fieldId===field.id)||(draftError?.rowId===row.id&&draftError.fieldId===field.id)
        const queued=paste?.find(cell=>cell.rowId===row.id&&cell.fieldId===field.id)
        const computed=isComputed(field.type),choice=['relation','single_select','multi_select'].includes(field.type)
        return <td key={field.id} id={cellId(point)} role="gridcell" data-grid-cell data-selected={selected} data-focus={active} data-computed={computed} data-draft={isDraft} data-editing={isEditing} aria-selected={selected} aria-readonly={readOnly||computed} aria-invalid={!!issue} aria-describedby={issue?'spreadsheet-error':undefined} className={`${columnIndex===0?styles.first:''} ${active?'ring-sage-400':''}`}
          onPointerDown={event=>{if(event.button!==0||isEditing||savingDraft)return;suppressClick.current=true;dragging.current=event.pointerType!=='touch';choose(point,event.shiftKey);if(event.pointerType!=='touch'){event.preventDefault();root.current?.focus({preventScroll:true})}}}
          onPointerEnter={()=>{if(dragging.current)choose(point,true)}}
          onClick={event=>{if(suppressClick.current){suppressClick.current=false;return}if(!isEditing){root.current?.focus({preventScroll:true});choose(point,event.shiftKey)}}}
          onDoubleClick={()=>begin(point)}>
          {isEditing&&!readOnly?<fieldset disabled={savingCell} className="contents"><CellEditor field={field} value={typingValue??row.data[field.id]} relatedOptions={field.type==='relation'?relatedTitles[field.options.tableId]:undefined} onCommit={(value,navigate)=>commit(point,value,navigate)} onCancel={()=>{setEditing(null);current.current.editing=null;root.current?.focus({preventScroll:true})}}/></fieldset>:
            isDraft&&computed?<span className="text-xs text-ink-muted">После сохранения</span>:<span className={styles.choice}><span><CellContent field={field} value={queued?queued.value:row.data[field.id]} relatedTitles={relatedTitles}/></span>{choice&&!readOnly?<CaretDownIcon size={12} aria-hidden/>:null}</span>}
        </td>
      })}
      {!readOnly&&props.onAddField?<td role="gridcell"/>:null}
    </tr>
  }
  const notice=error??draftError
  const firstWidth=`var(--grid-first-width,${fields[0]?columnWidth(fields[0]):208}px)`
  const otherWidths=48+fields.slice(1).reduce((sum,field)=>sum+columnWidth(field),0)+(!readOnly&&props.onAddField?112:0)
  return <div>
    <div className={styles.sheet}>
      {notice?<div className={styles.error} id="spreadsheet-error" role="alert"><p>{notice.error}</p>{paste?<div className="flex gap-2"><button type="button" className={ownerSecondary} disabled={writing} onClick={()=>void applyPaste(paste)}>Повторить вставку</button><button type="button" className={ownerSecondary} disabled={writing} onClick={()=>{setPaste(null);pasteRef.current=null;setError(null)}}>Отменить вставку</button></div>:null}</div>:null}
      <div ref={root} role="grid" aria-label="Данные таблицы" aria-rowcount={rows.length+1} aria-colcount={fields.length+1} aria-activedescendant={focus?cellId(focus):undefined} aria-busy={writing||savingCell||savingDraft} tabIndex={0} onKeyDown={handleKey} onCopy={copy} onPaste={pasteCells} onScroll={event=>{virtual.onScroll();props.onBookmarkChange?.({anchor:current.current.anchor,focus:current.current.focus,scrollLeft:event.currentTarget.scrollLeft,scrollTop:event.currentTarget.scrollTop})}} className={styles.viewport}>
        <table role="presentation" className={styles.table} style={{width:`calc(${otherWidths}px + ${firstWidth})`}}>
          <colgroup><col style={{width:48}}/>{fields.map((field,index)=><col key={field.id} style={{width:index===0?firstWidth:columnWidth(field)}}/>)}{!readOnly&&props.onAddField?<col style={{width:112}}/>:null}</colgroup>
          <thead role="rowgroup"><tr role="row"><th role="columnheader" className={styles.number}>#</th>{fields.map((field,i)=><th key={field.id} role="columnheader" className={i===0?styles.first:''} title={`${field.name} · ${FIELD_LABELS[field.type]}${isComputed(field.type)?' · Только просмотр':''}`}>
            {!readOnly&&props.onEditField?<button type="button" className={styles.heading} onClick={()=>props.onEditField?.(field)} aria-label={`Настройки поля «${field.name}»`}><span>{field.name}</span>{isComputed(field.type)?<LockKeyIcon size={14} aria-hidden/>:field.type==='relation'?<LinkSimpleIcon size={14} aria-hidden/>:null}</button>:<span className={styles.heading}><span>{field.name}</span>{isComputed(field.type)?<LockKeyIcon size={14} aria-hidden/>:null}</span>}
          </th>)}{!readOnly&&props.onAddField?<th role="columnheader"><button className={styles.heading} type="button" onClick={props.onAddField}><PlusIcon size={14} aria-hidden/>Поле</button></th>:null}</tr></thead>
          <tbody role="rowgroup">{virtual.items.map((item, i) => {
            const entry = display[item.index]!, previous = virtual.items[i - 1]
            const gap = item.start - (previous ? previous.start + previous.size : 0)
            return <Fragment key={entry.key}>{gap > 0 ? <tr aria-hidden="true"><td colSpan={fields.length+2} className={styles.spacer} style={{height:gap}} /></tr> : null}{entry.row ? renderRow(entry.row) : <tr role="row" data-virtual-key={entry.key} ref={virtual.measure}><td role="gridcell" colSpan={fields.length+(!readOnly&&props.onAddField?2:1)}><button type="button" aria-expanded={!collapsed.has(entry.group!.key)} className="flex min-h-8 items-center gap-2 text-sm" onClick={()=>setCollapsed(current=>{const next=new Set(current);next.has(entry.group!.key)?next.delete(entry.group!.key):next.add(entry.group!.key);return next})}><CaretDownIcon size={14} className={collapsed.has(entry.group!.key)?'-rotate-90':''}/>{groupLabel(groupField,entry.group!.value)} <span className="text-ink-muted">{entry.group!.rows.length}</span></button></td></tr>}</Fragment>
          })}
          {virtual.items.length && virtual.total > virtual.items.at(-1)!.start + virtual.items.at(-1)!.size ? <tr aria-hidden="true"><td colSpan={fields.length+2} className={styles.spacer} style={{height:virtual.total-virtual.items.at(-1)!.start-virtual.items.at(-1)!.size}} /></tr> : null}
            {draftRow?renderRow(draftRow):null}
            {!rows.length?<tr role="row"><td role="gridcell" colSpan={fields.length+2}><p className="py-8 text-center text-sm text-ink-muted">Записей пока нет или они не подходят под выбранный фильтр.</p></td></tr>:null}
            {!readOnly&&!draftRow?<tr role="row"><td role="gridcell" colSpan={fields.length+2}><button type="button" disabled={writing} onClick={()=>props.onAddRow()} className="flex min-h-8 w-full items-center gap-2 text-left text-sm text-sage-700"><PlusIcon size={16} aria-hidden/>Добавить строку</button></td></tr>:null}
          </tbody>
        </table>
      </div>
      {draftRow?<div className={styles.bottom}><div><p className="text-sm font-medium text-sage-700">Новая строка не сохранена</p><p className="mt-1 text-xs text-ink-muted">{props.stagedCellCount?'Изменения в остальных строках сохранятся вместе с ней.':'Заполните ячейки и сохраните строку.'}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={ownerPrimary} disabled={savingDraft||writing} onClick={()=>void flush.current().then(ready=>{if(ready)void props.onSaveDraft?.()})}>{savingDraft?'Сохраняем…':'Сохранить строку'}</button><button type="button" className={ownerSecondary} disabled={savingDraft||writing} onClick={props.onCancelDraft}>Отменить</button></div></div>:null}
    </div>
    <div className={styles.feedback}><span role="status">{writing?'Сохраняем диапазон…':paste?'Вставка ещё не сохранена':selectedCount>1?`Выделено ячеек: ${selectedCount}`:''}</span><button type="button" onClick={()=>help.current?.showModal()} className="min-h-11 rounded text-xs underline underline-offset-4">Как работать с таблицей</button></div>
    <dialog ref={help} className={styles.help} aria-labelledby="spreadsheet-help-title" onClick={event=>{if(event.target===help.current)help.current?.close()}}><h2 id="spreadsheet-help-title">Работа с таблицей</h2><dl><dt>Enter или F2</dt><dd>Изменить выбранную ячейку</dd><dt>Tab / Shift + Tab</dt><dd>Перейти к соседней ячейке</dd><dt>Shift + стрелки</dt><dd>Выделить диапазон</dd><dt>Ctrl / ⌘ + C, V</dt><dd>Скопировать или вставить диапазон</dd><dt>Ctrl / ⌘ + Enter</dt><dd>Сохранить новую строку</dd></dl><button type="button" className={ownerPrimary} onClick={()=>help.current?.close()}>Понятно</button></dialog>
  </div>
}

function cellId(point:GridPoint){return `gridcell-${point.rowId}-${point.fieldId}`}
function columnWidth(field:Field){return field.type==='long_text'?280:field.type==='number'||field.type==='checkbox'?144:208}
