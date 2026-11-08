'use client'

import { createContext, useContext } from 'react'
import presentation from './app-presentation.module.css'

export const DemoCatalogMedia = createContext<Readonly<Record<string, number | string>>>({})

export function useDemoCatalogPhoto(rowId?: string) {
  const photos = useContext(DemoCatalogMedia)
  return rowId ? photos[rowId] : undefined
}

export function DemoCatalogPhoto({ index }: { index: number | string }) {
  if (typeof index === 'string') return <span className={presentation.photo}><img src={index} alt="" loading="lazy" /></span>
  return <span aria-hidden="true" className={`${presentation.photo} ${presentation.demoPhoto}`}
    style={{ backgroundPosition: `${index % 5 * 25}% ${Math.floor(index / 5) * 25}%` }} />
}
