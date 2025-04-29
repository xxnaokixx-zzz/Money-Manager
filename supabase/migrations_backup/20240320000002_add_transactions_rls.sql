-- transactionsテーブルのRLSを有効化
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- サービスロール用のポリシーを追加
CREATE POLICY "Enable all access for service role" ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 認証済みユーザー用のポリシーを追加
CREATE POLICY "Enable read access for authenticated users" ON transactions
  FOR SELECT
  TO authenticated
  USING (true);

-- ユーザーが自分の取引のみを挿入・更新・削除できるポリシーを追加
CREATE POLICY "Enable insert for authenticated users" ON transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable update for authenticated users" ON transactions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable delete for authenticated users" ON transactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id); 