-- 予算が設定されていないグループに対して初期予算を作成
INSERT INTO group_budgets (group_id, amount, month)
SELECT 
  g.id,
  0,  -- デフォルトの予算額を0に設定
  date_trunc('month', CURRENT_DATE)::DATE
FROM groups g
LEFT JOIN group_budgets gb ON 
  g.id = gb.group_id AND 
  gb.month = date_trunc('month', CURRENT_DATE)::DATE
WHERE gb.id IS NULL; 