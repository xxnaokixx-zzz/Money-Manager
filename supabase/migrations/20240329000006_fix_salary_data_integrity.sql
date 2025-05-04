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

-- 3. グループ削除時の給与情報保持のための関数を作成
CREATE OR REPLACE FUNCTION handle_group_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- グループに紐づく給与情報のgroup_idをNULLに設定
  UPDATE salaries
  SET group_id = NULL
  WHERE group_id = OLD.id;
  
  -- group_membersのレコードは削除されるが、salary_idは保持される
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- グループ削除時のトリガーを作成
DROP TRIGGER IF EXISTS before_group_deletion ON groups;
CREATE TRIGGER before_group_deletion
  BEFORE DELETE ON groups
  FOR EACH ROW
  EXECUTE FUNCTION handle_group_deletion();

-- 4. ロールバック用の処理（必要に応じて実行）
-- UPDATE group_members gm
-- SET salary_id = NULL
-- FROM salaries s
-- WHERE s.user_id = gm.user_id
-- AND s.group_id = gm.group_id
-- AND gm.salary_id = s.id; 