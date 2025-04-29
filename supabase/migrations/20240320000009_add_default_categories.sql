-- 既存のデータを確認
SELECT * FROM categories;

-- 基本的なカテゴリーを追加（存在しない場合のみ）
INSERT INTO categories (name, type) VALUES
  ('給与', 'income'),
  ('賞与', 'income'),
  ('副業', 'income'),
  ('投資', 'income'),
  ('その他', 'income'),
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

-- カテゴリーIDを確認
SELECT id, name, type FROM categories ORDER BY type, name; 