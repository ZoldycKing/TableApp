/**
 * Резервная копия базы.
 *
 * Зачем отдельный скрипт, когда есть `pg_dump`. Затем, что копия, которую
 * никто не разворачивал, — это не копия, а файл. Здесь три действия в одном
 * месте: снять, перечислить и **развернуть в отдельную базу**. Последнее
 * и есть проверка: пока копия не развёрнута, неизвестно, цела ли она.
 *
 * Чего скрипт не делает намеренно:
 *
 * - **Не разворачивает поверх рабочей базы.** Имя цели задаётся руками
 *   и сверяется с именем из `DATABASE_URL`; совпало — отказ. Восстановление
 *   «на место» делают осознанно и руками, а не командой, которую легко
 *   набрать не в том окне.
 * - **Не ходит в облако и не шифрует.** Куда класть копии и чем шифровать —
 *   решение владельца, а не догадка скрипта: см. `docs/backups.md`.
 * - **Не ставит себя в расписание.** Регулярность — тоже решение владельца,
 *   и у неё есть цена (место, время, доступ к файлам).
 *
 * Где берётся `pg_dump`. Сначала в системе. Если его там нет — в контейнере
 * `docker compose` из этого же репозитория: в разработке базы на машине нет,
 * а в контейнере с Postgres инструменты лежат те же и той же версии. Версия
 * важна: `pg_dump` старше сервера отказывается работать, и узнать об этом
 * в день аварии — плохая минута.
 *
 * Команды:
 *
 *     pnpm db:backup                       снять копию в ./backups
 *     pnpm db:backup list                  что уже снято
 *     pnpm db:backup restore <файл> <имя>  развернуть в отдельную базу
 */

import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import type { Writable } from 'node:stream'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const RAW_URL = process.env.DATABASE_URL
if (!RAW_URL) {
  console.error('DATABASE_URL не задан: без него неизвестно, с какой базы снимать копию.')
  process.exit(1)
}

const SOURCE = new URL(RAW_URL)
const SOURCE_DB = decodeURIComponent(SOURCE.pathname.replace(/^\//, ''))
const BACKUP_DIR = join(root, 'backups')
const CONTAINER = process.env.BACKUP_CONTAINER ?? 'tableapp-postgres'

/**
 * Чем запускать инструменты Postgres.
 *
 * `local` — они есть в системе. `docker` — их нет, но есть контейнер базы
 * из `docker-compose.yml`. Во втором случае адрес базы переписывается
 * на внутренний: снаружи порт проброшен, изнутри контейнера база своя.
 */
type Runner = { kind: 'local' | 'docker'; url: URL }

async function chooseRunner(): Promise<Runner> {
  const requested = process.env.BACKUP_RUNNER
  if (requested && requested !== 'local' && requested !== 'docker') throw new Error('BACKUP_RUNNER: local или docker')
  if (requested !== 'docker' && await works('pg_dump', ['--version'])) return { kind: 'local', url: SOURCE }

  if (requested !== 'local' && await works('docker', ['exec', CONTAINER, 'pg_dump', '--version'])) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(SOURCE.hostname)) {
      throw new Error('Для удалённой БД нужны локальные pg_dump/pg_restore; адрес нельзя заменять контейнером.')
    }
    const inside = new URL(SOURCE.toString())
    inside.hostname = '127.0.0.1'
    inside.port = '5432'
    return { kind: 'docker', url: inside }
  }

  console.error(
    `Не нашёл pg_dump ни в системе, ни в контейнере «${CONTAINER}».\n` +
      'Поставьте клиентские инструменты PostgreSQL той же версии, что и сервер,\n' +
      'либо поднимите базу командой pnpm db:up.',
  )
  process.exit(1)
}

function command(runner: Runner, tool: string, args: string[]): [string, string[]] {
  if (runner.kind === 'local') return [tool, args]
  return ['docker', ['exec', '-i', CONTAINER, tool, ...args]]
}

async function works(bin: string, args: string[]): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(bin, args, { stdio: 'ignore' })
    child.on('error', () => done(false))
    child.on('close', (code) => done(code === 0))
  })
}

/** Запуск с выводом на экран. Падение — это падение, а не предупреждение. */
/*
 * Аргументы передаются списком, без оболочки: в них ходит адрес базы вместе
 * с паролем, а оболочка его и склеит, и запишет в историю команд.
 */
async function run(bin: string, args: string[], options: { stdout?: Writable } = {}): Promise<void> {
  const child = spawn(bin, args, {
    stdio: [options.stdout ? 'ignore' : 'inherit', options.stdout ? 'pipe' : 'inherit', 'inherit'],
  })
  const completed = new Promise<void>((done, fail) => {
    child.on('error', fail)
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`${bin} завершился с кодом ${code}`))))
  })
  const copied = options.stdout ? pipeline(child.stdout!, options.stdout) : Promise.resolve()
  try { await Promise.all([completed, copied]) } catch (error) {
    child.kill()
    options.stdout?.destroy()
    await Promise.allSettled([completed, copied])
    throw error
  }
}

