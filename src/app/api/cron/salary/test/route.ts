import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const testDate = searchParams.get('date');
    const targetDate = testDate ? new Date(testDate) : new Date();
    const currentDay = targetDate.getDate();

    console.log('Testing salary addition for date:', targetDate.toISOString());

    // 給料日が指定日のユーザーを取得
    const { data: salaries, error: salariesError } = await supabase
      .from('salaries')
      .select('*')
      .eq('payday', currentDay);

    if (salariesError) {
      console.error('Error fetching salaries:', salariesError);
      return NextResponse.json({ error: '給料情報の取得に失敗しました' }, { status: 500 });
    }

    console.log('Found salaries:', salaries);

    // 各ユーザーの給料を処理
    for (const salary of salaries) {
      const currentDate = new Date(targetDate);
      const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;

      // 個人の予算を更新
      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', salary.user_id)
        .eq('month', currentMonth)
        .single();

      if (budgetError && budgetError.code !== 'PGRST116') {
        console.error(`Error fetching budget for user ${salary.user_id}:`, budgetError);
        continue;
      }

      // 予算がなければ作成、あれば加算
      const { error: upsertError } = await supabase
        .from('budgets')
        .upsert({
          user_id: salary.user_id,
          month: currentMonth,
          amount: (budgetData?.amount || 0) + salary.amount
        });

      if (upsertError) {
        console.error(`Error updating personal budget for user ${salary.user_id}:`, upsertError);
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
        // グループの現在の月の予算を取得
        const { data: groupBudget, error: groupBudgetError } = await supabase
          .from('group_budgets')
          .select('*')
          .eq('group_id', member.group_id)
          .eq('month', currentMonth)
          .single();

        if (groupBudgetError && groupBudgetError.code !== 'PGRST116') {
          console.error(`Error fetching group budget for group ${member.group_id}:`, groupBudgetError);
          continue;
        }

        // グループ予算がなければ作成、あれば加算
        const { error: upsertError } = await supabase
          .from('group_budgets')
          .upsert({
            group_id: member.group_id,
            month: currentMonth,
            amount: (groupBudget?.amount || 0) + salary.amount
          });

        if (upsertError) {
          console.error(`Error updating group budget for group ${member.group_id}:`, upsertError);
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
          date: targetDate.toISOString().split('T')[0],
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
          date: targetDate.toISOString()
        });

      if (historyError) {
        console.error(`Error recording salary addition for user ${salary.user_id}:`, historyError);
      }

      // 最終支払日を更新
      const { error: updateError } = await supabase
        .from('salaries')
        .update({ last_paid: targetDate.toISOString().split('T')[0] })
        .eq('id', salary.id);

      if (updateError) {
        console.error(`Error updating last_paid for salary ${salary.id}:`, updateError);
      }
    }

    return NextResponse.json({
      success: true,
      testDate: targetDate.toISOString(),
      processedSalaries: salaries
    });
  } catch (error) {
    console.error('Error in salary test:', error);
    return NextResponse.json({ error: '内部エラーが発生しました' }, { status: 500 });
  }
} 