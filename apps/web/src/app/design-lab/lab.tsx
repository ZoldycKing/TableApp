'use client'

import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox, Switch } from '@/components/ui/choice'
import { DataTable } from '@/components/ui/data-table'
import { DurationField } from '@/components/ui/duration-field'
import { TextField } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { DateField, DateRangeField, TimeField } from '@/components/ui/pickers'
import { Select } from '@/components/ui/select'
import { Tabs } from '@/components/ui/tabs'

const PEOPLE = [
  { id: 'olga', name: 'Ольга' },
  { id: 'anna', name: 'Анна Ким' },
  { id: 'igor', name: 'Игорь Лебедев' },
  { id: 'vera', name: 'Вера Л.' },
]

export function DesignLab() {
  const [name, setName] = useState('Анна Ким')
  const [master, setMaster] = useState('olga')
  const [notify, setNotify] = useState(true)
  const [deposit, setDeposit] = useState(false)
  const [tab, setTab] = useState('day')
  const [day, setDay] = useState('2026-11-24')
  const [from, setFrom] = useState('2026-11-26')
  const [to, setTo] = useState('2026-11-28')
  const [time, setTime] = useState('12:00')
  const [minutes, setMinutes] = useState(1440)
  const [open, setOpen] = useState(false)
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 20px 80px', display: 'grid', gap: 36 }}>
      <header>
        <p style={{ margin: 0, color: 'var(--sc-text-3)', fontFamily: 'var(--font-scatta-mono)', fontSize: 12 }}>Дизайн-система</p>
        <h1 style={{ margin: '8px 0 0', fontSize: 40, fontWeight: 500, letterSpacing: '-0.04em', fontStretch: '88%' }}>Примитивы Scatta</h1>
      </header>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Button>Собрать приложение</Button>
        <Button variant="accent" shape="rect">Создать бронь</Button>
        <Button variant="quiet" shape="rect">Отмена</Button>
        <Button variant="ghost">Войти</Button>
        <Button size="sm" href="/">На главную</Button>
      </section>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <TextField label="Клиент" value={name} onChange={event => setName(event.target.value)} />
        <Select label="Мастер" value={master} onValue={setMaster} options={PEOPLE.map(person => ({ value: person.id, label: person.name }))} />
        <DateField label="Дата" value={day} onValue={setDay} />
        <TimeField label="Время" value={time} onValue={setTime} />
        <DateRangeField label="Срок аренды" from={from} to={to} onChange={next => { setFrom(next.from); setTo(next.to) }} />
        <DurationField label="Первый ответ" minutes={minutes} onMinutes={setMinutes} hint="1440 минут показывается как сутки, не как сырое число." />
      </section>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        <Checkbox label="Показывать в меню" checked={deposit} onChecked={setDeposit} />
        <Switch label="Отправить клиенту подтверждение" checked={notify} onChecked={setNotify} />
      </section>

      <Tabs label="Вид расписания" value={tab} onValue={setTab} options={[{ value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]} />

      <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Badge tone="info">Подтверждена</Badge>
        <Badge tone="wait">Ждёт оплату</Badge>
        <Badge tone="ok">Выдана</Badge>
        <Badge tone="bad">Просрочена</Badge>
        <Badge>Прошла</Badge>
      </section>

      <section style={{ display: 'flex', gap: 12 }}>
        {PEOPLE.map(person => <Avatar key={person.id} id={person.id} size={40} label={person.name} />)}
      </section>

      <DataTable
        caption="Записи на 24.11.2026"
        columns={[
          { key: 'who', label: 'Клиент' },
          { key: 'what', label: 'Услуга' },
          { key: 'when', label: 'Время', numeric: true },
          { key: 'sum', label: 'Сумма', numeric: true },
        ]}
        rows={[
          { who: 'Анна Ким', what: 'Керамика, группа', when: '24.11.2026, 12:00', sum: '1 800 ₽' },
          { who: 'Игорь Лебедев', what: 'Кофемашина, замена помпы', when: '24.11.2026, 14:00', sum: '8 900 ₽' },
        ]}
      />

      <div><Button variant="accent" shape="rect" onClick={() => setOpen(true)}>Открыть окно</Button></div>
      <Modal
        title="Новая бронь"
        open={open}
        onClose={() => setOpen(false)}
        footer={<><Button variant="quiet" shape="rect" onClick={() => setOpen(false)}>Отмена</Button><Button variant="accent" shape="rect" onClick={() => setOpen(false)}>Создать бронь</Button></>}
      >
        <p style={{ margin: 0 }}>Окно по центру экрана. Дата {day.split('-').reverse().join('.')} в {time}. Кнопка остаётся внизу окна, а не за краем экрана.</p>
      </Modal>
    </main>
  )
}
