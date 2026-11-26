'use client'

import { useEffect, useRef } from 'react'
import { piazzolla, plexMono, plexSans } from '@/app/fonts'
import 'lenis/dist/lenis.css'
import { startScattaLanding } from './landing-motion'
import { landingMarkup } from './markup'
import './landing.css'

export function ScattaLanding({ entry, signedIn }: { entry: string; signedIn: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const html = landingMarkup(entry, signedIn)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    return startScattaLanding(root)
  }, [])
  return (
    <div
      ref={ref}
      className={`${plexSans.variable} ${plexMono.variable} ${piazzolla.variable} scatta-land`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
