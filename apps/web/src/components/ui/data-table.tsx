import type { ReactNode } from 'react'
import css from './ui.module.css'

export function DataTable({
  columns, rows, caption,
}: {
  caption?: string
  columns: { key: string; label: string; numeric?: boolean }[]
  rows: Record<string, ReactNode>[]
}) {
  return (
    <div className={css.tableWrap}>
      <table className={css.table}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td key={column.key} className={column.numeric ? css.num : undefined}>{row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
