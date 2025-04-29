-- 既存のポリシーを全て削除
DROP POLICY IF EXISTS "Enable all access for service role" ON transactions;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON transactions;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON transactions;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON transactions;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON transactions;

-- RLSを無効化してから再度有効化（クリーンな状態にする）
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- サービスロール用のポリシー（バックグラウンドジョブ用）
CREATE POLICY "service_role_full_access" ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 認証済みユーザー用のポリシー
-- 1. 自分の取引の読み取り
CREATE POLICY "user_read_own_transactions" ON transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. 自分の取引の作成
CREATE POLICY "user_create_own_transactions" ON transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. 自分の取引の更新
CREATE POLICY "user_update_own_transactions" ON transactions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. 自分の取引の削除
CREATE POLICY "user_delete_own_transactions" ON transactions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- グループメンバー用のポリシー
-- 5. グループの取引の読み取り（グループメンバーのみ）
CREATE POLICY "group_member_read_group_transactions" ON transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.user_id = auth.uid()
      AND group_members.group_id = transactions.group_id
    )
  ); 