-- グループメンバーの給与IDを更新する関数を作成
CREATE OR REPLACE FUNCTION update_group_member_salary(
  p_user_id UUID,
  p_group_id BIGINT,
  p_salary_id BIGINT
) RETURNS void AS $$
BEGIN
  -- トランザクション内で実行
  UPDATE group_members
  SET salary_id = p_salary_id
  WHERE user_id = p_user_id
  AND group_id = p_group_id;

  -- 更新が成功したか確認
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group member not found';
  END IF;
END;
$$ LANGUAGE plpgsql; 