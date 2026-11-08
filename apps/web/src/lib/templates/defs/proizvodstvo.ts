import type { TemplateDef } from '../types'
import { inDays } from '../types'

/**
 * Производственный учёт.
 *
 * Небольшое производство выпускает серийную продукцию: пакеты, упаковку,
 * пластиковые изделия. Начальник производства вводит выпуск за смену,
 * а расход материалов система считает сама по нормам и списывает со склада.
 *
 * Модель держится на двух решениях, и оба вынужденные — так устроен движок.
 *
 * **Количество в движении знаковое.** Приход положительный, списание
 * отрицательное. Свёртки в TableApp не умеют отбора, поэтому отдельные
 * «Приход» и «Расход» колонками не выразить: пришлось бы две свёртки
 * с фильтром по типу, а фильтра нет. Одна свёртка по знаковому количеству
 * даёт остаток без единого условия — и ошибиться в ней негде.
 *
 * **Склад выводится из движений, а не хранится.** Текущий остаток нигде
 * не лежит числом, которое можно затереть: он всегда равен начальному плюс
 * сумма движений. Поэтому «сколько было на прошлой неделе» — вопрос
 * к журналу, а не к памяти человека.
 */
export const proizvodstvo: TemplateDef = {
  id: 'proizvodstvo',
  name: 'Производственный учёт',
  tagline: 'Выпуск продукции, нормы расхода материалов и остатки склада в одном приложении',
  audience: 'Небольшое производство: упаковка, пластик, пакеты, серийные изделия',
  emoji: '🏭',
  kin: ['sklad', 'zakazy'],
  gives: [
    'Начальник производства вводит выпуск — расход материалов считается по нормам сам',
    'Списание идёт в журнал движений: остаток нигде не правится руками',
    'Нормы задаются по строке на материал — менять их можно без переделки таблиц',
    'Директору сводка: выпуск за день, брак и материалы ниже минимума',
  ],
  appTable: 'production',
  appName: 'Производство',
  /*
   * Карта для действия «сохранить выпуск»: какая таблица и какая колонка
   * за что отвечают. Ключи шаблона — идентификаторы выпускаются при установке.
   */
  production: {
    tables: { production: 'production', movements: 'movements', norms: 'norms', materials: 'materials' },
    run: { date: 'date', product: 'product', qty: 'qty', defects: 'defects', shift: 'shift', note: 'note' },
    norm: { product: 'product', material: 'material', perUnit: 'perUnit', active: 'active' },
    movement: { date: 'date', material: 'material', kind: 'kind', qty: 'qty', run: 'production', reason: 'reason' },
    material: { name: 'name', unit: 'unit', opening: 'opening', movements: 'movements', stock: 'stock', low: 'low', min: 'min' },
    movementKind: 'Производство',
    copy: {
      director: 'Директор',
      operator: 'Начальник производства',
      formName: 'Новый выпуск',
      submitLabel: 'Сохранить выпуск',
    },
  },
  tables: [
    // --- Продукция -----------------------------------------------------------
    {
      key: 'products',
      name: 'Продукция',
      icon: 'box',
      primary: 'name',
      fields: [
        {
          key: 'name',
          name: 'Название',
          type: 'text',
          help: 'Как изделие называют в цеху. Это заголовок карточки и то, что выбирает начальник производства при вводе выпуска.',
        },
        {
          key: 'sku',
          name: 'Артикул',
          type: 'text',
          help: 'Внутренний код изделия. Нужен, когда два названия отличаются одной цифрой.',
        },
        {
          key: 'unit',
          name: 'Единица измерения',
          type: 'single_select',
          choices: [
            { name: 'шт.', color: 'blue' },
            { name: 'уп.', color: 'teal' },
            { name: 'м', color: 'violet' },
          ],
          help: 'В чём считается выпуск. Нормы расхода задаются на одну такую единицу.',
        },
        {
          key: 'active',
          name: 'Выпускается',
          type: 'checkbox',
          help: 'Снимите отметку у изделия, которое сняли с производства: оно перестанет предлагаться при вводе выпуска, но история останется.',
        },
        {
          key: 'note',
          name: 'Описание',
          type: 'long_text',
          help: 'Всё, что нужно помнить про изделие: оснастка, особенности, к кому идти с вопросами.',
        },
      ],
      views: [
        { name: 'Вся продукция', type: 'grid' },
        { name: 'Выпускается', type: 'grid', filter: { field: 'active', op: 'is', value: true } },
      ],
      rows: [
        { key: 'p1', values: { name: 'Пивной пакет 1 л', sku: 'PK-1000', unit: 'шт.', active: true, note: 'Основная позиция. Оснастка №2.' } },
        { key: 'p2', values: { name: 'Пивной пакет 2 л', sku: 'PK-2000', unit: 'шт.', active: true, note: 'Пластика уходит больше, оснастка та же.' } },
      ],
    },

    // --- Материалы -----------------------------------------------------------
    {
      key: 'materials',
      name: 'Материалы',
      icon: 'box',
      primary: 'name',
      fields: [
        {
          key: 'name',
          name: 'Название',
          type: 'text',
          help: 'Как материал называют на складе. По этому названию его выбирают в нормах и в движениях.',
        },
        {
          key: 'unit',
          name: 'Единица измерения',
          type: 'single_select',
          choices: [
            { name: 'кг', color: 'orange' },
            { name: 'шт.', color: 'blue' },
            { name: 'л', color: 'teal' },
            { name: 'м', color: 'violet' },
          ],
          help: 'В чём меряется материал. В этих же единицах задаётся норма и считается остаток.',
        },
        {
          key: 'opening',
          name: 'Начальный остаток',
          type: 'number',
          options: { format: 'plain', precision: 3 },
          help: 'Сколько лежало на складе в день, когда вы начали вести учёт здесь. Дальше это число не трогают — остаток меняют движениями.',
        },
        {
          key: 'movements',
          name: 'Движения',
          type: 'relation',
          relationTable: 'movements',
          allowMultiple: true,
          help: 'Все приходы и списания по этому материалу. Заполняется само при вводе выпуска и при ручном движении — руками сюда ничего добавлять не нужно.',
        },
        {
          key: 'delta',
          name: 'Изменение',
          type: 'rollup',
          through: 'movements',
          target: 'qty',
          fn: 'sum',
          help: 'Сумма всех движений: приход со знаком плюс, списание со знаком минус. Считается само.',
        },
        {
          key: 'stock',
          name: 'Текущий остаток',
          type: 'formula',
          expression: '{Начальный остаток} + {Изменение}',
          help: 'Начальный остаток плюс все движения. Это число нигде не хранится и не правится: чтобы его изменить, добавьте движение.',
        },
        {
          key: 'min',
          name: 'Минимальный остаток',
          type: 'number',
          options: { format: 'plain', precision: 3 },
          help: 'Порог, ниже которого пора закупать. Ставьте столько, на сколько хватает срока поставки.',
        },
        {
          key: 'low',
          name: 'Ниже минимального остатка',
          type: 'formula',
          expression: '{Текущий остаток} < {Минимальный остаток}',
          help: 'Отметка появляется сама, когда остаток опустился ниже минимума. Эти материалы директор видит на главном экране.',
        },
      ],
      views: [
        { name: 'Все материалы', type: 'grid' },
        { name: 'Ниже минимального остатка', type: 'grid', filter: { field: 'low', op: 'is', value: true } },
      ],
      rows: [
        { key: 'm1', values: { name: 'Пластик', unit: 'кг', opening: 1500, min: 300, movements: { rowKeys: ['mv0', 'mv1', 'mv5'] } } },
        { key: 'm2', values: { name: 'Коробки', unit: 'шт.', opening: 5000, min: 1000, movements: { rowKeys: ['mv2', 'mv6'] } } },
        { key: 'm3', values: { name: 'Клей', unit: 'кг', opening: 100, min: 100, movements: { rowKeys: ['mv3', 'mv7'] } } },
        { key: 'm4', values: { name: 'Краситель', unit: 'кг', opening: 50, min: 50, movements: { rowKeys: ['mv4', 'mv8'] } } },
      ],
    },

    // --- Нормы расхода -------------------------------------------------------
    {
      key: 'norms',
      name: 'Нормы расхода',
      icon: 'clipboard',
      primary: 'name',
      fields: [
        {
          key: 'name',
          name: 'Норма',
          type: 'formula',
          expression: '{Название изделия} & " — " & {Название материала}',
          help: 'Собирается само из продукта и материала, чтобы строку было видно в списках.',
        },
        {
          key: 'product',
          name: 'Продукт',
          type: 'relation',
          relationTable: 'products',
          help: 'На какое изделие эта норма. Одна строка — один материал для одного изделия.',
        },
        {
          key: 'material',
          name: 'Материал',
          type: 'relation',
          relationTable: 'materials',
          help: 'Какой материал уходит. Чтобы добавить ещё один материал в изделие, заведите ещё одну строку — не колонку.',
        },
        {
          key: 'productName',
          name: 'Название изделия',
          type: 'lookup',
          through: 'product',
          target: 'name',
          help: 'Подтягивается из карточки изделия — по ней собирается заголовок строки.',
        },
        {
          key: 'materialName',
          name: 'Название материала',
          type: 'lookup',
          through: 'material',
          target: 'name',
          help: 'Подтягивается из карточки материала.',
        },
        {
          key: 'perUnit',
          name: 'Норма на единицу',
          type: 'number',
          options: { format: 'plain', precision: 6 },
          help: 'Сколько материала уходит на одну единицу продукции. Пластик на пакет — 0,012 кг, коробка — 0,01 шт.',
        },
        {
          key: 'unit',
          name: 'Единица',
          type: 'lookup',
          through: 'material',
          target: 'unit',
          help: 'Подтягивается из материала: отдельно её задавать не нужно.',
        },
        {
          key: 'active',
          name: 'Действует',
          type: 'checkbox',
          help: 'Снимите отметку, чтобы норма перестала применяться к новым выпускам. Уже записанные списания не изменятся.',
        },
      ],
      views: [
        { name: 'Все нормы', type: 'grid', hiddenFields: ['productName', 'materialName'] },
        { name: 'Действующие', type: 'grid', hiddenFields: ['productName', 'materialName'], filter: { field: 'active', op: 'is', value: true } },
      ],
      rows: [
        { key: 'n1', values: { product: { rowKey: 'p1' }, material: { rowKey: 'm1' }, perUnit: 0.012, active: true } },
        { key: 'n2', values: { product: { rowKey: 'p1' }, material: { rowKey: 'm2' }, perUnit: 0.01, active: true } },
        { key: 'n3', values: { product: { rowKey: 'p1' }, material: { rowKey: 'm3' }, perUnit: 0.0003, active: true } },
        { key: 'n4', values: { product: { rowKey: 'p1' }, material: { rowKey: 'm4' }, perUnit: 0.0001, active: true } },
        { key: 'n5', values: { product: { rowKey: 'p2' }, material: { rowKey: 'm1' }, perUnit: 0.019, active: true } },
        { key: 'n6', values: { product: { rowKey: 'p2' }, material: { rowKey: 'm2' }, perUnit: 0.01, active: true } },
        { key: 'n7', values: { product: { rowKey: 'p2' }, material: { rowKey: 'm3' }, perUnit: 0.0004, active: true } },
        { key: 'n8', values: { product: { rowKey: 'p2' }, material: { rowKey: 'm4' }, perUnit: 0.00015, active: true } },
      ],
    },

    // --- Производство --------------------------------------------------------
    {
      key: 'production',
      name: 'Производство',
      icon: 'deal',
      primary: 'name',
      fields: [
        {
          key: 'name',
          name: 'Выпуск',
          type: 'formula',
          /*
           * Через подстановку, а не прямо по связи: формула видит в связи
           * идентификатор строки, а не её название. Название приносит
           * колонка-подстановка — это и есть предусмотренный для неё способ.
           */
          expression: '{Название изделия} & " — " & {Произведено}',
          help: 'Заголовок строки: что и сколько выпустили. Собирается сам.',
        },
        {
          key: 'date',
          name: 'Дата',
          type: 'date',
          options: { dateFormat: 'dd.MM.yyyy' },
          help: 'День выпуска. По нему собирается сводка за сегодня.',
        },
        {
          key: 'product',
          name: 'Продукт',
          type: 'relation',
          relationTable: 'products',
          help: 'Что выпускали. От изделия зависит, какие нормы применятся и какие материалы спишутся.',
        },
        {
          key: 'productName',
          name: 'Название изделия',
          type: 'lookup',
          through: 'product',
          target: 'name',
          help: 'Подтягивается из карточки изделия. Нужна для заголовка строки и поиска по названию.',
        },
        {
          key: 'qty',
          name: 'Произведено',
          type: 'number',
          options: { format: 'plain', precision: 0 },
          help: 'Сколько годных единиц выпустили за смену. По этому числу считается расход материалов.',
        },
        {
          key: 'defects',
          name: 'Брак',
          type: 'number',
          options: { format: 'plain', precision: 0 },
          help: 'Сколько ушло в брак. На расход материалов в этой версии не влияет — считается отдельно, чтобы видеть долю.',
        },
        {
          key: 'shift',
          name: 'Смена',
          type: 'single_select',
          choices: [
            { name: 'Дневная', color: 'amber' },
            { name: 'Ночная', color: 'violet' },
            { name: 'Другая', color: 'gray' },
          ],
          help: 'Какая смена выпускала. Если смен у вас нет, колонку можно удалить.',
        },
        {
          key: 'note',
          name: 'Комментарий',
          type: 'long_text',
          help: 'Что пошло не так, почему брак, что чинили. Это единственное поле, которое можно править после сохранения.',
        },
        {
          key: 'author',
          name: 'Внёс',
          type: 'created_by',
          help: 'Кто записал выпуск. Проставляется сервером — подменить нельзя.',
        },
        {
          key: 'createdAt',
          name: 'Записано',
          type: 'created_time',
          options: { dateFormat: 'dd.MM.yyyy HH:mm' },
          help: 'Когда запись попала в систему. Отличается от даты выпуска, если вводили задним числом.',
        },
      ],
      views: [
        { name: 'Все выпуски', type: 'grid', hiddenFields: ['productName'] },
        { name: 'По дням', type: 'calendar', dateBy: 'date', hiddenFields: ['productName'] },
      ],
      rows: [
        { key: 'pr1', values: { date: inDays(-2), product: { rowKey: 'p1' }, qty: 18500, defects: 210, shift: 'Дневная', note: 'Простой 40 минут — меняли нож.' } },
        { key: 'pr2', values: { date: inDays(0), product: { rowKey: 'p1' }, qty: 20000, defects: 320, shift: 'Дневная' } },
      ],
    },

    // --- Движение материалов -------------------------------------------------
    {
      key: 'movements',
      name: 'Движение материалов',
      icon: 'truck',
      primary: 'name',
      fields: [
        {
          key: 'name',
          name: 'Движение',
          type: 'formula',
          expression: '{Название материала} & ": " & {Количество}',
          help: 'Заголовок строки журнала. Собирается сам.',
        },
        {
          key: 'date',
          name: 'Дата',
          type: 'date',
          options: { dateFormat: 'dd.MM.yyyy' },
          help: 'Когда материал пришёл или ушёл.',
        },
        {
          key: 'material',
          name: 'Материал',
          type: 'relation',
          relationTable: 'materials',
          help: 'По какому материалу движение.',
        },
        {
          key: 'materialName',
          name: 'Название материала',
          type: 'lookup',
          through: 'material',
          target: 'name',
          help: 'Подтягивается из карточки материала: по ней собирается заголовок строки журнала.',
        },
        {
          key: 'kind',
          name: 'Тип',
          type: 'single_select',
          choices: [
            { name: 'Приход', color: 'green' },
            { name: 'Производство', color: 'blue' },
            { name: 'Списание', color: 'red' },
            { name: 'Корректировка', color: 'amber' },
          ],
          help: 'Откуда движение. «Производство» ставится системой при вводе выпуска, остальные — руками.',
        },
        {
          key: 'qty',
          name: 'Количество',
          type: 'number',
          options: { format: 'plain', precision: 3 },
          help: 'Со знаком: приход положительный, списание отрицательное. Остаток материала — это сумма всех его движений плюс начальный остаток.',
        },
        {
          key: 'production',
          name: 'Выпуск',
          type: 'relation',
          relationTable: 'production',
          help: 'Какой выпуск породил это списание. У ручных движений пусто.',
        },
        {
          key: 'reason',
          name: 'Основание',
          type: 'text',
          help: 'Одной строкой: чем вызвано движение. У списаний по выпуску заполняется само.',
        },
        {
          key: 'author',
          name: 'Внёс',
          type: 'created_by',
          help: 'Кто записал движение. Проставляется сервером.',
        },
        {
          key: 'createdAt',
          name: 'Записано',
          type: 'created_time',
          options: { dateFormat: 'dd.MM.yyyy HH:mm' },
          help: 'Когда движение попало в систему.',
        },
      ],
      views: [
        { name: 'Все движения', type: 'grid', hiddenFields: ['materialName'] },
        { name: 'Приходы', type: 'grid', hiddenFields: ['materialName'], filter: { field: 'qty', op: 'gt', value: 0 } },
      ],
      rows: [
        { key: 'mv0', values: { date: inDays(-3), material: { rowKey: 'm1' }, kind: 'Приход', qty: 500, reason: 'Поставка пластика' } },

        { key: 'mv1', values: { date: inDays(-2), material: { rowKey: 'm1' }, kind: 'Производство', qty: -222, production: { rowKey: 'pr1' }, reason: 'Выпуск: Пивной пакет 1 л, 18 500 шт.' } },
        { key: 'mv2', values: { date: inDays(-2), material: { rowKey: 'm2' }, kind: 'Производство', qty: -185, production: { rowKey: 'pr1' }, reason: 'Выпуск: Пивной пакет 1 л, 18 500 шт.' } },
        { key: 'mv3', values: { date: inDays(-2), material: { rowKey: 'm3' }, kind: 'Производство', qty: -5.55, production: { rowKey: 'pr1' }, reason: 'Выпуск: Пивной пакет 1 л, 18 500 шт.' } },
        { key: 'mv4', values: { date: inDays(-2), material: { rowKey: 'm4' }, kind: 'Производство', qty: -1.85, production: { rowKey: 'pr1' }, reason: 'Выпуск: Пивной пакет 1 л, 18 500 шт.' } },

        { key: 'mv5', values: { date: inDays(0), material: { rowKey: 'm1' }, kind: 'Производство', qty: -240, production: { rowKey: 'pr2' }, reason: 'Выпуск: Пивной пакет 1 л, 20 000 шт.' } },
        { key: 'mv6', values: { date: inDays(0), material: { rowKey: 'm2' }, kind: 'Производство', qty: -200, production: { rowKey: 'pr2' }, reason: 'Выпуск: Пивной пакет 1 л, 20 000 шт.' } },
        { key: 'mv7', values: { date: inDays(0), material: { rowKey: 'm3' }, kind: 'Производство', qty: -6, production: { rowKey: 'pr2' }, reason: 'Выпуск: Пивной пакет 1 л, 20 000 шт.' } },
        { key: 'mv8', values: { date: inDays(0), material: { rowKey: 'm4' }, kind: 'Производство', qty: -2, production: { rowKey: 'pr2' }, reason: 'Выпуск: Пивной пакет 1 л, 20 000 шт.' } },
      ],
    },
  ],
}
