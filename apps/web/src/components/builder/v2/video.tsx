'use client'
import {useEffect,useState} from 'react'
import {appV2NavigationUrl} from '@tableapp/schema/app-v2'
import ui from './view.module.css'
export function BuilderV2Video({value,caption,editing=false}:{value:string;caption:string;editing?:boolean}){
 const url=appV2NavigationUrl(value),[failed,setFailed]=useState(false)
 useEffect(()=>setFailed(false),[url])
 return <figure className={ui.video}>{url?<><video key={url} controls playsInline preload="none" src={url} aria-label={caption||'Видео'} onError={()=>setFailed(true)}>Ваш браузер не воспроизводит видео.</video>{failed&&<p role="alert" className={ui.hint}>{editing?'Видео не удалось загрузить. Проверьте прямую ссылку на файл и доступ к нему.':'Видео недоступно. Попробуйте открыть его позже.'}</p>}</>:<div className={ui.chartPlaceholder}><strong>Видео</strong><p>{editing?'Укажите прямую ссылку на видео в свойствах':'Видео пока не добавлено.'}</p></div>}{caption&&<figcaption>{caption}</figcaption>}</figure>
}
