import { test } from 'vitest'
import assert from 'node:assert/strict'
import { fileKey, isAllowed } from './storage'

test('разрешены картинки и документы, исполняемое — нет', () => {
  assert.equal(isAllowed('image/png'), true)
  assert.equal(isAllowed('application/pdf'), true)
  // Загрузка HTML на свой домен — это хранимая XSS, поэтому тип не в списке.
  assert.equal(isAllowed('text/html'), false)
  assert.equal(isAllowed('application/x-msdownload'), false)
  assert.equal(isAllowed(''), false)
})

test('ключ файла лежит в папке воркспейса и не угадывается', () => {
  const key = fileKey('wsp_abc', 'фото.png')
  assert.ok(key.startsWith('wsp_abc/'))
  assert.ok(key.endsWith('.png'))
  // 16 случайных байт в hex.
  assert.match(key, /^wsp_abc\/[0-9a-f]{32}\.png$/)
})

test('путь в имени файла не попадает в ключ', () => {
  // Иначе ключ протащил бы слэши и фрагмент чужого имени.
  for (const name of ['../../etc/passwd', 'C:\Windows\system32\cmd', 'dir/sub/file']) {
    const key = fileKey('wsp_abc', name)
    assert.ok(!key.includes('..'), name)
    assert.ok(!key.includes('passwd'), name)
    assert.equal(key.split('/').length, 2, name)
  }
})

test('файл без расширения получает ключ без расширения', () => {
  assert.match(fileKey('wsp_abc', 'README'), /^wsp_abc\/[0-9a-f]{32}$/)
})

test('два вызова дают разные ключи', () => {
  const keys = new Set(Array.from({ length: 50 }, () => fileKey('wsp_abc', 'a.png')))
  assert.equal(keys.size, 50)
})

test('расширение чистится от всего, кроме букв и цифр', () => {
  assert.match(fileKey('wsp_abc', 'файл.PNG'), /\.png$/)
  assert.match(fileKey('wsp_abc', 'архив.tar.gz'), /\.gz$/)
  // Расширение из одних небезопасных символов отбрасывается целиком.
  assert.match(fileKey('wsp_abc', 'файл.'), /^wsp_abc\/[0-9a-f]{32}$/)
  assert.match(fileKey('wsp_abc', 'файл.«»'), /^wsp_abc\/[0-9a-f]{32}$/)
})
