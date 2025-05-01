-- グループ作成時に予算を自動作成する関数
CREATE OR REPLACE FUNCTION create_initial_group_budget()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO group_budgets (group_id, amount, month)
  VALUES (NEW.id, 0, date_trunc('month', CURRENT_DATE)::DATE);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating initial budget: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの作成
DROP TRIGGER IF EXISTS create_group_budget_trigger ON groups;
CREATE TRIGGER create_group_budget_trigger
  AFTER INSERT ON groups
  FOR EACH ROW
  EXECUTE FUNCTION create_initial_group_budget(); 