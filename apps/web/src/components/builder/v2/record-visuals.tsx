import type { ReactNode } from 'react'
import { ProtoIcon } from '../prototype/icons'
import presentation from '@/components/runtime/app-presentation.module.css'
import { BuilderV2Picture } from './media'
import type { BuilderV2MediaItem } from './media-values'
import { Avatar } from '@/components/ui/avatar'
import { builderV2RecordTone, builderV2StatusTone } from './record-presentation'
import ui from './view.module.css'

export function BuilderV2RecordAvatar({ name, id, icon = 'apps', tone = true, forceIcon = false }: { name?: string; id: string; icon?: string; tone?: boolean; forceIcon?: boolean }) {
  return <span className={`${presentation.avatar} ${ui.recordAvatar}`} data-tone={tone ? builderV2RecordTone(id) : undefined} aria-hidden="true" style={name && !forceIcon ? { background: 'transparent', padding: 0, overflow: 'hidden' } : undefined}>
    {name && !forceIcon ? <Avatar id={id || name} fill /> : <ProtoIcon name={icon} size={19} />}
  </span>
}

/** Product photo thumb for warehouse lists — photo or neutral category mark, never letter initials. */
export function InventoryProductThumb({
  image, icon = 'box', size = 'list', label,
}: {
  image?: BuilderV2MediaItem
  icon?: string
  size?: 'list' | 'journal' | 'card'
  label?: string
}) {
  return <span className={ui.productThumb} data-size={size} data-empty={!image || undefined} aria-hidden={image ? undefined : true} title={label}>
    {image ? <BuilderV2Picture item={image} large={size === 'card'} /> : <ProtoIcon name={icon} size={size === 'card' ? 36 : 22} />}
  </span>
}

export function BuilderV2OrderHero({ status, amount, editor, loading = false, scoped = false }: { status?: string; amount?: string; editor?: ReactNode; loading?: boolean; scoped?: boolean }) {
  if (!status && !amount && !editor && !loading) return null
  return <section className={`${presentation.panel} ${ui.orderHero}`} aria-label="Главное о заказе" aria-busy={loading}>
    {loading && <div className={ui.orderLoading} aria-hidden="true"><i /><i /></div>}
    <div className={ui.orderHeroMain}>
      {status && <span className={ui.heroStatus} data-tone={builderV2StatusTone(status)}><ProtoIcon name="box" size={18} />{status}</span>}
      {amount && <div className={ui.heroAmount}><span>{scoped ? 'Сумма доступных позиций' : 'Сумма заказа'}</span><strong>{amount}</strong></div>}
    </div>
    {editor && <details className={ui.statusPicker}><summary>Изменить статус</summary>{editor}</details>}
  </section>
}
