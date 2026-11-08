'use client'
import { useEffect, useRef, useState } from 'react'
import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import { readBuilderV2DataAction } from '@/app/builder-v2-data-actions'
import { builderV2DataKey, type BuilderV2ReadScope, type BuilderV2DataPage,type BuilderV2DataRequest } from '@/lib/builder-v2-data-types'
import {usePublishedV2} from './published-context'

type State = { key: string; page?: BuilderV2DataPage; loading: boolean; error: string; stale: boolean;errorColumn?:string }
export function useBuilderV2NodeData(app: AppV2, node: AppV2Node, enabled: boolean, search: string, scope?: BuilderV2ReadScope,query:Pick<BuilderV2DataRequest,'calendarMonth'|'calendarDay'>={}) {
  const published=usePublishedV2()
  const config = builderV2DataKey(app, node, scope), key = `${config}\n${search}\n${published?.revision??''}:${published?.dataVersion??0}\n${JSON.stringify(query)}`
  const [state, setState] = useState<State>({ key: '', loading: true, error: '', stale: false }), [refresh, setRefresh] = useState(0)
  const generation = useRef(0), current = useRef({ app, node, key, scope,query }); current.current = { app, node, key, scope,query }
  useEffect(() => {
    const version = ++generation.current
    if (!enabled) return
    setState({ key, loading: true, error: '', stale: false })
    const timer = setTimeout(async () => {
      try {
        const snapshot = current.current
        const request={ ...snapshot.scope,...snapshot.query, nodeId: snapshot.node.id, search },result = published?await published.readData(request):await readBuilderV2DataAction(snapshot.app.id, snapshot.app, request)
        if (version !== generation.current) return
        setState(result.ok ? { key, page: result.page, loading: false, error: '', stale: false } : { key, loading: false, error: result.error, stale: Boolean(result.stale) })
      } catch { if (version === generation.current) setState({ key, loading: false, error: 'Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.', stale: false }) }
    }, search.trim() ? 300 : 0)
    return () => { clearTimeout(timer); generation.current++ }
  }, [key, enabled, refresh, search])
  const visible: State = state.key === key ? state : { key, loading: true, error: '', stale: false }
  const busy=useRef(false)
  const loadMore = async (column?:string) => {
    const cursor=column?state.page?.board?.columns.find(item=>item.key===column)?.next:state.page?.next
    if (!enabled || state.key !== key || state.loading || !cursor || state.stale||busy.current) return
    busy.current=true
    const version = ++generation.current, previous = state.page!
    setState({ ...state, loading: true, error: '' })
    try {
      const snapshot = current.current
      const request={ ...snapshot.scope,...snapshot.query, nodeId: snapshot.node.id, search, cursor,...(column?{boardColumn:column}:{}) },result = published?await published.readData(request):await readBuilderV2DataAction(snapshot.app.id, snapshot.app, request)
      if (generation.current !== version || current.current.key !== key) return
      if(result.ok){
        const columns=previous.board&&result.page.board?previous.board.columns.map(old=>{const next=result.page.board!.columns.find(item=>item.key===old.key);return next?{...next,rows:[...old.rows,...next.rows.filter(row=>!old.rows.some(item=>item.id===row.id))]}:old}):undefined
        const page=columns?{...previous,rows:columns.flatMap(column=>column.rows),board:{columns}}:{...result.page,rows:[...previous.rows,...result.page.rows.filter(row=>!previous.rows.some(item=>item.id===row.id))]}
        setState({key,page,loading:false,error:'',stale:false})
      }else setState({key,page:previous,loading:false,error:result.error,stale:Boolean(result.stale),errorColumn:column})
    } catch { if (generation.current === version && current.current.key === key) setState({ key, page: previous, loading: false, error: 'Не удалось загрузить следующую страницу. Попробуйте ещё раз.', stale: false,errorColumn:column }) }finally{busy.current=false}
  }
  return { ...visible, loadMore, reload: () => {if(published&&visible.stale)published.refresh();else setRefresh(value => value + 1)} }
}
