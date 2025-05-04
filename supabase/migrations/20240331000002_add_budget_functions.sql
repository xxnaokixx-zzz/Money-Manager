-- 月次収支サマリーを取得する関数
CREATE OR REPLACE FUNCTION get_monthly_summary(
  p_user_id uuid,
  p_month date
) RETURNS TABLE (
  category_id integer,
  category_name text,
  total_amount integer,
  budget_amount integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.category_id,
    c.name as category_name,
    SUM(t.amount) as total_amount,
    b.amount as budget_amount
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN budgets b ON b.user_id = t.user_id 
    AND b.month = date_trunc('month', p_month)
  WHERE t.user_id = p_user_id
    AND date_trunc('month', t.date) = date_trunc('month', p_month)
  GROUP BY t.category_id, c.name, b.amount;
END;
$$ LANGUAGE plpgsql; 