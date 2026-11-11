import type { ReactNode } from 'react'
import { ProtoIcon } from '../prototype/icons'
import presentation from '@/components/runtime/app-presentation.module.css'
import { builderV2Initials, builderV2RecordTone, builderV2StatusTone } from './record-presentation'
import ui from './view.module.css'

export function BuilderV2RecordAvatar({ name, id, icon = 'apps', tone = true }: { name?: string; id: string; icon?: string; tone?: boolean }) {
  return <span className={`${presentation.avatar} ${ui.recordAvatar}`} data-tone={tone ? builderV2RecordTone(id) : undefined} aria-hidden="true">
    {(name && builderV2Initials(name)) || <ProtoIcon name={icon} size={19} />}
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
