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
      // 個人の予算を更新
      const { data: budgetData, error: personalBudgetError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', salary.user_id)
        .single();

      if (!personalBudgetError) {
        const newAmount = (budgetData?.amount || 0) + salary.amount;
        const { error: updateError } = await supabase
          .from('budgets')
          .upsert({
            user_id: salary.user_id,
            amount: newAmount
          });

        if (updateError) {
          console.error(`Error updating personal budget for user ${salary.user_id}:`, updateError);
        }
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
        const { data: groupBudget, error: groupBudgetError } = await supabase
          .from('group_budgets')
          .select('*')
          .eq('group_id', member.group_id)
          .single();

        if (!groupBudgetError) {
          const newAmount = (groupBudget?.amount || 0) + salary.amount;
          const { error: updateError } = await supabase
            .from('group_budgets')
            .upsert({
              group_id: member.group_id,
              amount: newAmount,
              category: 'all'
            });

          if (updateError) {
            console.error(`Error updating group budget for group ${member.group_id}:`, updateError);
          }
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