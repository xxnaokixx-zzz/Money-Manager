-- group_membersのsalary_idを更新
UPDATE group_members gm
SET salary_id = s.id
FROM salaries s
WHERE s.user_id = gm.user_id
AND gm.salary_id IS NULL; 