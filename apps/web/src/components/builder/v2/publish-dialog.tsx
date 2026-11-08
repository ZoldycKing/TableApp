'use client'
import {useState} from 'react'
import type {AppV2} from '@tableapp/schema/app-v2'
import {PrototypeDialog} from '../prototype/dialog'
import ui from './view.module.css'
import styles from '../prototype/prototype.module.css'
import type {BuilderLearningProgress} from '@/lib/builder-learning-types'
export function BuilderV2PublishDialog({app,revision,onClose,onPublished}:{app:AppV2;revision:string;onClose:()=>void;onPublished?:(progress?:BuilderLearningProgress)=>void}){
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[href,setHref]=useState('')
  const publish=async()=>{if(pending)return;setPending(true);setError('');try{const {publishBuilderV2Action}=await import('@/app/builder-v2-publish-actions'),result=await publishBuilderV2Action(app.id,revision);if(result.ok){setHref(result.href);onPublished?.(result.learning)}else setError(result.error)}catch{setError('Не удалось подтвердить публикацию. Повторите попытку.')}finally{setPending(false)}}
  return <PrototypeDialog title={href?'Приложение опубликовано':'Опубликовать приложение'} onClose={()=>{if(!pending)onClose()}} closeDisabled={pending}><div className={ui.form}>{href?<><p>Рабочая ссылка готова. Доступ определяется настройками приложения.</p><a href={href} className={styles.primary} target="_blank" rel="noreferrer">Открыть приложение</a></>:<><p>Пользователи увидят сохранённые экраны. Последующие правки останутся в черновике до новой публикации.</p><div className={ui.autoValue}><strong>{app.authentication.mode==='verified_email'?'Вход по подтверждённой почте':'Вход для приглашённых'}</strong><small>{app.authentication.mode==='invite_only'?`Адресов в списке: ${app.authentication.members.length}`:'Роль по умолчанию: '+(app.roles.find(role=>role.id===app.authentication.defaultRoleId)?.name??'Не выбрана')}</small>{app.screens.some(screen=>screen.audience.kind==='public')&&<small>Есть разделы, доступные без входа.</small>}</div>{error&&<p role="alert" className={ui.dataError}>{error}</p>}<button type="button" className={styles.primary} disabled={pending} onClick={()=>void publish()}>{pending?'Публикуем…':'Опубликовать'}</button></>}</div></PrototypeDialog>
}
