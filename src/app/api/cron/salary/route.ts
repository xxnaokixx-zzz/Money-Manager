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

    console.log(`Found ${salaries?.length || 0} salaries for day ${currentDay}`);

    // 各ユーザーの給料を予算に加算
    for (const salary of salaries) {
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      console.log(`Processing salary: Amount=${salary.amount}, User ID=${salary.user_id}, Month=${currentMonth}`);

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

      console.log(`Found ${groupMembers?.length || 0} groups for user ${salary.user_id}`);

      for (const member of groupMembers) {
        console.log(`Processing group: Group ID=${member.group_id}, User ID=${salary.user_id}, Amount=${salary.amount}`);

        const { data: newGroupAmount, error: groupRpcError } = await supabase.rpc('increment_group_budget', {
          p_amount: salary.amount,
          p_group_id: member.group_id
        });

        if (groupRpcError) {
          console.error(`Error calling increment_group_budget for group ${member.group_id}:`, groupRpcError);
          continue;
        }

        console.log(`Group budget updated: Group ID=${member.group_id}, New Amount=${newGroupAmount}`);

        console.log(`Group budget update complete: Group ID=${member.group_id}`);
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
    return NextResponse.json({
      error: '内部エラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 