-- group_membersテーブルにsalary_idカラムを追加
ALTER TABLE group_members
ADD COLUMN salary_id BIGINT REFERENCES salaries(id) ON DELETE SET NULL;

-- 既存のメンバーの給与情報を関連付け
UPDATE group_members gm
SET salary_id = s.id
FROM salaries s
WHERE gm.user_id = s.user_id;

-- RLSポリシーの更新
CREATE POLICY "enable_group_members_salary_access" ON group_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'owner'
    )
  ); 