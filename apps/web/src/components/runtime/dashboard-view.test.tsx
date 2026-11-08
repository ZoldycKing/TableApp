import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import { templateAppPreview } from '@/lib/templates/app-preview'
import { DashboardView } from './dashboard-view'

it('explains missing values even when the metric has a custom description', () => {
  const {runtime} = templateAppPreview(templateExample('proizvodstvo'),'director')
  const dashboard = runtime.app.screens.find(screen=>screen.type==='dashboard')!
  if(dashboard.type!=='dashboard') throw new Error('Summary required')
  const metric = dashboard.blocks.find(block=>block.type==='metric')!
  const screen = {...dashboard,blocks:[{...metric,description:'Годных единиц по дате выпуска'}]}
  const html = renderToStaticMarkup(<DashboardView screen={screen} runtime={{...runtime,blocks:{[metric.id]:{
    kind:'metric',empty:true,text:'—',delta:null,caption:'Нет данных для расчёта',compared:false,
  }}}} onOpenScreen={vi.fn()} onOpenRow={vi.fn()} />)
  expect(html).toContain('Нет данных для расчёта')
  expect(html).not.toContain('Годных единиц по дате выпуска')
})

it('retains the description for an actual measured zero', () => {
  const {runtime} = templateAppPreview(templateExample('proizvodstvo'),'director')
  const dashboard = runtime.app.screens.find(screen=>screen.type==='dashboard')!
  if(dashboard.type!=='dashboard') throw new Error('Summary required')
  const metric = dashboard.blocks.find(block=>block.type==='metric')!
  const screen = {...dashboard,blocks:[{...metric,description:'Годных единиц по дате выпуска'}]}
  const html = renderToStaticMarkup(<DashboardView screen={screen} runtime={{...runtime,blocks:{[metric.id]:{
    kind:'metric',empty:false,text:'0',delta:null,caption:'за всё время',compared:false,
  }}}} onOpenScreen={vi.fn()} onOpenRow={vi.fn()} />)
  expect(html).toContain('Годных единиц по дате выпуска')
  expect(html).not.toContain('Нет данных для расчёта')
})
