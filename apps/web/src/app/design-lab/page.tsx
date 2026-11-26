import type { Metadata } from 'next'
import { DesignLab } from './lab'

export const metadata: Metadata = {
  title: 'Дизайн-система',
  robots: { index: false, follow: false },
}

export default function DesignLabPage() {
  return <DesignLab />
}
