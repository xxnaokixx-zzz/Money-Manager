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
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 日付でユニーク制約を作成
CREATE UNIQUE INDEX salary_additions_user_date_idx ON salary_additions (user_id, date);

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
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'salaries' AND policyname = 'enable_salary_access'
  ) THEN
    EXECUTE 'CREATE POLICY "enable_salary_access" ON salaries
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- 給与履歴のRLSポリシー
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'salary_additions' AND policyname = 'enable_salary_additions_access'
  ) THEN
    EXECUTE 'CREATE POLICY "enable_salary_additions_access" ON salary_additions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- 給与処理用のストアドプロシージャを作成
CREATE OR REPLACE FUNCTION process_salary(
  p_user_id UUID,
  p_amount INTEGER,
  p_date DATE,
  p_current_month DATE
) RETURNS void AS $$
DECLARE
  group_record RECORD;
BEGIN
  -- トランザクションを開始
  BEGIN
    -- 重複チェック
    IF EXISTS (
      SELECT 1 FROM salary_additions
      WHERE user_id = p_user_id
      AND date_trunc('day', date) = date_trunc('day', p_date::timestamp)
    ) THEN
      RAISE EXCEPTION 'Salary already added for this day';
    END IF;

    -- 個人の予算を更新
    INSERT INTO budgets (user_id, month, amount)
    VALUES (p_user_id, p_current_month, p_amount)
    ON CONFLICT (user_id, month)
    DO UPDATE SET amount = budgets.amount + p_amount;

    -- グループの予算を更新
    FOR group_record IN
      SELECT group_id FROM group_members WHERE user_id = p_user_id
    LOOP
      -- グループ予算を更新
      INSERT INTO group_budgets (group_id, month, amount)
      VALUES (group_record.group_id, p_current_month, p_amount)
      ON CONFLICT (group_id, month)
      DO UPDATE SET amount = group_budgets.amount + p_amount;

      -- グループの取引履歴に追加
      INSERT INTO transactions (
        user_id,
        group_id,
        amount,
        type,
        category_id,
        date,
        description
      ) VALUES (
        p_user_id,
        group_record.group_id,
        p_amount,
        'income',
        1,
        p_date,
        '給与'
      );
    END LOOP;

    -- 個人の取引履歴に追加
    INSERT INTO transactions (
      user_id,
      amount,
      type,
      category_id,
      date,
      description
    ) VALUES (
      p_user_id,
      p_amount,
      'income',
      1,
      p_date,
      '給与'
    );

    -- 給与履歴に追加
    INSERT INTO salary_additions (
      user_id,
      amount,
      date
    ) VALUES (
      p_user_id,
      p_amount,
      p_date
    );

    -- 最終支払日を更新
    UPDATE salaries
    SET last_paid = p_date
    WHERE user_id = p_user_id;

  EXCEPTION
    WHEN others THEN
      -- エラーが発生した場合はロールバック
      RAISE;
  END;
END;
$$ LANGUAGE plpgsql; 