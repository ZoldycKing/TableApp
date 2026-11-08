"""Localize the generated comparison artifact; never edits the installed skill."""
from pathlib import Path
import json
import re

path = Path(__file__).resolve().parents[2] / 'audit/marketing-directions-2026-10-23/full/compare.html'
html = path.read_text(encoding='utf-8')
match = re.search(r'const I18N = (\{[\s\S]+?\n\});', html)
if not match:
    raise SystemExit('Expected generated I18N block was not found')
messages = json.loads(match.group(1))
messages['en'].update({
    'htmlLang': 'ru',
    'pageTitle': 'TableApp — три полных сайта',
    'projectTitle': '{project} · Сравнение направлений · Oil UI{edition}',
    'brandTitle': 'Oil UI{edition} · oiloil.org',
    'brandLabel': 'Oil UI{edition} — инструмент сравнения',
    'layoutLabel': 'Режим просмотра',
    'compare': 'Рядом',
    'loupe': 'По одному',
    'viewportLabel': 'Размер просмотра',
    'desktop': 'Компьютер',
    'mobile': 'Телефон',
    'candidates': 'Три полных сайта TableApp',
    'singleView': 'Просмотр одного варианта',
    'previous': 'Предыдущий вариант',
    'next': 'Следующий вариант',
    'switchDirection': 'Выбрать вариант для просмотра',
    'empty': 'Макеты ещё не добавлены.',
    'baseline': 'Сейчас',
    'serviceUnavailable': 'Сервер макетов не запущен',
    'serviceHelp': 'Напишите в чат: «Открой сравнение сайтов».',
    'copyCommand': 'Скопировать команду',
    'copyCommandLabel': 'Скопировать команду запуска',
    'live': 'Макет',
    'image': 'Изображение',
    'interactive': 'Прототип',
    'fonts': 'Шрифты',
    'traits': 'Что отличает вариант',
    'viewDirection': 'Открыть «{name}»',
    'selected': 'Выбрано',
    'peek': 'Открыть крупнее',
    'fit': 'Вписать в окно',
    'actual': 'Масштаб 100%',
    'keyboardHint': '<kbd>←</kbd> <kbd>→</kbd> Другой вариант · <kbd>P</kbd> Выбрать<br><kbd>Esc</kbd> Вернуться к сравнению',
    'selectedCopy': 'Выбрано · Скопировать',
    'select': 'Выбрать',
    'selectDirection': 'Выбрать этот вариант',
    'recopyTitle': 'Скопировать название выбранного варианта',
    'selectTitle': 'Выбрать вариант и скопировать сообщение для чата',
    'copyRound': '{round}: ',
    'copyChoice': '{round}Для сайта TableApp выбираю вариант {number} «{name}».',
    'copied': 'Скопировано. Вставьте сообщение в чат.',
    'copyFailed': 'Не удалось скопировать. Напишите название варианта в чат.'
})
html = html[:match.start(1)] + json.dumps(messages, ensure_ascii=False, indent=2) + html[match.end(1):]
path.write_text(html, encoding='utf-8')
print('Localized full-site comparison to Russian')
