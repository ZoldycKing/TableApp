'use client'
import {useEffect,useState} from 'react'
import {PrototypeDialog} from '../prototype/dialog'
import {ProtoIcon} from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import {builderV2FileSize,builderV2MediaItems,type BuilderV2MediaItem} from './media-values'
export function BuilderV2Picture({item,large=false}:{item:BuilderV2MediaItem;large?:boolean}){
  const [failed,setFailed]=useState(false)
  useEffect(()=>setFailed(false),[item.url])
  return failed?<span className={ui.mediaMissing}><ProtoIcon name="image" size={24}/><span>Фото недоступно</span></span>:<img src={item.url} alt={large?item.name:''} loading={large?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>
}
export function BuilderV2Gallery({value,caption,columns=3,editing=false,slug,alt}:{value:unknown;caption:string;columns?:number;editing?:boolean;slug?:string;alt?:string}){
  const items=builderV2MediaItems(value,slug).filter(item=>item.image),[selected,setSelected]=useState<number|null>(null),[shown,setShown]=useState(12),signature=JSON.stringify(items)
  useEffect(()=>{setSelected(null);setShown(12)},[signature])
  const current=selected===null?undefined:items[selected]
  return <figure className={ui.mediaBlock}>{caption&&<figcaption>{caption}</figcaption>}{!items.length?<div className={ui.mediaEmpty}><ProtoIcon name="image" size={24}/><p>{editing?'Выберите поле с фотографиями или добавьте ссылки в свойствах.':'Фотографий пока нет.'}</p></div>:<><div className={ui.gallery} style={{'--gallery-columns':columns} as React.CSSProperties}>{items.slice(0,shown).map((item,index)=><button type="button" key={item.url} aria-label={`Открыть фото ${index+1}: ${alt || item.name}`} onClick={()=>setSelected(index)}><BuilderV2Picture item={item}/></button>)}</div>{shown<items.length&&<button type="button" className={styles.secondary} onClick={()=>setShown(shown+12)}>Показать ещё фото ({items.length-shown})</button>}</>}
  {current&&<PrototypeDialog title={caption||'Фотографии'} onClose={()=>setSelected(null)}><div className={ui.galleryViewer} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setSelected(index=>Math.max(0,Math.min(items.length-1,(index??0)+(event.key==='ArrowLeft'?-1:1))))}}}><div className={ui.galleryLarge}><BuilderV2Picture item={current} large/></div><div className={ui.galleryControls}><button type="button" className={styles.secondary} aria-label="Предыдущее фото" disabled={selected===0} onClick={()=>setSelected(selected!-1)}><ProtoIcon name="back"/></button><span aria-live="polite">{selected!+1} из {items.length}</span><button type="button" className={styles.secondary} aria-label="Следующее фото" disabled={selected===items.length-1} onClick={()=>setSelected(selected!+1)}><ProtoIcon name="arrow"/></button></div><a className={styles.textButton} href={current.url} target="_blank" rel="noopener noreferrer">Открыть оригинал<ProtoIcon name="arrow"/></a></div></PrototypeDialog>}
  </figure>
}
export function BuilderV2Files({value,caption,editing=false,slug}:{value:unknown;caption:string;editing?:boolean;slug?:string}){
  const items=builderV2MediaItems(value,slug)
  return <section className={ui.mediaBlock} aria-label={caption||'Файлы'}>{caption&&<h3>{caption}</h3>}{!items.length?<div className={ui.mediaEmpty}><ProtoIcon name="file" size={24}/><p>{editing?'Выберите поле с файлами или добавьте ссылки в свойствах.':'Файлов пока нет.'}</p></div>:<ul className={ui.fileList}>{items.map(item=><li key={item.url}><a href={item.url} download={item.url.startsWith('/api/files/')?item.name:undefined} target="_blank" rel="noopener noreferrer"><span className={ui.fileMark}><ProtoIcon name={item.image?'image':'file'} size={24}/></span><span className={ui.fileName}><strong>{item.name}</strong>{item.size!==undefined&&<small>{builderV2FileSize(item.size)}</small>}</span><ProtoIcon name={item.url.startsWith('/api/files/')?'download':'arrow'}/></a></li>)}</ul>}</section>
}
