-- budgetsテーブルにmonthカラムを追加
ALTER TABLE budgets
ADD COLUMN IF NOT EXISTS month DATE;

-- group_budgetsテーブルにmonthカラムを追加
ALTER TABLE group_budgets
ADD COLUMN IF NOT EXISTS month DATE;

-- 既存のデータを更新（現在の月を設定）
UPDATE budgets
SET month = date_trunc('month', CURRENT_DATE)
WHERE month IS NULL;

UPDATE group_budgets
SET month = date_trunc('month', CURRENT_DATE)
WHERE month IS NULL; 