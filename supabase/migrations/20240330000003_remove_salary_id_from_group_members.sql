-- group_membersテーブルからsalary_idカラムを削除
ALTER TABLE group_members
DROP CONSTRAINT IF EXISTS group_members_salary_id_fkey;
 
ALTER TABLE group_members
DROP COLUMN IF EXISTS salary_id; 