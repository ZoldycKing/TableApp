import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { amountInWordsRu, type DocKind } from './invoices-logic'

export type InvoicePdfImage = { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' }

export type InvoicePdfLine = {
  name: string
  qty: number
  unit: string
  price: number
  discount?: number
  total: number
}

export type InvoicePdfInput = {
  kind: DocKind
  number: string
  date: string
  due?: string
  seller: {
    company: string
    inn: string
    kpp?: string
    address: string
    bank?: string
    bik?: string
    account?: string
    corrAccount?: string
    phone?: string
    email?: string
  }
  buyer: {
    name: string
    inn?: string
    address?: string
    phone?: string
    email?: string
  }
  lines: readonly InvoicePdfLine[]
  subtotal: number
  discount: number
  vat: number
  total: number
  note?: string
  logo?: InvoicePdfImage | null
  signature?: InvoicePdfImage | null
  stamp?: InvoicePdfImage | null
}

const ink = rgb(63 / 255, 107 / 255, 92 / 255)
const accent = rgb(196 / 255, 98 / 255, 58 / 255)
const muted = rgb(91 / 255, 90 / 255, 96 / 255)
const line = rgb(218 / 255, 215 / 255, 209 / 255)

const TITLE: Record<DocKind, string> = {
  estimate: 'Смета',
  invoice: 'Счёт на оплату',
  act: 'Акт выполненных работ',
}

const ACT_PHRASE = 'Услуги выполнены полностью и в срок, претензий по объёму, качеству и срокам выполнения работ заказчик не имеет.'

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const source = text.replace(/\s+/g, ' ').trim()
  if (!source) return []
  const lines: string[] = []
  let current = ''
  for (const word of source.split(' ')) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width) current = next
    else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

const money = (value: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)

