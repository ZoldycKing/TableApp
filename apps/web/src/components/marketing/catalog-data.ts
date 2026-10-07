import type { GlyphKind } from './product-glyph'

export type Product = {
  code: string
  name: string
  short: string
  price: string
  stock: number
  /** Адрес склада: одно из полей, которых не видно в тесной таблице. */
  warehouse: string
  tint: string
  ink: string
  glyph: GlyphKind
}

/** Каталог инструмента: узнаваемый пример большой таблицы с фото и остатками. */
export const PRODUCTS: Product[] = [
  {
    code: 'ПР-0842',
    name: 'Перфоратор SDS-Plus, 800 Вт',
    short: 'Перфоратор 800 Вт',
    price: '12 490',
    stock: 8,
    warehouse: 'Москва, Складочная 1',
    tint: 'bg-amber-100',
    ink: 'text-amber-700',
    glyph: 'drill',
  },
  {
    code: 'ШВ-1130',
    name: 'Шуруповёрт 12 В, 2 АКБ',
    short: 'Шуруповёрт 12 В',
    price: '7 990',
    stock: 3,
    warehouse: 'Химки, Заводская 4',
    tint: 'bg-sage-100',
    ink: 'text-sage-700',
    glyph: 'driver',
  },
  {
    code: 'НБ-0032',
    name: 'Набор бит и сверл, 32 шт',
    short: 'Набор бит, 32 шт',
    price: '1 250',
    stock: 41,
    warehouse: 'Москва, Складочная 1',
    tint: 'bg-sand-200',
    ink: 'text-ink-soft',
    glyph: 'bits',
  },
  {
    code: 'УР-2000',
    name: 'Уровень лазерный, 20 м',
    short: 'Уровень лазерный',
    price: '5 690',
    stock: 0,
    warehouse: 'Мытищи, Силикатная 8',
    tint: 'bg-clay-400/20',
    ink: 'text-clay-500',
    glyph: 'level',
  },
]
