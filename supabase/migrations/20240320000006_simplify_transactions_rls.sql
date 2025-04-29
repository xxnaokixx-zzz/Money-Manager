-- 既存の全てのポリシーを削除
DROP POLICY IF EXISTS "service_role_full_access" ON transactions;
DROP POLICY IF EXISTS "personal_transactions" ON transactions;
DROP POLICY IF EXISTS "group_transactions" ON transactions;

-- RLSをリセット
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 最も基本的なポリシーを追加
CREATE POLICY "enable_all_access" ON transactions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- サービスロール用のポリシー
CREATE POLICY "service_role_access" ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true); 