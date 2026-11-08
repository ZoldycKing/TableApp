import { templateExample } from '@/lib/templates/presentation'
import { ScreenFrame, ScreenTable } from './screens'
import { TemplateAppPreview } from './template-app-preview'
import { employeeExample } from '@/lib/templates/employee-example'

export function TemplateExample({ id }: { id: string }) {
  const employee = id === 'zayavki' ? employeeExample(id) : null
  const example = employee?.example ?? templateExample(id)
  const { template, built, rows, field, table, text } = example
  if (template.id === 'zayavki') {
    const items = rows.filter(row => row.tableId === built.appTableId)
    const columns = ['what', 'master', 'status', 'paid'].map(key => field('zayavki', key))
    return <div className="grid gap-5 sm:grid-cols-2">
      <ScreenFrame device="desktop" title="У диспетчера: все заявки" note="Диспетчер назначает мастера, согласует дату и ведёт оплату.">
        <ScreenTable caption="Заявки" columns={columns.map(column => column.name)} rows={items.slice(0, 4).map(row => columns.map(column => text(row, column) || '—'))} />
      </ScreenFrame>
      <TemplateAppPreview example={example} role="staff" email={employee!.email} name={employee!.name} title="У мастера: назначенные ему заявки"
        note="Откройте заявку и нажмите «Изменить»: можно обновить статус, добавить фото и комментарий. Стоимость и оплата мастеру не видны." />
    </div>
  }
  if (template.customer && !template.internalOnly) {
    return <div className="grid gap-5 sm:grid-cols-2">
      <TemplateAppPreview example={example} role="guest" title="Без входа: каталог и описание"
        note="Откройте карточку и нажмите кнопку оформления. Сначала подтвердите почту, затем заполните данные и отправьте заказ или заявку. При действующем входе код повторно не нужен. Оплату согласует сотрудник бизнеса." />
      <TemplateAppPreview example={example} role="client" email="irina@example.com" name="Ирина" title="Личный кабинет клиента: активные обращения и история"
        note="В шапке видно название бизнеса. Клиент видит свои записи и статусы; отменённые и завершённые обращения сохраняются в истории. Чужие обращения и внутренние заметки сюда не попадают." />
    </div>
  }
  if (template.id === 'crm') {
    const deals = rows.filter(row => row.tableId === table('deals').id)
    const clients = rows.filter(row => row.tableId === table('clients').id)
    return <div className="grid gap-5 sm:grid-cols-2">
      <ScreenFrame device="desktop" title="Воронка сделок (данные установки)" note="После установки открывается тот же App V2 редактор/публикация: канбан по этапам, создание сделки и запись контакта. Отдельного legacy-превью приложения нет.">
        <ScreenTable caption="Сделки" columns={['О чём сделка', 'Клиент', 'Этап', 'Вернуться']}
          rows={deals.slice(0, 4).map(row => [text(row, field('deals', 'what')), text(row, field('deals', 'client')), text(row, field('deals', 'stage')), text(row, field('deals', 'due')) || '—'])} />
      </ScreenFrame>
      <ScreenFrame device="phone" title="Клиент и связанные сделки" note="В установленном приложении карточка клиента показывает связанные сделки с этапом и датой следующего контакта — без декоративной timeline.">
        <ScreenTable caption="Клиенты" columns={['Клиент', 'Телефон']}
          rows={clients.slice(0, 4).map(row => [text(row, field('clients', 'name')), text(row, field('clients', 'phone')) || '—'])} />
      </ScreenFrame>
    </div>
  }
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
  if (template.id === 'salon') {
    return <div className="grid gap-5 sm:grid-cols-2">
      <TemplateAppPreview example={example} role="guest" tableId={table('services').id} title="Услуги, цена и длительность"
        note="Откройте услугу и нажмите «Записаться». Сначала подтвердите почту, затем выберите мастера и свободное время, заполните имя и телефон. Вся процедура должна помещаться в смену без пересечений. Оплату согласует сотрудник салона." />
      <TemplateAppPreview example={example} role="client" email="irina@example.com" name="Ирина" title="Личный кабинет клиента: записи и история"
        note="У Ирины есть предстоящая запись, завершённое посещение и отмена в истории. Предстоящую запись можно перенести или отменить. Завершение подтверждает мастер; цена и длительность сохраняются при изменении прайса." />
    </div>
  }
  const main = built.tables.find(item => item.id === built.appTableId)!
  const items = rows.filter(row => row.tableId === main.id)
  const hidden = new Set(example.views.find(view => view.id === built.appViewId)?.config.hiddenFieldIds ?? [])
  const columns = example.byTable.get(main.id)!.filter(item => !hidden.has(item.id) && item.type !== 'image' && item.type !== 'attachment' && item.type !== 'long_text').slice(0, 4)
  const role = template.production ? 'director' : 'manager'
  return <div className="grid gap-5 sm:grid-cols-2">
    <ScreenFrame device="desktop" title={`В рабочем пространстве: ${main.name.toLowerCase()}`} note={`Показаны ${Math.min(4, items.length)} из ${items.length} записей и ${columns.length} колонок. Доску и календарь, если они есть в шаблоне, открывают в рабочем пространстве.`}>
      <ScreenTable caption={main.name} columns={columns.map(column => column.name)} rows={items.slice(0, 4).map(row => columns.map(column => text(row, column) || '—'))} />
    </ScreenFrame>
    <TemplateAppPreview example={example} role={role} title={template.production ? 'В приложении директора: выпуски и сводка' : 'В приложении руководителя: список и карточки'}
      note={template.production ? 'Начальник смены вводит годный выпуск отдельной формой. Брак учитывается отдельно и материалы не расходует.' : 'Показан рабочий интерфейс руководителя. Откройте запись, чтобы посмотреть карточку. Готовый клиентский кабинет к этому шаблону пока не подключён.'} />
  </div>
}
