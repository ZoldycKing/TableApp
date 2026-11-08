'use client'
import {useEffect,useRef,useState} from 'react'
import {attachmentSchema,type Attachment} from '@tableapp/schema'
import type {AppV2Json} from '@tableapp/schema/app-v2'
import type {BuilderV2FormField} from '@/lib/builder-v2-form-types'
import {INLINE_IMAGE_MIME,MAX_FILE_BYTES,validateFileMetadata} from '@/lib/file-policy'
import {builderV2FileSize} from './media-values'
import {ProtoIcon} from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

type Props={id:string;field:BuilderV2FormField;value:AppV2Json;disabled:boolean;errorId?:string;slug?:string;upload?:(file:File,signal:AbortSignal)=>Promise<Attachment>;onChange:(value:AppV2Json)=>void;onPending:(id:string,pending:boolean)=>void}
export function BuilderV2AttachmentInput(props:Props){
  const {id,field,disabled,errorId,slug,upload}=props,images=field.type==='image',max=field.maxCount??(images?1:10)
  const items=Array.isArray(props.value)?props.value.flatMap(value=>{const parsed=attachmentSchema.safeParse(value);return parsed.success?[parsed.data]:[]}):[]
  const [failed,setFailed]=useState<{id:string;file:File;error:string}[]>([]),[busy,setBusy]=useState(''),[notice,setNotice]=useState('')
  const input=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null),alive=useRef(true),urls=useRef(new Map<string,string>()),latest=useRef({...props,items});latest.current={...props,items}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();for(const url of urls.current.values())URL.revokeObjectURL(url);latest.current.onPending(id,false)}},[id])
  useEffect(()=>{props.onPending(id,Boolean(busy||failed.length))},[id,busy,failed.length])
  const run=async(batch:{id:string;file:File}[])=>{
    if(controller.current||disabled||!upload)return
    const current=new AbortController();controller.current=current;props.onPending(id,true);setNotice('')
    for(const item of batch){
      if(!alive.current||current.signal.aborted)break
      setBusy(item.file.name);setFailed(old=>old.filter(value=>value.id!==item.id))
      try{
        const metadataError=validateFileMetadata(item.file)
        if(metadataError)throw new Error(metadataError)
        if(images&&!INLINE_IMAGE_MIME.has(item.file.type))throw new Error('Выберите PNG, JPEG, WebP или GIF')
        if(latest.current.items.length>=max)throw new Error(`Можно добавить не больше ${max} файлов`)
        const attachment=await upload(item.file,current.signal)
        if(!alive.current||current.signal.aborted)break
        if(INLINE_IMAGE_MIME.has(attachment.mime))urls.current.set(attachment.key,URL.createObjectURL(item.file))
        const next=[...latest.current.items,attachment];latest.current.items=next;latest.current.onChange(next as unknown as AppV2Json)
      }catch(error){if(alive.current&&!current.signal.aborted)setFailed(old=>[...old.filter(value=>value.id!==item.id),{...item,error:error instanceof Error?error.message:'Не удалось загрузить файл. Повторите попытку.'}])}
    }
    controller.current=null;if(alive.current)setBusy('')
  }
  const pick=(files:FileList|null)=>{
    if(!files||disabled||controller.current)return
    const remaining=Math.max(0,max-latest.current.items.length-failed.length),chosen=Array.from(files)
    if(chosen.length>remaining)setNotice(`Можно добавить ещё ${remaining} файлов. Выберите меньше файлов.`)
    else void run(chosen.map(file=>({id:crypto.randomUUID(),file})))
    if(input.current)input.current.value=''
  }
  return <div className={ui.attachmentInput} aria-busy={Boolean(busy)}>
    {items.length>0&&<ul className={ui.attachmentList}>{items.map(item=>{const preview=urls.current.get(item.key)??('/api/files/'+item.key.split('/').map(encodeURIComponent).join('/')+(slug?'?v2App='+encodeURIComponent(slug):''));return <li key={item.key}>{INLINE_IMAGE_MIME.has(item.mime)?<img src={preview} alt="" loading="lazy" onError={event=>{event.currentTarget.hidden=true}}/>:<span className={ui.fileMark}><ProtoIcon name="file" size={24}/></span>}<span className={ui.fileName}><strong>{item.name}</strong><small>{builderV2FileSize(item.size)}</small></span>{!field.readOnly&&<button type="button" className={styles.iconButton} aria-label={`Убрать файл ${item.name}`} disabled={disabled||Boolean(busy)} onClick={()=>{const next=latest.current.items.filter(value=>value.key!==item.key);const url=urls.current.get(item.key);if(url){URL.revokeObjectURL(url);urls.current.delete(item.key)}latest.current.items=next;props.onChange(next as unknown as AppV2Json)}}><ProtoIcon name="close"/></button>}</li>})}</ul>}
    {failed.map(item=><div className={ui.attachmentFailure} key={item.id}><strong>{item.file.name}</strong><span role="alert">{item.error}</span><div><button type="button" className={styles.textButton} disabled={disabled||Boolean(busy)} onClick={()=>void run([item])}>Повторить загрузку</button><button type="button" className={styles.textButton} disabled={disabled||Boolean(busy)} aria-label={`Убрать не загруженный файл ${item.file.name}`} onClick={()=>setFailed(old=>old.filter(value=>value.id!==item.id))}>Убрать</button></div></div>)}
    {!field.readOnly&&<><input ref={input} type="file" hidden multiple={max>1} accept={images?'image/jpeg,image/png,image/webp,image/gif':Array.from(INLINE_IMAGE_MIME).join(',')+',application/pdf,text/plain,text/csv,.xlsx,.docx,.zip'} onChange={event=>pick(event.target.files)} disabled={disabled||Boolean(busy)||!upload}/><button id={id} type="button" className={styles.secondary} disabled={disabled||Boolean(busy)||!upload||items.length+failed.length>=max} aria-label={field.label} aria-invalid={Boolean(errorId)} aria-describedby={[errorId,id+'-hint'].filter(Boolean).join(' ')} aria-required={field.required} onClick={()=>input.current?.click()}><ProtoIcon name={images?'image':'plus'}/>{busy?'Загружаем…':images?'Добавить фото':'Добавить файлы'}</button><small className={ui.hint} id={id+'-hint'}>{!upload?'Загрузка доступна в рабочей форме.':`${images?'PNG, JPEG, WebP, GIF':'Фото, PDF, документы и архивы'}. До ${max} ${max===1?'файла':'файлов'}, каждый до ${MAX_FILE_BYTES/1024/1024} МБ.`}</small></>}
    {busy&&<><span role="status" className={ui.hint}>Загружаем «{busy}»…</span><button type="button" className={styles.textButton} onClick={()=>{controller.current?.abort();setNotice('Загрузка отменена. Выберите файл ещё раз.')}}>Отменить загрузку</button></>}{notice&&<span role="alert" className={ui.dataError}>{notice}</span>}
    {field.readOnly&&!items.length&&<span className={ui.hint}>Файлов пока нет.</span>}
  </div>
}
