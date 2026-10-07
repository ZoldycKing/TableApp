'use client'

import { buildFromRows, parseCsv, type ImportPreview, type SheetInfo } from '@tableapp/import'
import { isComputed, newId, type Field, type FieldType } from '@tableapp/schema'
import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import {
  importSheetAction,
  inspectWorkbookAction,
  quotaAction,
  readSheetsAction,
  type Quota,
} from '@/app/import-actions'
import {
  blocked,
  blockerText,
  byFieldId,
  columnsWord,
  defaultSelection,
  guessMapping,
  importLabel,
  isImportable,
  planIssues,
  rowsWord,
  sheetsWord,
  tooBig,
  uniqueName,
  type PlanIssue,
  type SheetPlan,
  type SheetSetup,
} from '@/lib/import-plan'
import {
  Destination,
  PREVIEW_LIMIT,
  PreviewTable,
  Results,
  SheetPicker,
  SheetTabs,
  Summary,
} from './parts'

/**
 * Импорт файла.
 *
 * Книга Excel — это почти всегда несколько листов, и раньше импорт брал
 * первый, а про остальные говорил строчкой мелким шрифтом. Теперь книга
 * проходит три шага: посмотреть, что внутри; выбрать листы и настроить
 * каждый; подтвердить и увидеть, что получилось по каждому листу отдельно.
 *
 * Файл живёт здесь, в браузере: на сервер он уходит дважды — на осмотр
 * и на чтение выбранных листов, — но нигде не сохраняется. Поэтому «дочитать
 * оставшиеся листы» работает, пока открыт этот экран, и перестаёт работать
 * после перезагрузки страницы: честнее так, чем держать чужие книги у себя.
 *
 * Ключ запуска (`runId`) заводится на файл. Он и защищает от второго комплекта
 * строк: сервер помнит, какие листы этим запуском уже записаны.
 */

export type ImportTarget = { id: string; name: string; fields: Field[] }

const CSV_SHEET = (fileName: string) => fileName.replace(/\.[^.]+$/, '') || 'Файл'

function writableFields(table: ImportTarget | undefined): Field[] {
  return table ? table.fields.filter((field) => !isComputed(field.type)) : []
}

