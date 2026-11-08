/** UI entry only: the table page and its actions still enforce permissions. */
export function tableWorkLink(tableId: string, canEdit: boolean): string {
  return `/t/${encodeURIComponent(tableId)}${canEdit ? '' : '?readonly=1'}`
}
