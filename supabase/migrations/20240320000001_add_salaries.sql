-- 給与テーブルを作成
CREATE TABLE IF NOT EXISTS salaries (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payday INTEGER NOT NULL CHECK (payday BETWEEN 1 AND 31),
  last_paid DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 給与履歴テーブルを作成
CREATE TABLE IF NOT EXISTS salary_additions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 個人予算を増加させる関数
CREATE OR REPLACE FUNCTION increment_personal_budget(
  p_amount INTEGER,
  p_user_id UUID
) RETURNS INTEGER AS $$
DECLARE
  current_amount INTEGER;
  current_month DATE;
BEGIN
  current_month := date_trunc('month', CURRENT_DATE)::DATE;
  
  -- 現在の予算を取得
  SELECT amount INTO current_amount
  FROM budgets
  WHERE user_id = p_user_id
  AND month = current_month;

  -- 予算が存在しない場合は新規作成
  IF current_amount IS NULL THEN
    INSERT INTO budgets (user_id, month, amount)
    VALUES (p_user_id, current_month, p_amount)
    RETURNING amount INTO current_amount;
  ELSE
    -- 既存の予算を更新
    UPDATE budgets
    SET amount = amount + p_amount
    WHERE user_id = p_user_id
    AND month = current_month
    RETURNING amount INTO current_amount;
  END IF;

  RETURN current_amount;
END;
$$ LANGUAGE plpgsql;

-- グループ予算を増加させる関数
CREATE OR REPLACE FUNCTION increment_group_budget(
  p_amount INTEGER,
  p_group_id BIGINT
) RETURNS INTEGER AS $$
DECLARE
  current_amount INTEGER;
  current_month DATE;
BEGIN
  current_month := date_trunc('month', CURRENT_DATE)::DATE;
  
  -- 現在の予算を取得
  SELECT amount INTO current_amount
  FROM group_budgets
  WHERE group_id = p_group_id
  AND month = current_month;

  -- 予算が存在しない場合は新規作成
  IF current_amount IS NULL THEN
    INSERT INTO group_budgets (group_id, month, amount)
    VALUES (p_group_id, current_month, p_amount)
    RETURNING amount INTO current_amount;
  ELSE
    -- 既存の予算を更新
    UPDATE group_budgets
    SET amount = amount + p_amount
    WHERE group_id = p_group_id
    AND month = current_month
    RETURNING amount INTO current_amount;
  END IF;

  RETURN current_amount;
END;
$$ LANGUAGE plpgsql;

-- RLSの設定
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_additions ENABLE ROW LEVEL SECURITY;

-- 給与のRLSポリシー
CREATE POLICY "enable_salary_access" ON salaries
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 給与履歴のRLSポリシー
CREATE POLICY "enable_salary_additions_access" ON salary_additions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid()); 