/** Копия целиком, в собственном формате Postgres: из него можно достать часть. */
export async function create(snapshot?: string): Promise<string> {
  const runner = await chooseRunner()
  mkdirSync(BACKUP_DIR, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(BACKUP_DIR, `${SOURCE_DB}-${stamp}.dump`)

  /*
   * `--no-owner` и `--no-privileges`: копию разворачивают под другой учётной
   * записью — на другой машине, в другой базе, иногда в аварийной спешке.
   * Привязка к владельцу из рабочей базы в такой момент только мешает.
   */
  const [bin, args] = command(runner, 'pg_dump', [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--dbname',
    runner.url.toString(),
    ...(snapshot ? ['--snapshot', snapshot] : []),
  ])

  console.log(`Снимаю копию базы «${SOURCE_DB}» (${runner.kind === 'docker' ? 'через контейнер' : 'локально'})…`)
  let opened = false
  const output = createWriteStream(file, { flags: 'wx' })
  output.once('open', () => { opened = true })
  try { await run(bin, args, { stdout: output }) } catch (error) {
    if (opened) unlinkSync(file)
    throw error
  }

  const size = statSync(file).size
  if (size === 0) {
    unlinkSync(file)
    throw new Error('Копия вышла пустой — это отказ, а не копия.')
  }
  console.log(`Готово: ${file} (${mb(size)})`)
  console.log('Копия не проверена, пока её не развернули. Как это сделать — ниже.')
  console.log(`  pnpm db:backup restore "${file}" ${SOURCE_DB}_check`)
  return file
}

function mb(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

function list(): void {
  if (!existsSync(BACKUP_DIR)) {
    console.log('Копий ещё нет. Снять: pnpm db:backup')
    return
  }
  const files = readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.dump'))
    .map((name) => ({ name, stat: statSync(join(BACKUP_DIR, name)) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)

  if (files.length === 0) {
    console.log('Копий ещё нет. Снять: pnpm db:backup')
    return
  }
  console.log(`Копии в ${BACKUP_DIR}:`)
  for (const file of files) {
    console.log(`  ${file.name}  ${mb(file.stat.size)}  ${file.stat.mtime.toLocaleString('ru-RU')}`)
  }
}

/**
 * Развернуть копию в отдельную базу.
 *
 * Имя цели обязательно и не может совпасть с рабочей базой. Существующая
 * целевая база не удаляется: CREATE отказывает до восстановления.
 * Восстановление выполняется одной транзакцией.
 */
export async function restore(file: string, target: string, onCreated?: () => void): Promise<void> {
  if (!existsSync(file)) {
    throw new Error(`Файла нет: ${file}`)
  }
  if (!target) {
    throw new Error('Не указано имя базы, в которую разворачивать.')
  }
  if (target === SOURCE_DB) {
    throw new Error(
      `«${target}» — это рабочая база. Разворачивать поверх неё этим скриптом нельзя:\n` +
        'возьмите другое имя, проверьте копию и переключайте приложение осознанно.',
    )
  }
  if (!/^[a-z_][a-z0-9_]*$/i.test(target)) {
    throw new Error('Имя базы: латиница, цифры и подчёркивание, начиная с буквы.')
  }

  const runner = await chooseRunner()
  const admin = new URL(runner.url.toString())
  admin.pathname = '/postgres'
  const into = new URL(runner.url.toString())
  into.pathname = `/${target}`

  console.log(`Создаю базу «${target}»…`)
  // CREATE refuses an existing target. Never delete an unknown database.
  const [psql, createArgs] = command(runner, 'psql', [
    '--dbname',
    admin.toString(),
    '--quiet',
    '--command',
    `create database "${target}"`,
  ])
  await run(psql, createArgs)
  onCreated?.()

  console.log('Разворачиваю копию…')
  const [restoreBin, restoreArgs] = command(runner, 'pg_restore', [
    '--dbname',
    into.toString(),
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    '--single-transaction',
  ])

  // Файл лежит на машине, а инструмент может работать в контейнере: отдаём
  // копию потоком, чтобы не копировать её внутрь.
  await pipeInto(restoreBin, restoreArgs, file)

  console.log(`Развёрнуто в «${target}».`)
  console.log('Проверьте содержимое и удалите базу, когда она больше не нужна:')
  console.log(`  psql -c 'drop database "${target}"'`)
}

async function pipeInto(bin: string, args: string[], file: string): Promise<void> {
  const child = spawn(bin, args, { stdio: ['pipe', 'inherit', 'inherit'] })
  const completed = new Promise<void>((done, fail) => {
    child.on('error', fail)
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`${bin} завершился с кодом ${code}`))))
  })
  const copied = pipeline(createReadStream(file), child.stdin!)
  try { await Promise.all([completed, copied]) } catch (error) {
    child.kill()
    child.stdin?.destroy()
    await Promise.allSettled([completed, copied])
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action = 'create', ...rest] = process.argv.slice(2)
  if (action === 'create') await create()
  else if (action === 'list') list()
  else if (action === 'restore') await restore(rest[0] ?? '', rest[1] ?? '')
  else {
    console.error(`Не знаю действия «${action}». Есть: create, list, restore.`)
    process.exitCode = 1
  }
}
