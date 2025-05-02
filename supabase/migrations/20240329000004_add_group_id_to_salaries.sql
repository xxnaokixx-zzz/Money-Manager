-- ユニーク制約を更新（user_idのみでユニークに）
ALTER TABLE salaries
DROP CONSTRAINT IF EXISTS salaries_user_id_key;

ALTER TABLE salaries
ADD CONSTRAINT salaries_user_id_key UNIQUE (user_id);

-- RLSポリシーの更新
DROP POLICY IF EXISTS "enable_salary_access" ON salaries;
CREATE POLICY "enable_salary_access" ON salaries
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid()); 