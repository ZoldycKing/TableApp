import { TemplateExample } from './template-example'
import { TemplateAppPreview } from './template-app-preview'
import { templateExample } from '@/lib/templates/presentation'
import styles from './elaya/content-pages.module.css'

const FOCUSED_DEMOS = {
  'client-portal': { template: 'zakazy', role: 'client', title: 'Только свои заказы.', instruction: 'Войдя по почте, Ирина открывает свои заказы и проверяет статус. Заказов других клиентов в её кабинете нет.', previewTitle: 'Кабинет Ирины', note: 'Откройте заказ, чтобы посмотреть его состав и статус.' },
  catalog: { template: 'zakazy', role: 'guest', title: 'Из каталога — в корзину.', instruction: 'Клиент выбирает товары и отправляет заказ. Сотрудник получает его в приложении и согласует оплату и получение.', previewTitle: 'Открытый каталог', note: 'Откройте товар и добавьте его в корзину. Оформление здесь учебное.' },
  warehouse: { template: 'sklad', role: 'staff', title: 'Принял товар. Обновил остаток.', instruction: 'Кладовщик выбирает товар и указывает количество. Движение остаётся в истории вместе со временем и почтой сотрудника.', previewTitle: 'Экран кладовщика', note: 'Откройте товар и попробуйте приёмку. Учебные изменения остаются только в этом примере.' },
  production: { template: 'proizvodstvo', role: 'foreman', title: 'Выпуск и расход — в одной форме.', instruction: 'Начальник смены вводит количество продукции. Перед сохранением видит расход материалов по нормам и предупреждение, если их не хватает.', previewTitle: 'Экран начальника смены', note: 'Выберите изделие и введите количество, чтобы посмотреть расход материалов.' },
} as const

export const DEMO_SLUGS = ['client-portal', 'order-management', 'production', 'employee-app', 'warehouse', 'catalog']

export function SolutionDemo({ slug }: { slug: string }) {
  if (slug === 'employee-app' || slug === 'order-management') return <TemplateExample id="zayavki" />
  const demo = FOCUSED_DEMOS[slug as keyof typeof FOCUSED_DEMOS]
  if (!demo) return null
  const example = templateExample(demo.template)
  return <div className={styles.focusDemo}>
    <div className={styles.focusDemoCopy}>
      <span>Попробуйте на учебных данных</span>
      <h3>{demo.title}</h3>
      <p>{demo.instruction}</p>
    </div>
    <TemplateAppPreview example={example} role={demo.role} email="irina@example.com" name="Ирина" title={demo.previewTitle} note={demo.note} screenId={slug === 'production' ? example.app.production?.formScreenId ?? undefined : undefined} />
  </div>
}
