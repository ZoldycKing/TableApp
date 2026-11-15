'use client'
import type { AppV2Json } from '@tableapp/schema/app-v2'
import { BuilderV2Picture } from './media'
import { builderV2MediaItems } from './media-values'
import { usePublishedV2 } from './published-context'
import { ProtoIcon } from '../prototype/icons'
import css from './booking-people.module.css'
export function BookingAvatar({ name, photo, small = false }: { name: string; photo?: AppV2Json; small?: boolean }) {
  const published = usePublishedV2(), image = builderV2MediaItems(photo, published?.slug).find(item => item.image)
  return <span className={css.avatar} data-small={small || undefined} aria-label={name} role="img">{image ? <BuilderV2Picture item={image} /> : <ProtoIcon name="user" size={small ? 16 : 28} />}</span>
}
