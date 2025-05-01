-- 既存の給与情報にグループIDを設定
UPDATE salaries s
SET group_id = gm.group_id
FROM group_members gm
WHERE s.id = gm.salary_id
AND s.group_id IS NULL;

-- 給与情報が設定されている場合のみgroup_membersのsalary_idを設定
UPDATE group_members gm
SET salary_id = s.id
FROM salaries s
WHERE s.user_id = gm.user_id
AND s.group_id = gm.group_id
AND gm.salary_id IS NULL; 