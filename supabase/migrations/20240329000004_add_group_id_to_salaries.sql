-- salariesテーブルにgroup_idカラムを追加
ALTER TABLE salaries
ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE;

-- ユニーク制約を更新（user_idとgroup_idの組み合わせでユニークに）
ALTER TABLE salaries
DROP CONSTRAINT IF EXISTS salaries_user_id_key;

ALTER TABLE salaries
ADD CONSTRAINT salaries_user_id_group_id_key UNIQUE (user_id, group_id);

-- RLSポリシーの更新
DROP POLICY IF EXISTS "enable_salary_access" ON salaries;
CREATE POLICY "enable_salary_access" ON salaries
FOR ALL TO authenticated
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.user_id = auth.uid()
    AND group_members.group_id = salaries.group_id
  )
)
WITH CHECK (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.user_id = auth.uid()
    AND group_members.group_id = salaries.group_id
    AND group_members.role = 'owner'
  )
); 