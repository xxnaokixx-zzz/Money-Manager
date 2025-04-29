-- 既存のデータを削除（user_idがNULLのデータは不正なため）
DELETE FROM transactions WHERE user_id IS NULL;

-- user_idカラムを必須に変更
ALTER TABLE transactions
  ALTER COLUMN user_id SET NOT NULL; 