-- グループ関連のテーブルを削除
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS group_budgets;
DROP TABLE IF EXISTS groups;

-- グループ関連の関数を削除
DROP FUNCTION IF EXISTS update_group_member_salary;
DROP FUNCTION IF EXISTS increment_group_budget;

-- グループ関連のポリシーを削除
DROP POLICY IF EXISTS "グループ管理者のみメンバー情報を更新可能" ON group_members;
DROP POLICY IF EXISTS "グループ管理者のみメンバーを削除可能" ON group_members;
DROP POLICY IF EXISTS "enable_group_budget_access" ON group_budgets; 