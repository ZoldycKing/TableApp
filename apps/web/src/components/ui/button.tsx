import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import css from './ui.module.css'

type Variant = 'primary' | 'accent' | 'quiet' | 'ghost'
type Shape = 'pill' | 'rect'

const classFor = (variant: Variant) => variant === 'quiet' ? css.quiet : variant === 'ghost' ? css.ghost : css.button

export function Button({
  children, variant = 'primary', size = 'md', shape = 'pill', href, type = 'button', ...props
}: {
  children: ReactNode
  variant?: Variant
  size?: 'md' | 'sm'
  shape?: Shape
  href?: string
  type?: 'button' | 'submit'
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  const className = classFor(variant)
  const data = { 'data-variant': variant, 'data-size': size, 'data-shape': shape }
  if (href) return <Link href={href} className={className} {...data}>{children}</Link>
  return <button type={type} className={className} {...data} {...props}>{children}</button>
}
