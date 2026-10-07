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
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const RAW_URL = process.env.DATABASE_URL
if (!RAW_URL) {
  console.error('DATABASE_URL не задан: без него неизвестно, с какой базы снимать копию.')
  process.exit(1)
}

const SOURCE = new URL(RAW_URL)
const SOURCE_DB = SOURCE.pathname.replace(/^\//, '')
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
  if (await works('pg_dump', ['--version'])) return { kind: 'local', url: SOURCE }

  if (await works('docker', ['exec', CONTAINER, 'pg_dump', '--version'])) {
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
function run(bin: string, args: string[], options: { stdout?: NodeJS.WritableStream } = {}): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(bin, args, {
      stdio: [options.stdout ? 'ignore' : 'inherit', options.stdout ? 'pipe' : 'inherit', 'inherit'],
    })
    if (options.stdout && child.stdout) child.stdout.pipe(options.stdout)
    child.on('error', fail)
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`${bin} завершился с кодом ${code}`))))
  })
}

/** Копия целиком, в собственном формате Postgres: из него можно достать часть. */
async function create(): Promise<void> {
  const runner = await chooseRunner()
  mkdirSync(BACKUP_DIR, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
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
  ])

  console.log(`Снимаю копию базы «${SOURCE_DB}» (${runner.kind === 'docker' ? 'через контейнер' : 'локально'})…`)
  await run(bin, args, { stdout: createWriteStream(file) })

  const size = statSync(file).size
  if (size === 0) {
    console.error('Копия вышла пустой — это отказ, а не копия.')
    process.exit(1)
  }
  console.log(`Готово: ${file} (${mb(size)})`)
  console.log('Копия не проверена, пока её не развернули. Как это сделать — ниже.')
  console.log(`  pnpm db:backup restore "${file}" ${SOURCE_DB}_check`)
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
 * Имя цели обязательно и не может совпасть с рабочей базой. Это единственная
 * защита, которая здесь нужна: всё остальное — чужие данные, которые скрипт
 * не трогает.
 */
async function restore(file: string, target: string): Promise<void> {
  if (!existsSync(file)) {
    console.error(`Файла нет: ${file}`)
    process.exit(1)
  }
  if (!target) {
    console.error('Не указано имя базы, в которую разворачивать.')
    process.exit(1)
  }
  if (target === SOURCE_DB) {
    console.error(
      `«${target}» — это рабочая база. Разворачивать поверх неё этим скриптом нельзя:\n` +
        'возьмите другое имя, проверьте копию и переключайте приложение осознанно.',
    )
    process.exit(1)
  }
  if (!/^[a-z_][a-z0-9_]*$/i.test(target)) {
    console.error('Имя базы: латиница, цифры и подчёркивание, начиная с буквы.')
    process.exit(1)
  }

  const runner = await chooseRunner()
  const admin = new URL(runner.url.toString())
  admin.pathname = '/postgres'
  const into = new URL(runner.url.toString())
  into.pathname = `/${target}`

  console.log(`Создаю базу «${target}»…`)
  const [psql, dropArgs] = command(runner, 'psql', [
    '--dbname',
    admin.toString(),
    '--quiet',
    '--command',
    `drop database if exists "${target}"`,
  ])
  await run(psql, dropArgs)

  const [, createArgs] = command(runner, 'psql', [
    '--dbname',
    admin.toString(),
    '--quiet',
    '--command',
    `create database "${target}"`,
  ])
  await run(psql, createArgs)

  console.log('Разворачиваю копию…')
  const [restoreBin, restoreArgs] = command(runner, 'pg_restore', [
    '--dbname',
    into.toString(),
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
  ])

  // Файл лежит на машине, а инструмент может работать в контейнере: отдаём
  // копию потоком, чтобы не копировать её внутрь.
  await pipeInto(restoreBin, restoreArgs, file)

  console.log(`Развёрнуто в «${target}».`)
  console.log('Проверьте содержимое и удалите базу, когда она больше не нужна:')
  console.log(`  psql -c 'drop database "${target}"'`)
}

function pipeInto(bin: string, args: string[], file: string): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'inherit', 'inherit'] })
    child.on('error', fail)
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`${bin} завершился с кодом ${code}`))))
    createReadStream(file).pipe(child.stdin!)
  })
}

const [action = 'create', ...rest] = process.argv.slice(2)

if (action === 'create') await create()
else if (action === 'list') list()
else if (action === 'restore') await restore(rest[0] ?? '', rest[1] ?? '')
else {
  console.error(`Не знаю действия «${action}». Есть: create, list, restore.`)
  process.exit(1)
}
