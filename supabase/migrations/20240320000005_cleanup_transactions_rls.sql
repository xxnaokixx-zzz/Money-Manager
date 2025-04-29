-- 既存の全てのポリシーを削除
DROP POLICY IF EXISTS "Users can view their own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert their own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete their own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow user to access own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow group members to access transactions" ON transactions;
DROP POLICY IF EXISTS "service_role_full_access" ON transactions;
DROP POLICY IF EXISTS "user_read_own_transactions" ON transactions;
DROP POLICY IF EXISTS "user_create_own_transactions" ON transactions;
DROP POLICY IF EXISTS "user_update_own_transactions" ON transactions;
DROP POLICY IF EXISTS "user_delete_own_transactions" ON transactions;
DROP POLICY IF EXISTS "group_member_read_group_transactions" ON transactions;

-- RLSをリセット
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- サービスロール用のポリシー（バックグラウンドジョブ用）
CREATE POLICY "service_role_full_access" ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 個人用のポリシー
CREATE POLICY "personal_transactions" ON transactions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- グループ用のポリシー
CREATE POLICY "group_transactions" ON transactions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.user_id = auth.uid()
      AND group_members.group_id = transactions.group_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.user_id = auth.uid()
      AND group_members.group_id = transactions.group_id
    )
  ); 