-- transactionsテーブルにcategory_idカラムを追加
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);

-- 既存のcategoryカラムの値をcategory_idに移行
UPDATE transactions t
SET category_id = c.id
FROM categories c
WHERE t.category = c.name;

-- categoryカラムを削除
ALTER TABLE transactions
DROP COLUMN IF EXISTS category; 