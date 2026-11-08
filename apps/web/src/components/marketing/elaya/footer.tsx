import Link from 'next/link'
import { FOOTER_COLUMNS, FOOTER_LEGAL } from '@/lib/site'
import { ElayaBrand } from './brand'
import styles from './site.module.css'

export function ElayaFooter() {
  return <footer className={styles.footer} data-site-footer>
    <div className={styles.footerInner}>
      <div className={styles.footerGrid} data-footer-columns>
        <div><Link href="/" aria-label="TableApp, главная"><ElayaBrand /></Link><p className={styles.footerDescription}>Ваши таблицы. Приложение для вашего бизнеса.</p><p className={styles.footerDescription}><a href="mailto:hello@tableapp.ru">hello@tableapp.ru</a></p></div>
        {FOOTER_COLUMNS.map(column => <div key={column.title}><h2>{column.title}</h2><ul>{column.links.map(link => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul></div>)}
      </div>
      <div className={styles.footerBottom}><span>© {new Date().getFullYear()} TableApp</span><div className={styles.footerLegal}>{FOOTER_LEGAL.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</div><span>Данные хранятся в России</span></div>
      <div className={styles.footerWord} aria-hidden>TableApp</div>
    </div>
  </footer>
}
