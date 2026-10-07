'use client'

import { useState, useTransition } from 'react'
import {
  disableTotpAction,
  enableTotpAction,
  revokeOtherSessionsAction,
  startTotpSetupAction,
  type TotpSetup,
} from '@/app/security-actions'

export type DeviceRow = {
  id: string
  userAgent: string | null
  ip: string | null
  createdAt: string
  kind: 'member' | 'staff'
}

export type LogRow = {
  id: string
  kind: string
  circuit: string
  ip: string | null
  createdAt: string
}

/** Человеческие названия событий: журнал читают не разработчики. */
const EVENT_LABELS: Record<string, string> = {
  code_sent: 'Отправлен код для входа',
  code_failed: 'Неверный код из письма',
  signed_in: 'Вход выполнен',
  signed_out: 'Выход',
  revoked: 'Завершены сеансы на других устройствах',
  totp_on: 'Включён второй фактор',
  totp_off: 'Выключен второй фактор',
  totp_failed: 'Неверный код второго фактора',
  totp_settings_failed: 'Неверный код при настройке второго фактора',
  recovery_used: 'Использован резервный код',
}

/** Браузер и система из user-agent: полная строка человеку ничего не говорит. */
function deviceName(agent: string | null): string {
  if (!agent) return 'Неизвестное устройство'
  const browser =
    /YaBrowser/.test(agent) ? 'Яндекс Браузер'
    : /Edg\//.test(agent) ? 'Edge'
    : /Firefox/.test(agent) ? 'Firefox'
    : /Chrome/.test(agent) ? 'Chrome'
    : /Safari/.test(agent) ? 'Safari'
    : 'Браузер'
  const system =
    /Android/.test(agent) ? 'Android'
    : /iPhone|iPad/.test(agent) ? 'iOS'
    : /Mac OS/.test(agent) ? 'macOS'
    : /Windows/.test(agent) ? 'Windows'
    : /Linux/.test(agent) ? 'Linux'
    : ''
  return system ? `${browser} · ${system}` : browser
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

export function SecurityPanel({
  currentSessionId,
  totpEnabled,
  recoveryLeft,
  devices,
  staffDevices,
  log,
}: {
  currentSessionId: string | null
  totpEnabled: boolean
  recoveryLeft: number
  devices: DeviceRow[]
  staffDevices: DeviceRow[]
  log: LogRow[]
}) {
  const [pending, startTransition] = useTransition()
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const all = [...devices, ...staffDevices]

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-5 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Безопасность</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Где открыт вход, что происходило с вашей почтой и второй фактор.
        </p>
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">Устройства</h2>
          <button
            type="button"
            disabled={pending || all.length <= 1}
            onClick={() =>
              startTransition(async () => {
                const result = await revokeOtherSessionsAction()
                setNotice(`Завершено сеансов: ${result.closed}`)
              })
            }
            className="rounded-lg border border-sand-300 px-3 py-1.5 text-sm transition-colors hover:bg-sand-100 disabled:opacity-40"
          >
            Выйти на других устройствах
          </button>
        </div>

        {notice ? <p className="mt-3 text-sm text-sage-700">{notice}</p> : null}

        <ul className="mt-4 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
          {all.map((device) => (
            <li key={device.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {deviceName(device.userAgent)}
                  {device.id === currentSessionId ? (
                    <span className="ml-2 rounded-full bg-sage-100 px-2 py-0.5 text-[11px] text-sage-700">
                      это устройство
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--color-ink-muted)]">
                  {device.kind === 'staff' ? 'Вход в приложения · ' : ''}
                  {device.ip ?? 'адрес неизвестен'} · с {when(device.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Второй фактор</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Код из приложения-аутентификатора в дополнение к письму. Нужен только
          для входа в рабочее пространство — сотрудникам в приложениях он
          не потребуется.
        </p>

        {recovery ? (
          <div className="mt-4 rounded-xl border border-sage-300 bg-sage-50 p-4">
            <p className="text-sm font-medium">Резервные коды</p>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              Показываются один раз. Сохраните их: каждый срабатывает однократно
              и пускает, если телефон потерян.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm">
              {recovery.map((item) => (
                <li key={item} className="rounded bg-white px-2 py-1 text-center">{item}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setRecovery(null)}
              className="mt-3 text-sm underline"
            >
              Я сохранил коды
            </button>
          </div>
        ) : totpEnabled ? (
          <div className="mt-4 space-y-3 rounded-xl border border-sand-200 bg-white p-4">
            <p className="text-sm">
              Включён. Резервных кодов осталось: <strong>{recoveryLeft}</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Код из приложения"
                className="w-44 rounded-lg border border-sand-300 px-3 py-2 text-sm outline-none focus:border-sage-400"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null)
                    const result = await disableTotpAction(code)
                    if (result.ok) {
                      setCode('')
                      setNotice('Второй фактор выключен')
                    } else setError(result.error ?? 'Не удалось выключить')
                  })
                }
                className="rounded-lg border border-sand-300 px-3 py-2 text-sm transition-colors hover:bg-sand-100 disabled:opacity-40"
              >
                Выключить
              </button>
            </div>
          </div>
        ) : setup ? (
          <div className="mt-4 space-y-3 rounded-xl border border-sand-200 bg-white p-4">
            <p className="text-sm">
              Отсканируйте код в приложении-аутентификаторе и введите шесть цифр,
              которые оно покажет.
            </p>
            {/* Картинка приходит как data:URI из серверного действия. */}
            <img src={setup.qr} alt="QR-код для приложения-аутентификатора" className="rounded-lg" />
            <p className="break-all font-mono text-xs text-[var(--color-ink-muted)]">
              Или введите ключ вручную: {setup.secret}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
                className="w-40 rounded-lg border border-sand-300 px-3 py-2 text-center font-mono text-sm tracking-[0.2em] outline-none focus:border-sage-400"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null)
                    const result = await enableTotpAction(setup.secret, code)
                    if (result.ok) {
                      setRecovery(result.recovery)
                      setSetup(null)
                      setCode('')
                    } else setError(result.error)
                  })
                }
                className="rounded-lg bg-ink px-3 py-2 text-sm text-sand-50 transition-colors hover:bg-ink/90 disabled:opacity-40"
              >
                Включить
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                setSetup(await startTotpSetupAction())
              })
            }
            className="mt-4 rounded-lg border border-sand-300 px-3 py-2 text-sm transition-colors hover:bg-sand-100 disabled:opacity-40"
          >
            Настроить второй фактор
          </button>
        )}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Журнал входов</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Последние тридцать событий по вашей почте, включая неудачные попытки.
        </p>

        {log.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-ink-muted)]">Пока пусто.</p>
        ) : (
          <ul className="mt-4 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
            {log.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="min-w-0 truncate">
                  {EVENT_LABELS[row.kind] ?? row.kind}
                  {row.circuit === 'staff' ? (
                    <span className="ml-2 text-xs text-[var(--color-ink-muted)]">в приложении</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--color-ink-muted)]">
                  {row.ip ?? '—'} · {when(row.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
