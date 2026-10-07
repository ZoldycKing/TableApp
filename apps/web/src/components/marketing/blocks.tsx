import Link from 'next/link'
import type { ReactNode } from 'react'
import { Reveal } from './reveal'
import { Underline } from './icons'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

/**
 * Общие блоки публичных страниц.
 *
 * Страниц стало больше десятка, и у каждой одни и те же части: шапка с
 * хлебными крошками, раздел с заголовком, вопросы, кнопка внизу. Копия этой
 * разметки на каждой странице означала бы, что правка отступа делается
 * двенадцать раз, а на тринадцатой странице забывается.
 *
 * Абстракции ровно столько, сколько нужно: это части страницы, а не движок
 * содержимого. Текст лежит в данных, разметка — здесь.
 */

/** Оболочка публичной страницы: шапка, содержимое, подвал. */
export function MarketingShell({
  signedIn,
  children,
}: {
  signedIn: boolean
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-sand-50 text-ink">
      {/*
        Переход к содержимому для тех, кто ходит клавишей: иначе каждый раз
        приходится проходить всю шапку с двумя выпадающими списками.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-sand-50"
      >
        Перейти к содержимому
      </a>
      <SiteHeader signedIn={signedIn} />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  )
}

/**
 * Хлебные крошки.
 *
 * Человеку — понять, где он оказался, придя из поиска. Поисковику — увидеть
 * устройство сайта. Последний пункт не ссылка: ссылка на саму себя
 * не помогает никому.
 */
export function Breadcrumbs({ trail }: { trail: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
      {trail.map((item, index) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden>·</span> : null}
          {item.href ? (
            <Link href={item.href} className="transition-colors hover:text-ink">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="text-ink-soft">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/**
 * Первый экран внутренней страницы.
 *
 * Один H1 на страницу — он здесь. Дальше по странице только H2 и H3:
 * заголовок отвечает на «куда я попал», а не выбирается по размеру шрифта.
 */
export function PageHero({
  trail,
  emoji,
  title,
  lead,
  note,
  actions,
}: {
  trail?: { href?: string; label: string }[]
  emoji?: string
  title: ReactNode
  lead: string
  note?: string
  actions?: ReactNode
}) {
  return (
    <section className="relative overflow-hidden border-b border-sand-200">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="dot-grid absolute inset-0 opacity-50" />
        <div className="animate-drift absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-sage-100 opacity-70 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-4xl px-5 py-20 sm:px-8">
        {trail ? <Breadcrumbs trail={trail} /> : null}

        {emoji ? (
          <p className="mt-8 text-4xl" aria-hidden>
            {emoji}
          </p>
        ) : null}

        {/*
          Размер заголовка растёт вместе с экраном, а длинное слово при нужде
          переносится. На 320 точках «Производственный учёт» в три сантиметра
          высотой не помещался в строку и обрезался краем блока — видно было
          «Производственн».
        */}
        <h1 className="mt-4 hyphens-auto font-display text-[1.6rem] font-extrabold leading-[1.15] [overflow-wrap:break-word] sm:text-[2.25rem] sm:leading-[1.08] lg:text-[3rem]">
          {title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{lead}</p>
        {note ? <p className="mt-4 max-w-2xl text-sm text-ink-muted">{note}</p> : null}
        {actions ? <div className="mt-9 flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  )
}

/** Главная кнопка страницы: одно действие, названное действием. */
export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-ink px-6 py-3.5 text-sm font-medium text-sand-50 shadow-soft transition-all hover:-translate-y-0.5 hover:bg-ink/90 hover:shadow-lift"
    >
      {children}
    </Link>
  )
}

/** Второе действие: посмотреть, прежде чем начинать. */
export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-sand-300 bg-white/60 px-6 py-3.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-ink/25 hover:bg-white"
    >
      {children}
      <span className="ml-1.5 inline-block transition-transform group-hover:translate-x-1">→</span>
    </Link>
  )
}

export function Section({
  id,
  title,
  lead,
  tone = 'plain',
  width = 'wide',
  children,
}: {
  id?: string
  title?: string
  lead?: string
  /** Чередование фона: соседние разделы не должны сливаться в одну простыню. */
  tone?: 'plain' | 'white' | 'sand'
  /**
   * Ширина содержимого. `plans` — для сравнения тарифов: четыре карточки
   * рядом требуют около 1200 px, в `wide` (1024 px) они сжимаются до 240 px
   * и цена перестаёт помещаться в отступы.
   */
  width?: 'narrow' | 'wide' | 'plans'
  children: ReactNode
}) {
  const shell =
    tone === 'white'
      ? 'border-y border-sand-200 bg-white/70'
      : tone === 'sand'
        ? 'border-y border-sand-200 bg-sand-100/60'
        : ''
  const inner =
    width === 'narrow' ? 'max-w-4xl' : width === 'plans' ? 'max-w-[75rem]' : 'max-w-5xl'

  return (
    <section id={id} className={`${shell} ${id ? 'scroll-mt-20' : ''}`}>
      <div className={`mx-auto w-full ${inner} px-5 py-20 sm:px-8`}>
        {title ? (
          <Reveal>
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h2>
            {lead ? <p className="mt-3 max-w-2xl text-ink-soft">{lead}</p> : null}
          </Reveal>
        ) : null}
        <div className={title ? 'mt-10' : ''}>{children}</div>
      </div>
    </section>
  )
}

/** Сетка карточек: возможности, шаги, что появится вместо нынешнего. */
export function CardGrid({
  items,
  columns = 2,
}: {
  items: { title: string; text: string }[]
  columns?: 2 | 3
}) {
  return (
    <div className={`grid gap-5 sm:grid-cols-2 ${columns === 3 ? 'lg:grid-cols-3' : ''}`}>
      {items.map((item, index) => (
        <Reveal key={item.title} delay={(index % columns) * 100}>
          <div className="h-full rounded-2xl border border-sand-200 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-sage-300 hover:shadow-lift">
            <h3 className="font-display text-base font-bold">{item.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.text}</p>
          </div>
        </Reveal>
      ))}
    </div>
  )
}

/** Кто что делает по шагам: работа глазами тех, кто её ведёт. */
export function Workflow({ steps }: { steps: { actor: string; text: string }[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <Reveal key={`${step.actor}-${step.text}`} delay={index * 80}>
          <li className="flex gap-4 rounded-2xl border border-sand-200 bg-white px-6 py-5 shadow-soft">
            <span className="font-display text-2xl font-extrabold text-sage-300">0{index + 1}</span>
            <p className="text-sm leading-relaxed text-ink-soft">
              <span className="font-semibold text-ink">{step.actor}</span> {step.text}
            </p>
          </li>
        </Reveal>
      ))}
    </ol>
  )
}

/** Список строк — то, что человек увидит на экране. */
export function ScreenList({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-8 shadow-soft">
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <ul className="mt-5 divide-y divide-sand-200">
        {lines.map((line) => (
          <li key={line} className="py-3 text-sm text-ink-soft">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Честные границы.
 *
 * Стоят до кнопки, а не после: человек должен узнать, чего нет, от нас —
 * и до того, как заплатит.
 */
export function Limits({ items }: { items: string[] }) {
  return (
    <div className="rounded-2xl border border-sand-200 bg-sand-100/70 p-7">
      <h3 className="font-display text-base font-bold">Честно о границах</h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-muted/50" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FaqList({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="divide-y divide-sand-200 border-y border-sand-200">
      {items.map((item, index) => (
        <Reveal key={item.question} delay={index * 70}>
          <details className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 transition-colors hover:text-sage-700">
              <h3 className="font-display text-base font-bold">{item.question}</h3>
              <span className="shrink-0 text-ink-muted transition-transform duration-300 group-open:rotate-45">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.answer}</p>
          </details>
        </Reveal>
      ))}
    </div>
  )
}

/** Кнопка в конце страницы: одно действие и одна причина его сделать. */
export function CtaSection({
  title,
  accent,
  text,
  href,
  label,
  secondary,
}: {
  title: string
  /** Слово, которое подчёркивается: акцент один на блок. */
  accent: string
  text: string
  href: string
  label: string
  secondary?: { href: string; label: string }
}) {
  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-20 sm:px-8">
      <div className="rounded-[2rem] border border-sand-200 bg-white px-8 py-16 text-center shadow-soft sm:px-14">
        <h2 className="font-display text-2xl font-extrabold leading-tight sm:text-[2.2rem]">
          {title}{' '}
          <span className="relative inline-block text-sage-700">
            <span className="accent-word">{accent}</span>
            <Underline className="text-sage-400/70" />
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-ink-soft">{text}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PrimaryLink href={href}>{label}</PrimaryLink>
          {secondary ? <SecondaryLink href={secondary.href}>{secondary.label}</SecondaryLink> : null}
        </div>
      </div>
    </section>
  )
}

/**
 * Разметка для поиска.
 *
 * Только то, что правда: кто мы и что это за продукт. Ни отзывов, ни оценок —
 * выдуманный рейтинг в разметке это обман и поисковика, и человека.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Данные наши собственные и статические: подставлять сюда нечего.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
