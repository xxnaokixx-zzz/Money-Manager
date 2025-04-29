-- 給料加算履歴テーブルを作成
CREATE TABLE IF NOT EXISTS salary_additions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 予算加算関数を作成
CREATE OR REPLACE FUNCTION increment_budget(p_amount INTEGER, p_user_id UUID DEFAULT NULL, p_group_id INTEGER DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  current_amount INTEGER;
BEGIN
  IF p_user_id IS NOT NULL THEN
    -- 個人の予算を更新
    SELECT amount INTO current_amount
    FROM budgets
    WHERE user_id = p_user_id;

    IF current_amount IS NULL THEN
      INSERT INTO budgets (user_id, amount)
      VALUES (p_user_id, p_amount);
      RETURN p_amount;
    ELSE
      UPDATE budgets
      SET amount = amount + p_amount
      WHERE user_id = p_user_id;
      RETURN current_amount + p_amount;
    END IF;
  ELSIF p_group_id IS NOT NULL THEN
    -- グループの予算を更新
    SELECT amount INTO current_amount
    FROM group_budgets
    WHERE group_id = p_group_id;

    IF current_amount IS NULL THEN
      INSERT INTO group_budgets (group_id, amount)
      VALUES (p_group_id, p_amount);
      RETURN p_amount;
    ELSE
      UPDATE group_budgets
      SET amount = amount + p_amount
      WHERE group_id = p_group_id;
      RETURN current_amount + p_amount;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql; 