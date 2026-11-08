import { templateExample } from './presentation'

/** Marketing fixture: the displayed assignee and their sign-in email must describe the same person. */
export function employeeExample(id: string) {
  const example = templateExample(id)
  const assignment = example.app.customer?.assignmentFieldId
  if (id !== 'zayavki' || !assignment) return { example, email: '', name: 'Мастер' }
  const field = example.field('zayavki', 'master')
  const names = new Map<string, string>()
  example.rows = example.rows.map(row => {
    if (row.tableId !== example.app.customer!.tableId) return row
    const name = example.text(row, field) || 'Мастер'
    if (!names.has(name)) names.set(name, names.size ? `worker-${names.size + 1}@example.invalid` : 'worker@example.invalid')
    return { ...row, data: { ...row.data, [assignment]: names.get(name)! } }
  })
  const [name, email] = names.entries().next().value ?? ['Мастер', 'worker@example.invalid']
  return { example, name, email }
}
