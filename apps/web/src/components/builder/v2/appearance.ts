import type {CSSProperties} from 'react'
import type {AppV2} from '@tableapp/schema/app-v2'

// All primary colors have readable white labels; dark themes use the lighter pair.
export const BUILDER_V2_COLORS = {
  green: ['Зелёный', '#456849', '#b5d3ad'], blue: ['Синий', '#315f91', '#afcbee'],
  indigo: ['Индиго', '#4b5296', '#bfc2ef'], violet: ['Фиолетовый', '#70529a', '#d0bbed'],
  purple: ['Пурпурный', '#854a90', '#e0b6e8'], pink: ['Розовый', '#9a426b', '#f0b5ce'],
  rose: ['Малиновый', '#9e4358', '#f3b4c2'], red: ['Красный', '#a0443a', '#f2b9ae'],
  orange: ['Оранжевый', '#96542e', '#edc1a1'], amber: ['Янтарный', '#855d24', '#e6c58e'],
  yellow: ['Жёлтый', '#76641e', '#e0d28c'], lime: ['Лаймовый', '#5e6d2c', '#c8d897'],
  teal: ['Бирюзовый', '#326e67', '#a8d5cd'], cyan: ['Голубой', '#2c6b7a', '#a6d3e0'],
  gray: ['Графитовый', '#555e59', '#c4ccc6'],
} as const
export const BUILDER_V2_ICONS = [
  ['apps','Обзор'],['home','Главная'],['table','Таблица'],['template','Список'],
  ['folder','Папка'],['calendar','Календарь'],['chart','Диаграмма'],['users','Люди'],
  ['box','Склад'],['clipboard','Задачи'],['wallet','Финансы'],['book','Заметки'],
  ['wrench','Работы'],['heart','Личное'],['star','Избранное'],['action','Действия'],
  ['plus','Добавление'],['settings','Настройки'],
] as const
export function builderV2ThemeStyle(theme: AppV2['theme'], appearance?: AppV2['appearance']): CSSProperties {
  const color=BUILDER_V2_COLORS[theme.accent]??BUILDER_V2_COLORS.green
  return {
    '--v2-brand': color[1], '--v2-brand-light': color[2],
    ...(appearance?.density === 'compact' ? { '--v2-row-padding': '8px 12px', '--v2-list-gap': '8px' } : {}),
    ...(appearance?.corners === 'subtle' ? { '--v2-frame-radius': '8px', '--v2-card-radius': '4px', '--v2-control-radius': '4px' } : {}),
  } as CSSProperties
}
export function builderV2Menu(app:AppV2) {
  return app.screens.filter(screen=>screen.navigation&&!screen.contextTableId)
}
export function builderV2MenuLabel(screen:AppV2['screens'][number]) {
  return screen.menuLabel?.trim()||screen.name
}
