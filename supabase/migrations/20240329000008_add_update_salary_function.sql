-- 給与情報を更新する関数を作成
CREATE OR REPLACE FUNCTION update_salary(
  p_user_id UUID,
  p_group_id BIGINT,
  p_amount INTEGER,
  p_payday INTEGER,
  p_last_paid DATE
) RETURNS TABLE (
  id BIGINT,
  user_id UUID,
  group_id BIGINT,
  amount INTEGER,
  payday INTEGER,
  last_paid DATE
) AS $$
DECLARE
  v_salary_id BIGINT;
BEGIN
  -- トランザクション内で実行
  -- 1. 給与情報をupsert
  INSERT INTO salaries (user_id, group_id, amount, payday, last_paid)
  VALUES (p_user_id, p_group_id, p_amount, p_payday, p_last_paid)
  ON CONFLICT (user_id, group_id) DO UPDATE
  SET amount = EXCLUDED.amount,
      payday = EXCLUDED.payday,
      last_paid = EXCLUDED.last_paid
  RETURNING id INTO v_salary_id;

  -- 2. group_membersのsalary_idを更新
  UPDATE group_members
  SET salary_id = v_salary_id
  WHERE user_id = p_user_id
  AND group_id = p_group_id;

  -- 3. 更新された給与情報を返す
  RETURN QUERY
  SELECT s.id, s.user_id, s.group_id, s.amount, s.payday, s.last_paid
  FROM salaries s
  WHERE s.id = v_salary_id;
END;
$$ LANGUAGE plpgsql; 