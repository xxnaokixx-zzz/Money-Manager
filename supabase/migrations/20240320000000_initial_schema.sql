-- 基本的なテーブル構造を作成

-- カテゴリーテーブルを作成
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- グループテーブルを作成
CREATE TABLE IF NOT EXISTS groups (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- グループメンバーテーブルを作成
CREATE TABLE IF NOT EXISTS group_members (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- トランザクションテーブルを作成
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id INTEGER REFERENCES categories(id),
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- グループ予算テーブルを作成
CREATE TABLE IF NOT EXISTS group_budgets (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  month DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id, month)
);

-- 個人予算テーブルを作成
CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  month DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- 給与テーブルを作成
CREATE TABLE IF NOT EXISTS salaries (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000000),
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
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 基本的なカテゴリーを追加
INSERT INTO categories (name, type) VALUES
  ('給与', 'income'),
  ('賞与', 'income'),
  ('副業', 'income'),
  ('投資', 'income'),
  ('その他収入', 'income'),
  ('食費', 'expense'),
  ('交通費', 'expense'),
  ('住居費', 'expense'),
  ('光熱費', 'expense'),
  ('通信費', 'expense'),
  ('娯楽費', 'expense'),
  ('医療費', 'expense'),
  ('教育費', 'expense'),
  ('被服費', 'expense'),
  ('その他支出', 'expense')
ON CONFLICT (name) DO NOTHING;

-- RLSの設定
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_additions ENABLE ROW LEVEL SECURITY;

-- カテゴリーのRLSポリシー
CREATE POLICY "enable_read_access" ON categories
  FOR SELECT TO authenticated USING (true);

-- トランザクションのRLSポリシー
CREATE POLICY "個人またはグループメンバーのみアクセス可能" ON transactions
  FOR ALL
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.user_id = auth.uid()
      AND group_members.group_id = transactions.group_id
    )
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.user_id = auth.uid()
      AND group_members.group_id = transactions.group_id
    )
  );

-- グループのRLSポリシー
CREATE POLICY "enable_group_access" ON groups
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.user_id = auth.uid()
      AND group_members.group_id = groups.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.user_id = auth.uid()
      AND group_members.group_id = groups.id
      AND group_members.role = 'owner'
    )
  );

-- グループメンバーのRLSポリシー
CREATE POLICY "グループ作成者は自分をメンバーとして追加可能" ON group_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND groups.created_by = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'owner'
    )
  );

CREATE POLICY "グループメンバーは他のメンバーを閲覧可能" ON group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "グループ管理者のみメンバー情報を更新可能" ON group_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'owner'
    )
  );

CREATE POLICY "グループ管理者のみメンバーを削除可能" ON group_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'owner'
    )
  );

-- グループ予算のRLSポリシー
CREATE POLICY "enable_group_budget_access" ON group_budgets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.user_id = auth.uid()
      AND group_members.group_id = group_budgets.group_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.user_id = auth.uid()
      AND group_members.group_id = group_budgets.group_id
      AND group_members.role = 'owner'
    )
  );

-- 個人予算のRLSポリシー
CREATE POLICY "enable_budget_access" ON budgets
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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