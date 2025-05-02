-- データの整合性を修正
-- 1. group_membersのsalary_idを更新
UPDATE group_members gm
SET salary_id = s.id
FROM salaries s
WHERE s.user_id = gm.user_id
AND gm.salary_id IS NULL;

-- 2. 不要なsalary_idをクリア
UPDATE group_members gm
SET salary_id = NULL
WHERE salary_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM salaries s
  WHERE s.id = gm.salary_id
  AND s.user_id = gm.user_id
);

-- 3. グループ削除時のトリガー関数を作成
CREATE OR REPLACE FUNCTION handle_group_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- group_membersのsalary_idをNULLに設定
  UPDATE group_members
  SET salary_id = NULL
  WHERE group_id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- トリガーを作成（存在しない場合のみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'group_deletion_trigger'
  ) THEN
    CREATE TRIGGER group_deletion_trigger
    BEFORE DELETE ON groups
    FOR EACH ROW
    EXECUTE FUNCTION handle_group_deletion();
  END IF;
END;
$$; 