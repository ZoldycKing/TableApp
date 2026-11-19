import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { amountInWordsRu, type DocKind } from './invoices-logic'

export type InvoicePdfImage = { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' }

export type InvoicePdfLine = {
  name: string
  qty: number
  unit: string
  price: number
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

  const text = (value: string, x: number, top: number, size: number, color = ink, bold = false) => {
    page.drawText(value, { x, y: top - size, size, font, color })
  }
  const rule = (top: number) => {
    page.drawLine({ start: { x: margin, y: top }, end: { x: margin + width, y: top }, thickness: 0.6, color: line })
  }

  text(TITLE[input.kind], margin, y, 18, ink)
  text(`№ ${input.number}`, margin + width - font.widthOfTextAtSize(`№ ${input.number}`, 14), y, 14, accent)
  y -= 24
  text(`${input.date}${input.due && input.kind === 'invoice' ? ` · оплатить до ${input.due}` : ''}`, margin, y, 10, muted)
  y -= 18
  rule(y)
  y -= 16

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

  block('Продавец', [
    input.seller.company,
    `ИНН ${input.seller.inn}${input.seller.kpp ? ` · КПП ${input.seller.kpp}` : ''}`,
    input.seller.address,
    ...(input.seller.bank && input.seller.account ? [`${input.seller.bank}, БИК ${input.seller.bik ?? '—'}, р/с ${input.seller.account}`] : []),
  ])
  block('Покупатель', [
    input.buyer.name,
    ...(input.buyer.inn ? [`ИНН ${input.buyer.inn}`] : []),
    ...(input.buyer.address ? [input.buyer.address] : []),
  ])

  y -= 6
  rule(y)
  y -= 14
  text('№', margin, y, 9, muted)
  text('Наименование', margin + 24, y, 9, muted)
  text('Кол-во', margin + width - 200, y, 9, muted)
  text('Цена', margin + width - 130, y, 9, muted)
  text('Сумма', margin + width - 58, y, 9, muted)
  y -= 12
  rule(y)
  y -= 12

  input.lines.forEach((row, index) => {
    text(String(index + 1), margin, y, 9)
    const name = wrap(font, row.name, 9, width - 230)[0] ?? row.name
    text(name, margin + 24, y, 9)
    text(`${money(row.qty)} ${row.unit}`, margin + width - 200, y, 9)
    text(money(row.price), margin + width - 130, y, 9)
    text(money(row.total), margin + width - 58, y, 9)
    y -= 14
    if (y < 180) return
  })

  y -= 8
  rule(y)
  y -= 16
  const totals: [string, string][] = [
    ['Подытог', `${money(input.subtotal)} ₽`],
    ...(input.discount > 0 ? [['Скидка', `${money(input.discount)} ₽`] as [string, string]] : []),
    ...(input.vat > 0 ? [['в т.ч. НДС', `${money(input.vat)} ₽`] as [string, string]] : []),
    ['Итого', `${money(input.total)} ₽`],
  ]
  for (const [label, value] of totals) {
    text(label, margin + width - 180, y, 10, label === 'Итого' ? ink : muted)
    text(value, margin + width - font.widthOfTextAtSize(value, 11), y, 11, label === 'Итого' ? accent : ink)
    y -= 16
  }
  y -= 4
  const words = wrap(font, amountInWordsRu(input.total), 10, width)
  for (const row of words.slice(0, 3)) {
    text(row, margin, y, 10, muted)
    y -= 13
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

  const embedImage = async (img: InvoicePdfImage | null | undefined, x: number, bottom: number, maxW: number, maxH: number) => {
    if (!img) return
    const embedded = img.mime === 'image/png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes)
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1)
    page.drawImage(embedded, { x, y: bottom, width: embedded.width * scale, height: embedded.height * scale })
  }
  await embedImage(input.stamp, margin + width - 120, 60, 90, 90)
  await embedImage(input.signature, margin + width - 220, 70, 80, 40)

  return doc.save()
}