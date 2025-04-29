-- 既存のポリシーを全て削除
DROP POLICY IF EXISTS "service_role_full_access" ON transactions;
DROP POLICY IF EXISTS "user_read_own_transactions" ON transactions;
DROP POLICY IF EXISTS "user_create_own_transactions" ON transactions;
DROP POLICY IF EXISTS "user_update_own_transactions" ON transactions;
DROP POLICY IF EXISTS "user_delete_own_transactions" ON transactions;
DROP POLICY IF EXISTS "group_member_read_group_transactions" ON transactions;

-- RLSを無効化してから再度有効化（クリーンな状態にする）
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 一時的に全ての操作を許可（テスト用）
CREATE POLICY "allow_all_for_testing" ON transactions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- サービスロール用のポリシー（バックグラウンドジョブ用）
CREATE POLICY "service_role_full_access" ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true); 