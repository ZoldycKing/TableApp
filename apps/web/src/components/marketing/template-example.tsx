import { ANONYMOUS, asRole, visibleScreensFor } from '@/lib/app-roles'
import { templateExample } from '@/lib/templates/presentation'
import { canAccessRow, rulesFor } from '@/lib/row-access'
import { ScreenCard, ScreenFrame, ScreenList, ScreenTable } from './screens'

type Example = ReturnType<typeof templateExample>

function card(example: Example, role: string, email?: string) {
  const visitor = asRole(role, email ?? null)
  const screen = visibleScreensFor(example.app, visitor).find(item => item.type === 'detail' && item.tableId === example.built.appTableId)
  if (!screen || screen.type !== 'detail') return null
  const row = example.rows.find(item => item.tableId === screen.tableId && canAccessRow(rulesFor(example.app, screen.tableId, visitor), email ? { email } : null, item.data))
  if (!row) return null
  const fields = screen.components.flatMap(component => component.type === 'field'
    ? example.fields.filter(field => field.id === component.fieldId && example.text(row, field)) : [])
  const primary = example.fields.find(field => field.id === example.built.tables.find(table => table.id === screen.tableId)!.primaryFieldId)!
  return <ScreenCard title={example.text(row, primary)} fields={fields.slice(0, 6).map(field => ({ label: field.name, value: example.text(row, field) }))}
    actions={screen.components.flatMap(component => component.type === 'button' ? [component.label] : [])} />
}

export function TemplateExample({ id }: { id: string }) {
  const example = templateExample(id)
  const { template, built, rows, field, table, text } = example
  if (template.inventory) {
    const items = rows.filter(row => row.tableId === table('items').id)
    const low = items.filter(row => row.data[field('items', 'low').id] === true)
    return <div className="grid gap-5 sm:grid-cols-2">
      <ScreenFrame title="В приложении кладовщика: товары и остатки" note={`Показаны 4 из ${items.length} товаров. В карточке — «Принять товар» и «Выдать товар»; списания и возвраты находятся в «Ещё действия».`}>
        <ScreenList title="Товары" right={String(items.length)} rows={items.slice(0, 4).map(row => ({ title: text(row, field('items', 'name')), subtitle: text(row, field('items', 'sku')), meta: `${text(row, field('items', 'qty'))} шт.` }))} />
      </ScreenFrame>
      <ScreenFrame device="desktop" title="В таблице владельца: товары, которые пора заказать" note="Товар попадает сюда, когда остаток равен порогу или меньше него. Например: осталось 4 фильтра, порог — 6. Стоимость запаса считается по текущей закупочной цене.">
        <ScreenTable caption="Все товары на пороге закупки" columns={['Товар', 'Осталось, шт.', 'Порог закупки, шт.', 'Стоимость запаса']}
          rows={low.map(row => [text(row, field('items', 'name')), text(row, field('items', 'qty')), text(row, field('items', 'min')), `${text(row, field('items', 'total'))} ₽`])} />
      </ScreenFrame>
    </div>
  }
  if (template.portal) {
    const visible = visibleScreensFor(example.app, ANONYMOUS).find(screen => screen.type === 'tiles')!
    const services = rows.filter(row => row.tableId === table('services').id && row.data[field('services', 'published').id] === true)
    return <div className="grid gap-5 sm:grid-cols-2">
      <ScreenFrame title="Без входа: опубликованные услуги" note={`Показаны 4 из ${services.length} услуг. Неопубликованные услуги и себестоимость сюда не попадают.`}>
        <div className="grid grid-cols-2 gap-3 p-3">{services.slice(0, 4).map(row => <div key={row.id} className="rounded-xl border border-sand-200 p-3">
          <p className="text-sm font-medium">{text(row, field('services', 'name'))}</p>
          <p className="mt-2 text-sm tabular-nums">{text(row, field('services', 'price'))}</p>
          <p className="mt-1 text-xs text-ink-muted">{text(row, field('services', 'term'))}</p>
        </div>)}</div>
      </ScreenFrame>
      <ScreenFrame title="После входа: карточка заказа клиента" note="Клиент видит заказы, в которых указана его почта. Показан фрагмент карточки; доступ всей организации отдельно не настроен.">
        {visible && card(example, 'client', 'petrov@example.ru')}
      </ScreenFrame>
    </div>
  }
  if (template.id === 'zayavki') {
    const items = rows.filter(row => row.tableId === built.appTableId)
    const columns = ['what', 'master', 'status', 'paid'].map(key => field('zayavki', key))
    return <div className="grid gap-5 sm:grid-cols-2">
      <ScreenFrame device="desktop" title="В таблице диспетчера: все заявки" note={`Показаны 4 из ${items.length} заявок. Диспетчер выбирает клиента, дату и почту мастера, ведёт стоимость и оплату. Доска и календарь доступны в рабочем пространстве.`}>
        <ScreenTable caption="Заявки" columns={columns.map(column => column.name)} rows={items.slice(0, 4).map(row => columns.map(column => text(row, column) || '—'))} />
      </ScreenFrame>
      <ScreenFrame title="В приложении мастера: его заявка" note="Сергей видит 2 назначенные ему заявки из 6. Через «Изменить» он меняет только статус, фото и комментарий. Стоимость и оплату мастер не видит. Почта в учебных записях вымышленная.">
        {card(example, 'staff', 'sergey@example.invalid')}
      </ScreenFrame>
    </div>
  }
  const main = built.tables.find(item => item.id === built.appTableId)!
  const primary = example.fields.find(item => item.id === main.primaryFieldId)!
  const items = rows.filter(row => row.tableId === main.id)
  const columns = example.byTable.get(main.id)!.filter(item => item.type !== 'image' && item.type !== 'attachment' && item.type !== 'long_text').slice(0, 4)
  const role = template.production ? 'director' : 'manager'
  return <div className="grid gap-5 sm:grid-cols-2">
    <ScreenFrame device="desktop" title={`В рабочем пространстве: ${main.name.toLowerCase()}`} note={`Показаны ${Math.min(4, items.length)} из ${items.length} записей и ${columns.length} колонок. Доску и календарь, если они есть в шаблоне, открывают в рабочем пространстве.`}>
      <ScreenTable caption={main.name} columns={columns.map(column => column.name)} rows={items.slice(0, 4).map(row => columns.map(column => text(row, column) || '—'))} />
    </ScreenFrame>
    <ScreenFrame title="В приложении: карточка записи" note={template.production ? 'Фрагмент карточки выпуска директора. Начальник смены вводит годный выпуск отдельной формой; брак учитывается отдельно и материалы не расходует.' : 'Фрагмент карточки. Статус, дату и другие вводимые поля меняют через «Изменить». Права сотрудников и отбор их записей нужно настроить перед публикацией.'}>
      {items.length > 0 && primary ? card(example, role) : null}
    </ScreenFrame>
  </div>
}
