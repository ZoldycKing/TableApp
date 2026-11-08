'use client'
import type {AppV2,AppV2Node} from '@tableapp/schema/app-v2'
import ui from './view.module.css'
export function BoardMoveSettings({app,node,onChange}:{app:AppV2;node:Extract<AppV2Node,{type:'collection'}>;onChange:(roles:string[]|null)=>void}){
  const roles=node.kanbanMoveRoleIds??[]
  return <section className={ui.formActionSettings} aria-label="Смена статуса"><label className={ui.inlineCheck}><input type="checkbox" checked={roles.length>0} onChange={event=>onChange(event.target.checked?[app.roles.find(role=>role.id==='owner')?.id??app.roles[0]!.id]:null)} disabled={!app.roles.length}/>Разрешить менять статус</label>{roles.length>0&&<><fieldset><legend>Кто может менять статус</legend>{app.roles.map(role=><label className={ui.inlineCheck} key={role.id}><input type="checkbox" checked={roles.includes(role.id)} onChange={event=>{const next=event.target.checked?[...roles,role.id]:roles.filter(id=>id!==role.id);onChange(next.length?next:null)}}/>{role.name}</label>)}</fieldset><p className={ui.hint}>Перетаскиванием между колонками или кнопкой в карточке. Ограничения на свои записи сохраняются.</p></>}</section>
}