export function ImportScreen({ tables = [], target }: { tables?: ImportTarget[]; target?: ImportTarget }) {
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<'file' | 'sheets' | 'plan' | 'result'>('file')
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [setups, setSetups] = useState<SheetSetup[]>([])
  const [active, setActive] = useState<string>('')
  const [quota, setQuota] = useState<Quota | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, startBusy] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const runId = useRef<string>(newId('run'))

  const tableById = useMemo(() => new Map(tables.map((table) => [table.id, table])), [tables])
  const setup = setups.find((item) => item.name === active) ?? setups[0] ?? null

  /** Предпросмотр считаем только для открытого листа: их бывает пять. */
  const preview: ImportPreview | null = useMemo(() => {
    if (!setup) return null
    try {
      return buildFromRows(setup.grid, {
        typeOverrides: setup.typeOverrides,
        nameOverrides: setup.nameOverrides,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось разобрать лист')
      return null
    }
    // Сопоставление в зависимостях не участвует намеренно: разбор от него
    // не меняется, а лишний пересчёт на файле в двадцать тысяч строк заметен.
  }, [setup?.name, setup?.grid, setup?.typeOverrides, setup?.nameOverrides])

  const reset = () => {
    setFile(null)
    setStage('file')
    setSheets([])
    setSelected([])
    setSetups([])
    setActive('')
    setError(null)
    runId.current = newId('run')
    if (inputRef.current) inputRef.current.value = ''
  }

  /** Заготовка настроек листа: куда положить и как назвать. */
  const makeSetup = useCallback(
    (name: string, grid: string[][], info: SheetInfo, taken: string[], firstFree: boolean): SheetSetup => {
      const base: SheetSetup = {
        name,
        grid,
        info,
        typeOverrides: {},
        nameOverrides: {},
        destination: { kind: 'new', name: uniqueName(name, taken) },
        mapping: {},
        outcome: null,
      }

      // Пришли со страницы таблицы: первый лист по умолчанию идёт в неё.
      if (target && firstFree) {
        const built = buildFromRows(grid)
        return {
          ...base,
          destination: { kind: 'existing', tableId: target.id },
          mapping: guessMapping(built, writableFields(target)),
        }
      }
      return base
    },
    [target],
  )

  const readFile = useCallback(
    async (chosen: File) => {
      setError(null)
      reset()
      setFile(chosen)


      // Старый формат .xls — это не zip с XML, а бинарник совсем другого
      // устройства. Сказать об этом честно полезнее, чем выдать ошибку разбора.
      if (/\.xls$/i.test(chosen.name)) {
        setError('Формат .xls не читается. Сохраните файл как .xlsx или CSV.')
        setFile(null)
        return
      }

      /*
       * Размер проверяем здесь, до отправки: запрос с книгой на двадцать
       * мегабайт обрывается на транспорте, и человек видит пустой экран
       * вместо объяснения. Сервер проверяет то же самое ещё раз.
       */
      const big = tooBig(chosen.size)
      if (big) {
        setError(big)
        setFile(null)
        return
      }

      if (/\.(xlsx|xlsm)$/i.test(chosen.name)) {
        const form = new FormData()
        form.set('file', chosen)
        const result = await inspectWorkbookAction(form)
        if (!result.ok) {
          setError(result.error)
          setFile(null)
          return
        }
        setSheets(result.sheets)
        setQuota(result.quota)
        setSelected(defaultSelection(result.sheets))
        setStage('sheets')
        return
      }

      // CSV разбирается в браузере: лист один, выбирать нечего.
      try {
        const grid = parseCsv(new Uint8Array(await chosen.arrayBuffer()))
        if (grid.length === 0) {
          setError('Файл пуст или не содержит распознаваемых строк')
          setFile(null)
          return
        }
        const built = buildFromRows(grid)
        if (built.rows.length === 0) {
          setError('В файле нет строк данных')
          setFile(null)
          return
        }
        const name = CSV_SHEET(chosen.name)
        const info: SheetInfo = {
          name,
          hidden: false,
          rows: built.rows.length,
          columns: built.fields.length,
          header: built.fields.map((field) => field.name),
          blockers: [],
          notes: [],
        }
        setQuota(await quotaAction())
        setSetups([makeSetup(name, grid, info, [], true)])
        setActive(name)
        setStage('plan')
      } catch (cause) {
        /*
         * Сюда приходит и разбор CSV, и обрыв запроса к серверу. Без этого
         * обрыв уходил в необработанное отклонение промиса: в консоли ошибка,
         * на экране — ничего.
         */
        setError(
          cause instanceof Error && cause.message
            ? `Не удалось прочитать файл: ${cause.message}`
            : 'Не удалось прочитать файл',
        )
        setFile(null)
      }
    },
    [makeSetup],
  )

  /** Загрузить строки выбранных листов и перейти к настройке. */
  const loadSelected = () => {
    if (!file || selected.length === 0) return
    startBusy(async () => {
      const form = new FormData()
      form.set('file', file)
      form.set('sheets', JSON.stringify(selected))

      let result: Awaited<ReturnType<typeof readSheetsAction>>
      try {
        result = await readSheetsAction(form)
      } catch (cause) {
        setError(
          cause instanceof Error && cause.message
            ? `Не удалось прочитать листы: ${cause.message}`
            : 'Не удалось прочитать листы',
        )
        return
      }

      if (!result.ok) {
        setError(result.error)
        return
      }
      setQuota(result.quota)

      const rejected: string[] = []
      setSetups((previous) => {
        const kept = previous.filter((item) => item.outcome !== null)
        const taken = kept.map((item) => (item.destination.kind === 'new' ? item.destination.name : ''))
        const next = [...kept]

        for (const sheet of result.sheets) {
          if (sheet.info.blockers.length > 0 || sheet.grid.length === 0) {
            rejected.push(`${sheet.name}: ${sheet.info.blockers.map(blockerText).join('; ')}`)
            continue
          }
          // Лист, у которого уже есть итог, второй раз в список не попадает:
          // его судьба решена, и настраивать его заново не нужно.
          if (next.some((item) => item.name === sheet.name)) continue
          const already = previous.find((item) => item.name === sheet.name && item.outcome === null)
          if (already) {
            next.push(already)
            taken.push(already.destination.kind === 'new' ? already.destination.name : '')
            continue
          }
          const free = target ? !next.some((item) => item.destination.kind === 'existing' && item.destination.tableId === target.id) : false
          const made = makeSetup(sheet.name, sheet.grid, sheet.info, taken, free)
          taken.push(made.destination.kind === 'new' ? made.destination.name : '')
          next.push(made)
        }
        return next
      })

      setError(rejected.length > 0 ? `Эти листы импортировать нельзя — ${rejected.join(' · ')}` : null)
      setActive(selected[0] ?? '')
      setStage('plan')
    })
  }

  const patch = (name: string, change: Partial<SheetSetup>) => {
    setSetups((previous) => previous.map((item) => (item.name === name ? { ...item, ...change } : item)))
  }

  const chooseTable = (tableId: string | null) => {
    if (!setup || !preview) return
    if (tableId === null) {
      const taken = setups
        .filter((item) => item.name !== setup.name && item.destination.kind === 'new')
        .map((item) => (item.destination.kind === 'new' ? item.destination.name : ''))
      patch(setup.name, { destination: { kind: 'new', name: uniqueName(setup.name, taken) }, mapping: {} })
      return
    }
    patch(setup.name, {
      destination: { kind: 'existing', tableId },
      mapping: guessMapping(preview, writableFields(tableById.get(tableId))),
    })
  }

  /** Одно поле таблицы принимает только одну колонку файла. */
  const chooseTarget = (column: number, targetId: string) => {
    if (!setup) return
    const next: Record<number, string> = {}
    for (const [source, field] of Object.entries(setup.mapping)) {
      if (Number(source) !== column && field !== targetId) next[Number(source)] = field
    }
    if (targetId !== '') next[column] = targetId
    patch(setup.name, { mapping: next })
  }

  const pending = setups.filter((item) => item.outcome === null || item.outcome.status === 'failed')

  const plans: SheetPlan[] = pending.map((item) => ({
    sheet: item.name,
    rows: item.info.rows,
    destination:
      item.destination.kind === 'new'
        ? { kind: 'new', name: item.destination.name }
        : {
            kind: 'existing',
            tableId: item.destination.tableId,
            tableName: tableById.get(item.destination.tableId)?.name ?? 'таблица',
            mapped: Object.keys(item.mapping).length,
          },
  }))

  const issues: PlanIssue[] = planIssues(plans, {
    rowsLeft: quota?.rowsLeft ?? null,
    tablesLeft: quota?.tablesLeft ?? null,
    existingTables: tables.map((table) => table.name),
  })

  const lines = plans.map((plan) =>
    plan.destination.kind === 'new'
      ? `«${plan.sheet}» → новая таблица «${plan.destination.name}», ${plan.rows} ${rowsWord(plan.rows)}`
      : `«${plan.sheet}» → таблица «${plan.destination.tableName}», ${plan.rows} ${rowsWord(plan.rows)}`,
  )

  /**
   * Запуск.
   *
   * Листы идут по одному и каждый — сам по себе: свой ответ, своя ошибка,
   * свой повтор. Уже записанные пропускаются, поэтому «повторить неудавшиеся»
   * не трогает удавшиеся, а сервер по ключу запуска не пустит второй комплект
   * строк, даже если ответ до нас не дошёл.
   */
  const run = (only?: readonly string[]) => {
    startBusy(async () => {
      for (const item of setups) {
        if (only && !only.includes(item.name)) continue
        if (item.outcome?.status === 'done' || item.outcome?.status === 'repeat') continue

        const built = buildFromRows(item.grid, {
          typeOverrides: item.typeOverrides,
          nameOverrides: item.nameOverrides,
        })

        const result = await importSheetAction({
          runId: runId.current,
          sheet: item.name,
          fields: built.fields,
          rows: built.rows,
          destination:
            item.destination.kind === 'new'
              ? { kind: 'new', name: item.destination.name }
              : {
                  kind: 'existing',
                  tableId: item.destination.tableId,
                  mapping: byFieldId(item.mapping, built),
                },
        })

        patch(
          item.name,
          result.ok
            ? {
                outcome: {
                  status: result.repeat ? 'repeat' : 'done',
                  tableId: result.tableId,
                  added: result.added,
                  text: result.repeat
                    ? `уже импортирован в этом запуске: таблица «${result.tableName}», ${result.added} ${rowsWord(result.added)}`
                    : `таблица «${result.tableName}»: добавлено ${result.added} ${rowsWord(result.added)}`,
                },
              }
            : { outcome: { status: 'failed', tableId: null, added: 0, text: `не импортирован — ${result.error}` } },
        )
      }
      setStage('result')
      setQuota(await quotaAction())
    })
  }

  const targetFields = setup?.destination.kind === 'existing'
    ? writableFields(tableById.get(setup.destination.tableId))
    : []

  const notImported = sheets.filter(
    (sheet) => isImportable(sheet) && !setups.some((item) => item.name === sheet.name && item.outcome !== null),
  ).length

  const noneUsable = sheets.length > 0 && !sheets.some((sheet) => isImportable(sheet))
  const onlyHidden = sheets.length > 0 && !noneUsable && !sheets.some((sheet) => isImportable(sheet) && !sheet.hidden)

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {target ? `Загрузка данных в таблицу «${target.name}»` : 'Импорт таблицы'}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {target
            ? 'Строки из файла добавятся к тем, что уже есть: то, что было в таблице, никуда не денется. Колонки с совпадающими названиями сопоставятся сами, остальные выберите руками.'
            : 'Книга Excel (.xlsx) или CSV. В книге можно выбрать один лист или несколько — каждый станет своей таблицей. У CSV кодировка windows-1251 и точка с запятой определяются сами.'}
        </p>
      </header>

      {stage === 'file' ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const dropped = event.dataTransfer.files[0]
            if (dropped) void readFile(dropped)
          }}
          className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 transition sm:py-20 ${
            dragging
              ? 'border-sage-400 bg-sage-50'
              : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] hover:border-sage-400'
          }`}
        >
          <span className="text-center text-base font-medium">
            {target ? `Перетащите файл с данными для «${target.name}»` : 'Перетащите файл Excel или CSV'}
          </span>
          <span className="mt-1 text-sm text-[var(--color-ink-muted)]">или нажмите, чтобы выбрать</span>
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xlsm,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          if (chosen) void readFile(chosen)
        }}
      />

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">
          {error}
        </p>
      ) : null}

      {stage === 'sheets' ? (
        <section className="mt-2">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg font-medium">
                {sheets.length === 1
                  ? 'В книге один лист'
                  : `В книге ${sheets.length} ${sheetsWord(sheets.length)}. Выберите, какие импортировать`}
              </h2>
              <p className="text-sm text-[var(--color-ink-muted)]">{file?.name}</p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
            >
              Другой файл
            </button>
          </div>

          {noneUsable ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
              Ни один лист этой книги импортировать нельзя — причина указана у каждого. Исправьте
              книгу и загрузите её снова.
            </p>
          ) : null}
          {onlyHidden ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
              Подходящие листы в этой книге только скрытые. Сами они не выбираются: отметьте нужный
              вручную, если это те данные, которые вам нужны.
            </p>
          ) : null}

          <SheetPicker
            sheets={sheets}
            selected={selected}
            onToggle={(name, next) =>
              setSelected((previous) =>
                next ? [...previous, name] : previous.filter((item) => item !== name),
              )
            }
          />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || selected.length === 0}
              onClick={loadSelected}
              className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Читаем…' : selected.length === 0 ? 'Выберите лист' : `Настроить ${selected.length} ${sheetsWord(selected.length)}`}
            </button>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Дальше — предпросмотр и выбор таблицы для каждого листа.
            </p>
          </div>
        </section>
      ) : null}

      {stage === 'plan' && setup && preview ? (
        <section className="mt-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {file?.name}
                <span className="text-[var(--color-ink-muted)]"> · лист «{setup.name}»</span>
              </p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {preview.fields.length} {columnsWord(preview.fields.length)}, {preview.rows.length} {rowsWord(preview.rows.length)}
                {preview.rows.length > PREVIEW_LIMIT ? ` · показаны первые ${PREVIEW_LIMIT}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {sheets.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setStage('sheets')}
                  disabled={busy}
                  className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
                >
                  ← Листы
                </button>
              ) : null}
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
              >
                Другой файл
              </button>
            </div>
          </div>

          <SheetTabs setups={setups} active={setup.name} onSelect={setActive} />

          <Destination
            setup={setup}
            preview={preview}
            tables={tables}
            busy={busy}
            onName={(name) => patch(setup.name, { destination: { kind: 'new', name } })}
            onTable={chooseTable}
          />

          {preview.warnings.length > 0 ? (
            <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {setup.info.notes.length > 0 ? (
            <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {setup.info.notes.map((note) => (
                <li key={note.kind}>В листе есть ошибки вычисления: значения приедут как есть.</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4">
            <PreviewTable
              preview={preview}
              setup={setup}
              targetFields={targetFields}
              busy={busy}
              onName={(index, value) =>
                patch(setup.name, { nameOverrides: { ...setup.nameOverrides, [index]: value } })
              }
              onType={(index, value: FieldType) =>
                patch(setup.name, { typeOverrides: { ...setup.typeOverrides, [index]: value } })
              }
              onMap={chooseTarget}
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <Summary lines={lines} issues={issues} />
            <button
              type="button"
              disabled={busy || plans.length === 0 || blocked(issues)}
              onClick={() => run()}
              className="h-fit w-full rounded-lg bg-ink px-5 py-3 text-sm font-medium text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40 lg:w-auto"
            >
              {busy ? 'Импортируем…' : importLabel(plans.length)}
            </button>
          </div>
        </section>
      ) : null}

      {stage === 'result' ? (
        <Results
          setups={setups}
          busy={busy}
          more={notImported}
          onRetry={() => run(setups.filter((item) => item.outcome?.status === 'failed').map((item) => item.name))}
          onMore={() => {
            setSelected(
              sheets
                .filter(
                  (sheet) =>
                    isImportable(sheet) &&
                    !setups.some((item) => item.name === sheet.name && item.outcome !== null),
                )
                .map((sheet) => sheet.name),
            )
            setStage('sheets')
          }}
        />
      ) : null}
    </main>
  )
}
