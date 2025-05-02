-- 既存のポリシーを削除
DROP POLICY IF EXISTS "enable_salary_access" ON salaries;
DROP POLICY IF EXISTS "Allow group members to access salaries" ON salaries;
DROP POLICY IF EXISTS "Users can view their own salary" ON salaries;
DROP POLICY IF EXISTS "Users can update their own salary" ON salaries;
DROP POLICY IF EXISTS "Users can delete their own salary" ON salaries;

-- 既存の制約を削除
ALTER TABLE salaries DROP CONSTRAINT IF EXISTS salaries_user_id_key;
ALTER TABLE salaries DROP CONSTRAINT IF EXISTS salaries_user_id_group_id_key;
ALTER TABLE salaries DROP CONSTRAINT IF EXISTS salaries_group_id_fkey;

-- group_idカラムを削除（存在する場合）
ALTER TABLE salaries DROP COLUMN IF EXISTS group_id;

-- user_idのみのユニーク制約を追加
ALTER TABLE salaries ADD CONSTRAINT salaries_user_id_key UNIQUE (user_id);

-- 新しいRLSポリシーを設定
CREATE POLICY "Users can view their own salary"
ON salaries FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own salary"
ON salaries FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own salary"
ON salaries FOR DELETE
USING (auth.uid() = user_id);

-- group_membersテーブルのsalary_idの外部キー制約を更新
ALTER TABLE group_members
DROP CONSTRAINT IF EXISTS group_members_salary_id_fkey,
ADD CONSTRAINT group_members_salary_id_fkey
FOREIGN KEY (salary_id)
REFERENCES salaries(id)
ON DELETE SET NULL; 