/*
 * Уборка технических журналов.
 *
 * Запуск вручную или по расписанию операционной системы. Сама по себе
 * ничего не удаляет: пока срок хранения категории не согласован, команда
 * честно отвечает отказом.
 *
 *   pnpm --filter @tableapp/web retention           # что есть и что устарело
 *   pnpm --filter @tableapp/web retention -- --run  # удалить устаревшее
 *
 * Регулярный запуск: раз в сутки по планировщику (cron, systemd timer,
 * «Планировщик заданий» в Windows) с тем же окружением, что у приложения.
 * Отдельной службы для этого не заводим — одна команда раз в сутки
 * не стоит нового процесса.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const envFile = resolve(root, '.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const { CATEGORIES, preview, purge, purgeStaffSessions } = await import('../src/lib/retention')

const run = process.argv.includes('--run')
const day = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

console.log(run ? 'Уборка журналов' : 'Что лежит в журналах (ничего не удаляется)')
console.log('')

for (const category of CATEGORIES) {
  const state = await preview(category.key)
  const срок = state.keepDays === null ? 'срок не согласован' : `хранить ${state.keepDays} дн.`
  const граница = state.boundary ? `, старше ${day.format(state.boundary)}` : ''

  console.log(`${category.key}: всего ${state.total}, устарело ${state.older} (${срок}${граница})`)
  console.log(`   ${state.what}`)

  if (!run) continue

  const result = await purge(category.key)
  if (result.ok) console.log(`   удалено: ${result.deleted}`)
  else if (result.reason === 'no_period') console.log('   пропущено: срок хранения не согласован')
  else console.log('   пропущено: уборка уже идёт в другом запуске')
}

if (run) {
  const staff = await purgeStaffSessions()
  console.log(`staff_sessions: удалено протухших ${staff}`)
}

console.log('')
console.log('Платежи, подписки и журнал изменений строк не трогаются: это документы,')
console.log('а не технический шум.')
process.exit(0)
