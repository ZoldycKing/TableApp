'use client'
import Link from 'next/link'
import {useRef,type MouseEvent,type ReactNode} from 'react'
import {PublishedV2Button} from './published-button'
import {usePublishedV2} from './published-context'
import ui from './view.module.css'

/** One native keyboard control; pointer delegation never intercepts a nested control. */
export function CollectionActionRow({appId,nodeId,screenId,recordId,itemId,title,actionName,as='div',children,content,whole=false}:{appId:string;nodeId:string;screenId:string;recordId?:string;itemId:string;title:string;actionName:string;as?:'div'|'tr';children:(control:ReactNode)=>ReactNode;content?:ReactNode;whole?:boolean}){
  const runtime=usePublishedV2(),button=useRef<HTMLButtonElement>(null),link=useRef<HTMLAnchorElement>(null)
  const control=runtime?<PublishedV2Button node={{id:nodeId,label:actionName,variant:'secondary'}} screenId={screenId} recordId={recordId} itemId={itemId} itemLabel={title} triggerRef={button} buttonContent={content} buttonClassName={whole?ui.recordButton:ui.recordLink}/>:<Link ref={link} className={whole?ui.recordButton:ui.recordLink} aria-label={`${actionName}: ${title}`} href={`/apps/${encodeURIComponent(appId)}/actions/${encodeURIComponent(nodeId)}?screen=${encodeURIComponent(screenId)}${recordId?`&row=${encodeURIComponent(recordId)}`:''}&item=${encodeURIComponent(itemId)}`}>{content??actionName}</Link>
  const delegate=(event:MouseEvent<HTMLElement>)=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
    if((event.target as Element).closest('button,a,input,select,textarea,label,summary,[contenteditable],[role="button"]')||window.getSelection()?.toString())return
    ;(button.current??link.current)?.click()
  }
  return as==='tr'?<tr className={ui.actionRow} onClick={delegate}>{children(control)}</tr>:<div className={`${ui.row} ${ui.actionRow}`} onClick={delegate}>{children(control)}</div>
}
