import Link from 'next/link'
import { FOOTER_COLUMNS, FOOTER_LEGAL } from '@/lib/site'
import { Logo } from './logo'

/**
 * Подвал.
 *
 * Не вторая копия шапки: здесь то, что ищут в конце страницы — куда пойти
 * дальше, как начать и где документы. Адреса берутся из общей карты сайта,
 * чтобы переименованный раздел не остался жить в подвале под старым именем.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-sand-200 bg-sand-100/60">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-ink-muted">
              Превращайте таблицы в рабочие приложения для сотрудников и клиентов.
              Данные хранятся в России.
            </p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="font-display text-sm font-bold">{column.title}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-sand-200 pt-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} TableApp · Сделано в России</span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a href="mailto:hello@tableapp.ru" className="transition-colors hover:text-ink">
              hello@tableapp.ru
            </a>
            {/*
              Документы обязательны до первой оплаты: без оферты и согласия
              на обработку данных нельзя принимать деньги ни от физлица,
              ни от юрлица. Пока это заготовки, и на страницах так и сказано.
            */}
            {FOOTER_LEGAL.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-ink">
                {link.label}
              </Link>
            ))}
          </span>
        </div>
      </div>
    </footer>
  )
}
