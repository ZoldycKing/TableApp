'use client'
import { createContext, useContext, type ReactNode } from 'react'
import { ProtoIcon } from '../prototype/icons'
import { BuilderV2Picture } from './media'
import type { BuilderV2MediaItem } from './media-values'
import { builderV2Initials, builderV2StatusTone, builderV2ContactHref } from './record-presentation'
import css from './record-blocks.module.css'

/** Native adapters may append business actions; ordinary profiles use normal child buttons/workflows. */
export const RecordProfileActions = createContext<{ nodeId: string; actions: ReactNode } | null>(null)
export function RecordProfileCard({ title, subtitle, image, contacts = [], children, actions, className = '' }: {
  title: string; subtitle?: string; image?: BuilderV2MediaItem; contacts?: { label: string; kind: 'phone'|'email'|'text'; value: string }[];
  children?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return <section className={`${css.profile} ${className}`} data-record-profile>
    <div className={css.identity}><span className={css.avatar} aria-hidden>{image ? <BuilderV2Picture item={image} /> : builderV2Initials(title) || <ProtoIcon name="user" size={26} />}</span><div><h2>{title || 'Без названия'}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
    {!!contacts.filter(contact => contact.value.trim()).length && <dl className={css.contacts}>{contacts.filter(contact => contact.value.trim()).map((contact, index) => {
      const href = contact.kind === 'text' ? undefined : builderV2ContactHref(contact.kind, contact.value)
      return <div key={index}><dt>{contact.label}</dt><dd><ProtoIcon name={contact.kind === 'phone' ? 'phone' : contact.kind === 'email' ? 'mail' : 'list'} size={16}/>{href ? <a href={href}>{contact.value}</a> : <span>{contact.value}</span>}</dd></div>
    })}</dl>}
    {children && <div className={css.profileContent}>{children}</div>}
    {actions && <div className={css.actions}>{actions}</div>}
  </section>
}

export function BuilderV2Profile({ nodeId, ...props }: Parameters<typeof RecordProfileCard>[0] & { nodeId: string }) {
  const extension = useContext(RecordProfileActions)
  return <RecordProfileCard {...props} actions={extension?.nodeId === nodeId ? extension.actions : props.actions}/>
}

export function RecordHistoryContent({ title, date, subtitle, status, amount, note }: { title: string; date?: string; subtitle?: string; status?: string; amount?: string; note?: string }) {
  const tone = status && /^(записан|scheduled)$/iu.test(status) ? 'sky' : status && /^(приш[её]л)$/iu.test(status) ? 'mint' : status && /^(не приш[её]л)$/iu.test(status) ? 'rose' : builderV2StatusTone(status ?? '')
  return <><span className={css.historyMain}><strong>{title}</strong>{(date || subtitle) && <small>{[date,subtitle].filter(Boolean).join(' · ')}</small>}{note && <span className={css.historyNote}>{note}</span>}</span><span className={css.historyAside}>{status && <span className={css.status} data-tone={tone}>{status}</span>}{amount && <b>{amount}</b>}</span></>
}
export function RecordHistoryItem({ onOpen, ...props }: Parameters<typeof RecordHistoryContent>[0] & { onOpen?: () => void }) {
  const content = <RecordHistoryContent {...props}/>
  return onOpen ? <button type="button" className={css.historyItem} onClick={onOpen}>{content}<ProtoIcon name="arrow" size={15}/></button> : <div className={css.historyItem}>{content}</div>
}
export const recordHistoryStyles = css
