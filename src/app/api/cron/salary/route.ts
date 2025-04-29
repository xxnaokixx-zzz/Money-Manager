import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const today = new Date();
    const currentDay = today.getDate();

    // 給料日が今日のユーザーを取得
    const { data: salaries, error: salariesError } = await supabase
      .from('salaries')
      .select('*')
      .eq('payday', currentDay);

    if (salariesError) {
      console.error('Error fetching salaries:', salariesError);
      return NextResponse.json({ error: '給料情報の取得に失敗しました' }, { status: 500 });
    }

    // 各ユーザーの給料を予算に加算
    for (const salary of salaries) {
      // 個人の予算を更新
      const { error: personalBudgetError } = await supabase
        .from('budgets')
        .update({
          amount: supabase.rpc('increment_budget', {
            p_amount: salary.amount,
            p_user_id: salary.user_id
          })
        })
        .eq('user_id', salary.user_id);

      if (personalBudgetError) {
        console.error(`Error updating personal budget for user ${salary.user_id}:`, personalBudgetError);
        continue;
      }

      // グループの予算を更新
      const { data: groupMembers, error: groupMembersError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', salary.user_id);

      if (groupMembersError) {
        console.error(`Error fetching group members for user ${salary.user_id}:`, groupMembersError);
        continue;
      }

      for (const member of groupMembers) {
        const { error: groupBudgetError } = await supabase
          .from('group_budgets')
          .update({
            amount: supabase.rpc('increment_budget', {
              p_amount: salary.amount,
              p_group_id: member.group_id
            })
          })
          .eq('group_id', member.group_id);

        if (groupBudgetError) {
          console.error(`Error updating group budget for group ${member.group_id}:`, groupBudgetError);
          continue;
        }
      }

      // 取引履歴に給与を追加
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: salary.user_id,
          amount: salary.amount,
          type: 'income',
          category_id: 1, // 給与のカテゴリーID
          date: today.toISOString(),
          description: '給与'
        });

      if (transactionError) {
        console.error(`Error adding transaction for user ${salary.user_id}:`, transactionError);
        continue;
      }

      // 給料加算履歴を記録
      const { error: historyError } = await supabase
        .from('salary_additions')
        .insert({
          user_id: salary.user_id,
          amount: salary.amount,
          date: today.toISOString()
        });

      if (historyError) {
        console.error(`Error recording salary addition for user ${salary.user_id}:`, historyError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in salary cron job:', error);
    return NextResponse.json({ error: '内部エラーが発生しました' }, { status: 500 });
  }
} 