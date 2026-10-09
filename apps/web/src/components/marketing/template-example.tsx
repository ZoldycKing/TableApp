import { templateExample } from '@/lib/templates/presentation'
import { ScreenFrame, ScreenTable } from './screens'
import { TemplateAppPreview } from './template-app-preview'

export function TemplateExample({ id }: { id: string }) {
  const example = templateExample(id)
  const { template, built, rows, field, table, text } = example
  if (template.inventory) {
    const items = rows.filter(row => row.tableId === table('items').id)
    const low = items.filter(row => row.data[field('items', 'low').id] === true)
    return <div className="grid gap-5 sm:grid-cols-2">
      <TemplateAppPreview example={example} role="staff" title="В приложении кладовщика: товары и остатки"
        note="Откройте товар: в карточке есть «Принять товар» и «Выдать товар». Списания и возвраты находятся в «Ещё действия»." />
      <ScreenFrame device="desktop" title="В таблице владельца: товары, которые пора заказать" note="Товар попадает сюда, когда остаток равен порогу или меньше него. Например: осталось 4 фильтра, порог — 6. Стоимость запаса считается по текущей закупочной цене.">
        <ScreenTable caption="Все товары на пороге закупки" columns={['Товар', 'Осталось, шт.', 'Порог закупки, шт.', 'Стоимость запаса']}
          rows={low.map(row => [text(row, field('items', 'name')), text(row, field('items', 'qty')), text(row, field('items', 'min')), `${text(row, field('items', 'total'))} ₽`])} />
      </ScreenFrame>
    </div>
  }
  if (template.portal) {
    return <div className="grid gap-5 sm:grid-cols-2">
      <TemplateAppPreview example={example} role="guest" tableId={table('services').id} title="Без входа: опубликованные услуги"
        note="Неопубликованные услуги и себестоимость сюда не попадают. Откройте услугу, чтобы посмотреть её описание." />
      <TemplateAppPreview example={example} role="client" email="petrov@example.ru" name="Алексей" title="После входа: личный кабинет клиента"
        note="Клиент видит только свои заказы, их статусы и историю. Откройте заказ, чтобы посмотреть подробности; данные других клиентов скрыты." />
    </div>
  }
  if (template.id === 'zayavki') {
    const items = rows.filter(row => row.tableId === built.appTableId)
    const columns = ['what', 'master', 'status', 'paid'].map(key => field('zayavki', key))
    return <div className="grid gap-5 sm:grid-cols-2">
      <ScreenFrame device="desktop" title="В таблице диспетчера: все заявки" note={`Показаны 4 из ${items.length} заявок. Диспетчер выбирает клиента, дату и почту мастера, ведёт стоимость и оплату. Доска и календарь доступны в рабочем пространстве.`}>
        <ScreenTable caption="Заявки" columns={columns.map(column => column.name)} rows={items.slice(0, 4).map(row => columns.map(column => text(row, column) || '—'))} />
      </ScreenFrame>
      <TemplateAppPreview example={example} role="staff" email="sergey@example.invalid" name="Сергей" title="В приложении мастера: его заявки"
        note="Сергей видит 2 назначенные ему заявки из 6. Через «Изменить» доступны статус, фото и комментарий. Стоимость и оплату мастер не видит." />
    </div>
  }
  if (template.id === 'salon') {
    return <div className="grid gap-5 sm:grid-cols-2">
      <TemplateAppPreview example={example} role="guest" tableId={table('services').id} title="Услуги, цена и длительность"
        note="Клиент выбирает услугу, мастера и свободное время. Вся процедура должна помещаться в смену без пересечений с другими записями. При первом оформлении подтверждается почта." />
      <TemplateAppPreview example={example} role="client" email="irina@example.com" name="Ирина" title="Личный кабинет клиента: записи и история"
        note="У Ирины есть предстоящая запись, завершённое посещение и отмена в истории. Предстоящую запись можно перенести или отменить. Завершение подтверждает мастер; цена и длительность сохраняются при изменении прайса." />
    </div>
  }
  const main = built.tables.find(item => item.id === built.appTableId)!
  const items = rows.filter(row => row.tableId === main.id)
  const columns = example.byTable.get(main.id)!.filter(item => item.type !== 'image' && item.type !== 'attachment' && item.type !== 'long_text').slice(0, 4)
  const role = template.production ? 'director' : 'manager'
  return <div className="grid gap-5 sm:grid-cols-2">
    <ScreenFrame device="desktop" title={`В рабочем пространстве: ${main.name.toLowerCase()}`} note={`Показаны ${Math.min(4, items.length)} из ${items.length} записей и ${columns.length} колонок. Доску и календарь, если они есть в шаблоне, открывают в рабочем пространстве.`}>
      <ScreenTable caption={main.name} columns={columns.map(column => column.name)} rows={items.slice(0, 4).map(row => columns.map(column => text(row, column) || '—'))} />
    </ScreenFrame>
    <TemplateAppPreview example={example} role={role} title={template.production ? 'В приложении директора: выпуски и сводка' : 'В приложении руководителя: список и карточки'}
      note={template.production ? 'Начальник смены вводит годный выпуск отдельной формой. Брак учитывается отдельно и материалы не расходует.' : 'Показан рабочий интерфейс руководителя. Откройте запись, чтобы посмотреть карточку. Готовый клиентский кабинет к этому шаблону пока не подключён.'} />
  </div>
}
