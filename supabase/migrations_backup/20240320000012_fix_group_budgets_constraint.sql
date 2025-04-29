-- 既存のユニーク制約を削除
ALTER TABLE group_budgets
DROP CONSTRAINT IF EXISTS group_budgets_group_id_category_key;

-- categoryカラムを削除
ALTER TABLE group_budgets
DROP COLUMN IF EXISTS category;

-- 新しいユニーク制約を追加（group_id, month）
ALTER TABLE group_budgets
ADD CONSTRAINT group_budgets_group_id_month_key 
UNIQUE (group_id, month);

-- budgetsテーブルにユニーク制約を追加（user_id, month）
ALTER TABLE budgets
ADD CONSTRAINT budgets_user_id_month_key 
UNIQUE (user_id, month); 