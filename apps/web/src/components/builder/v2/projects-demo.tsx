'use client'
import { useEffect, useState } from 'react'
import { fieldTimeZone, type Field } from '@tableapp/schema'
import { canOpenAppV2Screen, type AppV2, type AppV2Actor, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { templateExample } from '@/lib/templates/presentation'
import { buildProjectsV2App } from '@/lib/templates/projects-v2'
import { projectsPortraitUrl } from '@/lib/templates/projects-portraits'
import { BuilderV2AppFrame, BuilderV2Theme } from './app-frame'
import { AppV2Renderer } from './view'
import { ProjectsRowsContext, type ProjectsOpen, type ProjectsTab } from './projects-screens'

export function projectsTemplateDemoModel(example = templateExample('proekty')) {
  const app = buildProjectsV2App(example.built, { id: example.app.id, workspaceId: example.app.workspaceId, name: 'Проекты и задачи', slug: 'proekty-demo', email: 'marina@example.invalid' })
  const kit = app.projects!
  const tables: BuilderV2Table[] = example.built.tables.map(table => ({
    ...table, views: [], primaryFieldId: table.primaryFieldId,
    fields: example.built.fields.filter(field => field.tableId === table.id).map(field => ({
      id: field.id, name: field.name, type: field.type as Field['type'],
      ...(['date', 'datetime'].includes(field.type) ? { timeZone: fieldTimeZone(field as unknown as Field) } : {}),
      ...(field.type === 'relation' ? { relationTableId: String((field.options as { tableId?: string }).tableId ?? '') } : {}),
      ...(field.options.choices ? { choices: field.options.choices as { id: string; name: string; color?: string }[] } : {}),
    })),
  }))
  const rows = example.rows.map(row => {
    const values = { ...row.data }
    if (row.tableId === kit.peopleTableId) {
      const url = projectsPortraitUrl(values[kit.person.name])
      if (url) values[kit.person.photo] = url
    }
    if (row.tableId === kit.tasksTableId && values[kit.task.title] === 'Макет главной страницы') {
      values[kit.task.files] = [{ id: 'file_maket', name: 'Главная страница.pdf', size: 482331, mime: 'application/pdf', key: 'demo/glavnaya.pdf', width: null, height: null }]
    }
    if (row.tableId === kit.tasksTableId && values[kit.task.title] === 'Эскиз вывески') {
      values[kit.task.files] = [{ id: 'file_sign', name: 'Фасад.jpg', size: 240112, mime: 'image/jpeg', key: 'demo/fasad.jpg', width: null, height: null }]
    }
    return { id: row.id, tableId: row.tableId, values } as AppV2Record
  })
  return { app, tables, rows }
}

const goalFor = (app: AppV2, rows: AppV2Record[], view: string) => {
  const kit = app.projects!
  const task = (title: string) => rows.find(row => row.tableId === kit.tasksTableId && row.values[kit.task.title] === title)
  const project = rows.find(row => row.tableId === kit.projectsTableId && row.values[kit.project.title] === 'Сайт «Северный ветер»')
  if (view === 'mine') return { role: 'staff' as const, screenId: kit.mineScreenId, recordId: undefined, open: null, tab: 'tasks' as const }
  if (view === 'project' || view === 'project-team' || view === 'project-files' || view === 'project-feed') {
    const tab: ProjectsTab = view === 'project-team' ? 'team' : view === 'project-files' ? 'files' : view === 'project-feed' ? 'feed' : 'tasks'
    return { role: 'owner' as const, screenId: kit.projectScreenId, recordId: project?.id, open: null, tab }
  }
  if (view === 'task' || view === 'task-comments' || view === 'edit' || view === 'comment') return { role: 'owner' as const, screenId: kit.taskScreenId, recordId: task('Макет главной страницы')?.id, open: (view === 'task' || view === 'task-comments' ? null : view) as ProjectsOpen, tab: 'tasks' as const }
  if (view === 'filters') return { role: 'owner' as const, screenId: kit.boardScreenId, recordId: undefined, open: 'filters' as const, tab: 'tasks' as const }
  if (view === 'projects') return { role: 'owner' as const, screenId: kit.projectsScreenId, recordId: undefined, open: null, tab: 'tasks' as const }
  if (view === 'people') return { role: 'owner' as const, screenId: kit.peopleScreenId, recordId: undefined, open: null, tab: 'tasks' as const }
  if (view === 'clients') return { role: 'owner' as const, screenId: kit.clientsScreenId, recordId: undefined, open: null, tab: 'tasks' as const }
  if (view === 'create') return { role: 'owner' as const, screenId: kit.boardScreenId, recordId: undefined, open: 'create' as const, tab: 'tasks' as const }
  return { role: 'owner' as const, screenId: kit.boardScreenId, recordId: undefined, open: null, tab: 'tasks' as const }
}

export function ProjectsDemo({ view = 'board', bare = false }: { view?: string; bare?: boolean }) {
  const [model, setModel] = useState<ReturnType<typeof projectsTemplateDemoModel> | null>(null)
  const [rows, setRows] = useState<AppV2Record[]>([])
  const [screenId, setScreenId] = useState('')
  const [recordId, setRecordId] = useState<string | undefined>()
  const [role, setRole] = useState<'owner' | 'staff'>('owner')
  const [open, setOpen] = useState<ProjectsOpen>(null)
  const [tab, setTab] = useState<ProjectsTab>('tasks')
  useEffect(() => { setModel(projectsTemplateDemoModel()) }, [])
  useEffect(() => {
    if (!model) return
    const goal = goalFor(model.app, model.rows, view)
    setRole(goal.role); setScreenId(goal.screenId); setRecordId(goal.recordId); setOpen(goal.open); setTab(goal.tab); setRows(model.rows)
  }, [model, view])
  if (!model?.app.projects || !screenId) return <div data-projects-root data-projects-screen="loading" />
  const actor: AppV2Actor = role === 'owner'
    ? { authenticated: true, id: 'demo_owner', roleIds: ['owner'], email: 'marina@example.invalid', name: 'Марина Соколова', company: '' }
    : { authenticated: true, id: 'demo_anna', roleIds: ['staff'], email: 'anna@example.invalid', name: 'Анна Волкова', company: '' }
  const visible = { ...model.app, screens: model.app.screens.filter(screen => canOpenAppV2Screen(model.app, actor, screen.id)) }
  const navigate = (id: string, rowId?: string) => { setScreenId(id); setRecordId(rowId); setOpen(null) }
  const frame = <BuilderV2Theme app={model.app}><ProjectsRowsContext value={{ rows, setRows, open, tab }}>
    <div data-projects-root data-projects-screen={view} data-preview-screen={screenId}>
      <BuilderV2AppFrame app={visible} screenId={screenId} title="" phone={false} deviceMode="auto" fullScreen={bare} onNavigate={navigate}>
        <AppV2Renderer live app={visible} tables={model.tables} actor={actor} screenId={screenId} record={rows.find(row => row.id === recordId)} onNavigate={navigate} />
      </BuilderV2AppFrame>
    </div>
  </ProjectsRowsContext></BuilderV2Theme>
  if (!bare) return frame
  return frame
}
