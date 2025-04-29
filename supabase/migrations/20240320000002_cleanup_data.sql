-- 異常に高額な取引を削除
DELETE FROM transactions
WHERE amount > 10000000; -- 1000万円以上の取引を削除

-- 給与テーブルに金額の上限を設定
ALTER TABLE salaries
ADD CONSTRAINT salary_amount_max_check
CHECK (amount <= 10000000); -- 1000万円を上限に設定

-- 取引テーブルに金額の上限を設定
ALTER TABLE transactions
ADD CONSTRAINT transaction_amount_max_check
CHECK (amount <= 10000000); -- 1000万円を上限に設定 