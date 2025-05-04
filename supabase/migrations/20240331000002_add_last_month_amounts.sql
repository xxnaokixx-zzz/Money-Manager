-- 先月の実績を取得する関数
create or replace function get_last_month_amounts(p_budget_id bigint)
returns table (
  category_id bigint,
  amount numeric
) language plpgsql as $$
declare
  v_month date;
  v_user_id uuid;
begin
  -- 予算の月とユーザーIDを取得
  select month, user_id into v_month, v_user_id
  from budgets
  where id = p_budget_id;

  -- 先月の日付を計算
  v_month := v_month - interval '1 month';

  -- 先月の各カテゴリーの実績を取得
  return query
  select
    t.category_id,
    sum(t.amount) as amount
  from transactions t
  where t.user_id = v_user_id
    and t.type = 'expense'
    and date_trunc('month', t.date) = date_trunc('month', v_month)
  group by t.category_id;
end;
$$; 