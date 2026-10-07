/*
 * Генератор фикстуры для тестов чтения XLSX: настоящая книга с датами,
 * формулой, логическими значениями, вторым листом и пустым хвостом.
 * Запускать из каталога пакета: node fixtures/make-fixture.mjs
 */
import ExcelJS from 'exceljs'

const wb = new ExcelJS.Workbook()

const sklad = wb.addWorksheet('Склад')
sklad.addRow(['Наименование', 'Артикул', 'Цена', 'Остаток', 'Дата приёмки', 'Оплачено', 'Адрес склада'])
sklad.addRow(['Перфоратор SDS-Plus, 800 Вт', 'ПР-0842', 12490.5, 8, new Date(Date.UTC(2026, 2, 14)), true, 'Москва, Складочная 1'])
sklad.addRow(['Шуруповёрт 12 В, 2 АКБ', 'ШВ-1130', 7990, 3, new Date(Date.UTC(2026, 2, 16, 9, 30)), false, 'Химки, Заводская 4'])
sklad.addRow(['Набор бит и сверл, 32 шт', 'НБ-0032', 1250, 41, new Date(Date.UTC(2026, 2, 20)), true, 'Москва, Складочная 1'])
// Формула: в файл попадает и выражение, и посчитанное значение.
sklad.getCell('H1').value = 'Сумма'
sklad.getCell('H2').value = { formula: 'C2*D2', result: 99920 }
// Пустые хвосты, которые Excel помечает использованными.
sklad.getCell('M60').value = null

const zayavki = wb.addWorksheet('Заявки')
zayavki.addRow(['Клиент', 'Статус'])
zayavki.addRow(['ООО «Вектор»', 'В работе'])
zayavki.addRow(['ООО «Кристалл»', 'Новая'])

await wb.xlsx.writeFile(new URL('./sklad.xlsx', import.meta.url).pathname.replace(/^\//, ''))
console.log('готово')
