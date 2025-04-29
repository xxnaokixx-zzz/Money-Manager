-- categoriesテーブルを作成
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 基本的な支出カテゴリーを追加
INSERT INTO categories (name, type) VALUES
  ('食費', 'expense'),
  ('交通費', 'expense'),
  ('住居費', 'expense'),
  ('光熱費', 'expense'),
  ('通信費', 'expense'),
  ('娯楽費', 'expense'),
  ('医療費', 'expense'),
  ('教育費', 'expense'),
  ('被服費', 'expense'),
  ('その他', 'expense')
ON CONFLICT (name) DO NOTHING;

-- 基本的な収入カテゴリーを追加
INSERT INTO categories (name, type) VALUES
  ('給与', 'income'),
  ('賞与', 'income'),
  ('副業', 'income'),
  ('投資', 'income'),
  ('その他', 'income')
ON CONFLICT (name) DO NOTHING;

-- categoriesテーブルのRLSを設定
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーはカテゴリーを参照可能
CREATE POLICY "enable_read_access" ON categories
  FOR SELECT
  TO authenticated
  USING (true);

-- サービスロールは全ての操作が可能
CREATE POLICY "service_role_access" ON categories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true); 