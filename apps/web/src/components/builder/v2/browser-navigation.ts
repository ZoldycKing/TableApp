'use client'
import {appV2NavigationUrl} from '@tableapp/schema/app-v2'

/** Validate again at the browser boundary, including for old persisted receipts. */
export function openBuilderV2Url(value:string){
  const url=appV2NavigationUrl(value)
  if(!url||url.length>4096)throw new Error('Ссылка недоступна. Проверьте адрес страницы.')
  window.location.assign(url)
}
