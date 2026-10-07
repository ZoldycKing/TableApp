-- Индексы, которые не выражаются через схему Drizzle.

-- Поиск строк по содержимому JSONB (фильтры вида «поле содержит значение»).
CREATE INDEX IF NOT EXISTS rows_data_gin ON "rows" USING gin (data jsonb_path_ops);

-- Основной путь чтения таблицы: живые строки в порядке позиции.
-- Частичный индекс не тратит место на содержимое корзины.
CREATE INDEX IF NOT EXISTS rows_table_live_idx ON "rows" (table_id, position)
  WHERE deleted_at IS NULL;

-- Журнал изменений читается «последние сверху» на конкретной строке.
CREATE INDEX IF NOT EXISTS row_changes_recent_idx ON row_changes (row_id, created_at DESC);
