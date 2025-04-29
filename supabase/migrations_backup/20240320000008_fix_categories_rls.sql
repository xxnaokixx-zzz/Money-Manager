-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Allow authenticated users to access categories" ON categories;

-- RLSをリセット
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザー用のポリシー
-- カテゴリーは読み取りのみ許可
CREATE POLICY "enable_read_access" ON categories
  FOR SELECT
  TO authenticated
  USING (true);

-- サービスロール用のポリシー
-- バックグラウンドジョブは全ての操作を許可
CREATE POLICY "service_role_access" ON categories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true); 