export async function buildInvoicePdf(input: InvoicePdfInput, fontBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fontBytes, { subset: true })
  const page = doc.addPage([595.28, 841.89])
  const margin = 40
  const width = page.getWidth() - margin * 2
  let y = page.getHeight() - margin

  const text = (value: string, x: number, top: number, size: number, color = ink) => {
    page.drawText(value, { x, y: top - size, size, font, color })
  }
  const rule = (top: number) => {
    page.drawLine({ start: { x: margin, y: top }, end: { x: margin + width, y: top }, thickness: 0.6, color: line })
  }
  const right = (value: string, xRight: number, top: number, size: number, color = ink) => {
    text(value, xRight - font.widthOfTextAtSize(value, size), top, size, color)
  }

  const embedImage = async (img: InvoicePdfImage | null | undefined, x: number, bottom: number, maxW: number, maxH: number) => {
    if (!img) return
    const embedded = img.mime === 'image/png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes)
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1)
    page.drawImage(embedded, { x, y: bottom, width: embedded.width * scale, height: embedded.height * scale })
  }

  if (input.logo) {
    await embedImage(input.logo, margin, y - 48, 56, 48)
    y -= 56
  }

  text(TITLE[input.kind], margin, y, 18, ink)
  right(`№ ${input.number}`, margin + width, y, 14, accent)
  y -= 24
  text(`${input.date}${input.due && input.kind === 'invoice' ? ` · оплатить до ${input.due}` : ''}`, margin, y, 10, muted)
  y -= 18
  rule(y)
  y -= 16

  const sellerTitle = input.kind === 'act' ? 'Исполнитель' : 'Продавец'
  const buyerTitle = input.kind === 'act' ? 'Заказчик' : 'Покупатель'

  const block = (title: string, lines: string[]) => {
    text(title, margin, y, 9, muted)
    y -= 14
    for (const row of lines) {
      const wrapped = wrap(font, row, 10, width)
      for (const part of wrapped.length ? wrapped : ['—']) {
        text(part, margin, y, 10)
        y -= 13
      }
    }
    y -= 8
  }

  const bankLines: string[] = []
  if (input.seller.bank) bankLines.push(`Банк: ${input.seller.bank}`)
  if (input.seller.bik) bankLines.push(`БИК: ${input.seller.bik}`)
  if (input.seller.account) bankLines.push(`Р/с: ${input.seller.account}`)
  if (input.seller.corrAccount) bankLines.push(`К/с: ${input.seller.corrAccount}`)

  block(sellerTitle, [
    input.seller.company,
    `ИНН ${input.seller.inn}${input.seller.kpp ? ` · КПП ${input.seller.kpp}` : ''}`,
    input.seller.address,
    ...bankLines,
  ].filter(Boolean))
  block(buyerTitle, [
    input.buyer.name,
    ...(input.buyer.inn ? [`ИНН ${input.buyer.inn}`] : []),
    ...(input.buyer.address ? [input.buyer.address] : []),
  ])

  const showDiscount = input.lines.some(row => (row.discount ?? 0) > 0) || input.discount > 0
  y -= 6
  rule(y)
  y -= 14
  text('№', margin, y, 9, muted)
  text('Наименование', margin + 22, y, 9, muted)
  if (showDiscount) {
    right('Кол-во', margin + width - 210, y, 9, muted)
    right('Цена', margin + width - 145, y, 9, muted)
    right('Скидка', margin + width - 80, y, 9, muted)
    right('Сумма', margin + width, y, 9, muted)
  } else {
    right('Кол-во', margin + width - 160, y, 9, muted)
    right('Цена', margin + width - 80, y, 9, muted)
    right('Сумма', margin + width, y, 9, muted)
  }
  y -= 12
  rule(y)
  y -= 12

  input.lines.forEach((row, index) => {
    text(String(index + 1), margin, y, 9)
    const name = wrap(font, row.name, 9, showDiscount ? width - 250 : width - 200)[0] ?? row.name
    text(name, margin + 22, y, 9)
    if (showDiscount) {
      right(`${money(row.qty)} ${row.unit}`, margin + width - 210, y, 9)
      right(money(row.price), margin + width - 145, y, 9)
      right(row.discount ? `${money(row.discount)}%` : '—', margin + width - 80, y, 9)
      right(money(row.total), margin + width, y, 9)
    } else {
      right(`${money(row.qty)} ${row.unit}`, margin + width - 160, y, 9)
      right(money(row.price), margin + width - 80, y, 9)
      right(money(row.total), margin + width, y, 9)
    }
    y -= 14
    if (y < 200) return
  })

  y -= 8
  rule(y)
  y -= 16
  const netWithoutVat = Math.max(0, input.total - input.vat)
  const totals: [string, string][] = [
    ['Подытог', `${money(input.subtotal)} ₽`],
    ...(input.discount > 0 ? [['Скидка', `${money(input.discount)} ₽`] as [string, string]] : []),
    ['без НДС', `${money(netWithoutVat)} ₽`],
    ['В т.ч. НДС', `${money(input.vat)} ₽`],
    ['Итого', `${money(input.total)} ₽`],
  ]
  for (const [label, value] of totals) {
    text(label, margin + width - 180, y, 10, label === 'Итого' ? ink : muted)
    right(value, margin + width, y, 11, label === 'Итого' ? accent : ink)
    y -= 16
  }
  y -= 4
  const words = wrap(font, amountInWordsRu(input.total), 10, width)
  for (const row of words.slice(0, 3)) {
    text(row, margin, y, 10, muted)
    y -= 13
  }

  if (input.kind === 'act') {
    y -= 8
    for (const row of wrap(font, ACT_PHRASE, 9, width).slice(0, 4)) {
      text(row, margin, y, 9)
      y -= 12
    }
  }

  if (input.note?.trim()) {
    y -= 8
    text('Примечание', margin, y, 9, muted)
    y -= 14
    for (const row of wrap(font, input.note, 9, width).slice(0, 4)) {
      text(row, margin, y, 9)
      y -= 12
    }
  }

  text(input.kind === 'act' ? 'Исполнитель' : 'Подпись', margin, 120, 9, muted)
  text(input.kind === 'act' ? 'Заказчик' : 'Печать', margin + width - 140, 120, 9, muted)
  await embedImage(input.signature, margin, 55, 110, 50)
  await embedImage(input.stamp, margin + width - 110, 45, 100, 90)

  return doc.save()
}
