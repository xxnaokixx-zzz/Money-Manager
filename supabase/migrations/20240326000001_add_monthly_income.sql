-- usersテーブルにmonthly_incomeカラムを追加
ALTER TABLE auth.users
ADD COLUMN IF NOT EXISTS monthly_income INTEGER DEFAULT 0;

-- RLSポリシーを設定
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- ユーザー自身のみが自分の情報を更新可能
CREATE POLICY "ユーザー自身のみ更新可能" ON auth.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 認証済みユーザーは他のユーザーの情報を閲覧可能
CREATE POLICY "認証済みユーザーは閲覧可能" ON auth.users
  FOR SELECT
  TO authenticated
  USING (true); 