'use client'

import { compile, computeRow, type Compiled } from '@tableapp/formula'
import type { Field } from '@tableapp/schema'
import { newId, parseCellValue, positionBetween } from '@tableapp/schema'
import { useCallback, useMemo, useReducer } from 'react'

export type TableRow = {
  /** Present on server snapshots; optimistic rows have no acknowledged version yet. */
  version?: number
  id: string
  position: string
  data: Record<string, unknown>
}

export type TableState = {
  id: string
  name: string
  fields: Field[]
  rows: TableRow[]
}

type Action =
  | { type: 'reset'; state: TableState }
  | { type: 'set_cell'; rowId: string; fieldId: string; value: unknown }
  | { type: 'add_row'; afterRowId?: string; rowId?: string }
  | { type: 'delete_row'; rowId: string }
  | { type: 'rename_field'; fieldId: string; name: string }

/** Формулы таблицы, скомпилированные один раз на изменение набора полей. */
function compileFormulas(fields: readonly Field[]): Map<string, Compiled> {
  const compiled = new Map<string, Compiled>()
  for (const field of fields) {
    if (field.type !== 'formula') continue
    const expression = field.options.expression
    if (!expression.trim()) continue
    try {
      compiled.set(field.id, compile(expression, fields))
    } catch {
      // Сломанная формула не должна мешать редактировать остальные колонки.
    }
  }
  return compiled
}

function recalculate(row: TableRow, compiled: Map<string, Compiled>): TableRow {
  if (compiled.size === 0) return row
  return { ...row, data: computeRow(row.data, compiled) }
}

function emptyRowData(fields: readonly Field[]): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.type === 'checkbox') data[field.id] = false
  }
  return data
}

function reducer(state: TableState, action: Action): TableState {
  switch (action.type) {
    // Состав полей меняет производные значения всех строк: локальное состояние
    // после такой правки восстановить нельзя, его заменяют данными с сервера.
    case 'reset':
      return action.state

    case 'set_cell': {
      const field = state.fields.find((f) => f.id === action.fieldId)
      if (!field) return state

      let value: unknown
      try {
        value = parseCellValue(field, action.value)
      } catch {
        // Значение, не подходящее типу, не записывается — ячейка остаётся прежней.
        return state
      }

      const compiled = compileFormulas(state.fields)
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.id === action.rowId
            ? recalculate({ ...row, data: { ...row.data, [action.fieldId]: value } }, compiled)
            : row,
        ),
      }
    }

    case 'add_row': {
      if(action.rowId&&state.rows.some(row=>row.id===action.rowId))return state
      const index = action.afterRowId
        ? state.rows.findIndex((row) => row.id === action.afterRowId)
        : state.rows.length - 1
      const before = state.rows[index]?.position ?? null
      const after = state.rows[index + 1]?.position ?? null
      const row: TableRow = {
        id: action.rowId ?? newId('row'),
        position: positionBetween(before, after),
        data: emptyRowData(state.fields),
      }
      const rows = [...state.rows]
      rows.splice(index + 1, 0, recalculate(row, compileFormulas(state.fields)))
      return { ...state, rows }
    }

    case 'delete_row':
      return { ...state, rows: state.rows.filter((row) => row.id !== action.rowId) }

    case 'rename_field':
      return {
        ...state,
        fields: state.fields.map((field) =>
          field.id === action.fieldId ? ({ ...field, name: action.name } as Field) : field,
        ),
      }

    default:
      return state
  }
}

export function useTable(initial: TableState) {
  const [state, dispatch] = useReducer(reducer, initial)

  const setCell = useCallback(
    (rowId: string, fieldId: string, value: unknown) =>
      dispatch({ type: 'set_cell', rowId, fieldId, value }),
    [],
  )
  const addRow = useCallback(
    (afterRowId?: string, rowId?: string) => dispatch({ type: 'add_row', afterRowId, rowId }),
    [],
  )
  const deleteRow = useCallback((rowId: string) => dispatch({ type: 'delete_row', rowId }), [])
  const renameField = useCallback(
    (fieldId: string, name: string) => dispatch({ type: 'rename_field', fieldId, name }),
    [],
  )
  const reset = useCallback((next: TableState) => dispatch({ type: 'reset', state: next }), [])

  const fieldIndex = useMemo(() => new Map(state.fields.map((f) => [f.id, f])), [state.fields])

  return { table: state, fieldIndex, setCell, addRow, deleteRow, renameField, reset }
}
