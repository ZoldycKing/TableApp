/*
 * Генератор книги для проверок многолистового импорта.
 *
 * Здесь собрано ровно то, на чём импорт молча терял данные: лист с формулами
 * без сохранённого результата, лист с ошибкой вычисления, пустой лист,
 * лист из одних заголовков, скрытый лист и коды с ведущими нулями.
 *
 * Запускать из каталога пакета: node fixtures/make-kniga.mjs
 */
import ExcelJS from 'exceljs'

const wb = new ExcelJS.Workbook()

// 1. Обычный лист: с него импорт и должен начаться по умолчанию.
const prodazhi = wb.addWorksheet('Продажи')
prodazhi.addRow(['Клиент', 'Дата', 'Количество', 'Цена', 'Сумма'])
prodazhi.addRow(['ООО «Вектор»', new Date(Date.UTC(2026, 2, 14)), 3, 1200, { formula: 'C2*D2', result: 3600 }])
prodazhi.addRow(['Кафе «Пион»', new Date(Date.UTC(2026, 2, 15)), 1, 4500, { formula: 'C3*D3', result: 4500 }])
prodazhi.addRow(['ИП Соколов', new Date(Date.UTC(2026, 2, 17)), 2, 990, { formula: 'C4*D4', result: 1980 }])

// 2. Второй содержательный лист: другая структура и коды с ведущими нулями.
const klienty = wb.addWorksheet('Клиенты')
klienty.addRow(['Код', 'Название', 'Телефон'])
klienty.addRow(['007', 'ООО «Вектор»', '+7 999 100-20-30'])
klienty.addRow(['0042', 'Кафе «Пион»', '+7 999 100-20-31'])
klienty.addRow(['0108', 'ИП Соколов', '+7 999 100-20-32'])

// 3. Формулы без сохранённого результата: импортировать нечего.
const itogi = wb.addWorksheet('Итоги')
itogi.addRow(['Месяц', 'Выручка'])
itogi.getCell('A2').value = 'Март'
itogi.getCell('B2').value = { formula: 'SUM(Продажи!E2:E4)' }
itogi.getCell('A3').value = 'Апрель'
itogi.getCell('B3').value = { formula: 'SUM(Продажи!E5:E7)' }

// 4. Ошибка вычисления: значение в файле есть, и оно видно.
const oshibki = wb.addWorksheet('Ошибки')
oshibki.addRow(['Товар', 'Доля'])
oshibki.addRow(['Перфоратор', { formula: 'B1/0', result: { error: '#DIV/0!' } }])
oshibki.addRow(['Шуруповёрт', { formula: 'B2/2', result: 0.5 }])

// 5. Пустой лист.
wb.addWorksheet('Пусто')

// 6. Только заголовки, ни одной строки данных.
const shapka = wb.addWorksheet('Шапка')
shapka.addRow(['Наименование', 'Артикул', 'Цена'])

// 7. Скрытый лист: показываем, но сам не выбирается.
const arhiv = wb.addWorksheet('Архив')
arhiv.state = 'hidden'
arhiv.addRow(['Клиент', 'Год'])
arhiv.addRow(['ООО «Старт»', 2024])
arhiv.addRow(['ООО «Финиш»', 2025])

// 8. Совсем скрытый лист: в списке его быть не должно.
const sluzhebny = wb.addWorksheet('Служебный')
sluzhebny.state = 'veryHidden'
sluzhebny.addRow(['ключ', 'значение'])
sluzhebny.addRow(['версия', 7])

await wb.xlsx.writeFile(new URL('./kniga.xlsx', import.meta.url).pathname.replace(/^\//, ''))
console.log('готово: kniga.xlsx')
