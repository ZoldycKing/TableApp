'use client'
import type {AppV2Node} from '@tableapp/schema/app-v2'
import type {BuilderV2Table} from '@/lib/builder-v2'
import ui from './view.module.css'
type MediaNode=Extract<AppV2Node,{type:'gallery'|'files'}>
export function BuilderV2MediaSettings({node,table,screenTable,onChange}:{node:MediaNode;table?:BuilderV2Table;screenTable?:BuilderV2Table;onChange:(node:MediaNode)=>void}){
  const eligible=(table?:BuilderV2Table)=>table?.fields.filter(field=>['image','attachment','url','text','long_text'].includes(field.type))??[]
  const rowFields=eligible(table),screenFields=eligible(screenTable),kind=node.value.kind==='literal'?'literal':node.value.kind==='row'&&rowFields.length?'row':node.value.kind==='screen_row'&&screenFields.length?'screen_row':'configured'
  const fields=kind==='row'?rowFields:screenFields,isGallery=node.type==='gallery'
  return <><label>{isGallery?'Источник фотографий':'Источник файлов'}<select value={kind} onChange={event=>onChange({...node,value:event.target.value==='row'?{kind:'row',fieldId:rowFields[0]!.id}:event.target.value==='screen_row'?{kind:'screen_row',fieldId:screenFields[0]!.id}:{kind:'literal',value:''}})}><option value="literal">Свои ссылки</option>{rowFields.length>0&&<option value="row">Поле записи: {table?.name}</option>}{screenFields.length>0&&(table?.id!==screenTable?.id||node.value.kind==='screen_row')&&<option value="screen_row">Поле открытой карточки: {screenTable?.name}</option>}{kind==='configured'&&<option value="configured">Настроенное значение</option>}</select></label>
  {kind==='literal'&&node.value.kind==='literal'?<><label>Ссылки<textarea rows={4} value={typeof node.value.value==='string'?node.value.value:JSON.stringify(node.value.value??'')} onChange={event=>onChange({...node,value:{kind:'literal',value:event.target.value}})}/></label><p className={ui.hint}>Каждая ссылка с новой строки.</p></>:kind!=='configured'&&(node.value.kind==='row'||node.value.kind==='screen_row')?<label>{isGallery?'Поле с фотографиями':'Поле с файлами'}<select value={node.value.fieldId} onChange={event=>onChange({...node,value:{kind:node.value.kind as 'row'|'screen_row',fieldId:event.target.value}})}>{!fields.some(field=>field.id===(node.value as {fieldId:string}).fieldId)&&<option value={node.value.fieldId}>Поле недоступно</option>}{fields.map(field=><option key={field.id} value={field.id}>{field.name}</option>)}</select></label>:<p className={ui.hint}>Выберите поле записи или добавьте свои ссылки.</p>}
  <label>Подпись<input value={node.caption} maxLength={200} onChange={event=>onChange({...node,caption:event.target.value})}/></label>
  {node.type==='gallery'&&<label>Фото в ряду на компьютере<select value={node.columns} onChange={event=>onChange({...node,columns:Number(event.target.value)})}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>}
  <p className={ui.hint}>{isGallery?'Фотографии открываются крупно по нажатию. На телефоне в ряду не больше двух фото.':'Файлы из таблицы доступны тем, кто может читать эту запись и поле.'}</p>
  </>
}
