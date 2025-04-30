import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

    // 給与情報を取得
    const { data: salaries, error: salariesError } = await supabase
      .from('salaries')
      .select('*')
      .eq('payday', today.getDate());

    if (salariesError) {
      console.error('Error fetching salaries:', salariesError);
      return NextResponse.json({ error: '給与情報の取得に失敗しました' }, { status: 500 });
    }

    if (!salaries || salaries.length === 0) {
      return NextResponse.json({ message: '今日は給与支給日ではありません' });
    }

    // 各ユーザーの給与を並列処理で処理
    const results = await Promise.allSettled(
      salaries.map(async (salary) => {
        try {
          // 個人の予算を更新
          const { data: budgetData, error: budgetError } = await supabase
            .from('budgets')
            .select('*')
            .eq('user_id', salary.user_id)
            .eq('month', currentMonth)
            .single();

          if (budgetError && budgetError.code !== 'PGRST116') {
            throw budgetError;
          }

          const { error: upsertError } = await supabase
            .from('budgets')
            .upsert({
              user_id: salary.user_id,
              month: currentMonth,
              amount: (budgetData?.amount || 0) + salary.amount
            });

          if (upsertError) throw upsertError;

          // グループの予算を更新
          const { data: groupMembers, error: groupMembersError } = await supabase
            .from('group_members')
            .select('group_id')
            .eq('user_id', salary.user_id);

          if (groupMembersError) throw groupMembersError;

          // グループ予算の更新を並列処理
          await Promise.allSettled(
            groupMembers.map(async (member) => {
              const { error: groupRpcError } = await supabase.rpc('increment_group_budget', {
                p_amount: salary.amount,
                p_group_id: member.group_id
              });
              if (groupRpcError) throw groupRpcError;
            })
          );

          // 取引履歴に給与を追加
          const { error: transactionError } = await supabase
            .from('transactions')
            .insert({
              user_id: salary.user_id,
              amount: salary.amount,
              type: 'income',
              category_id: 1,
              date: today.toISOString(),
              description: '給与'
            });

          if (transactionError) throw transactionError;

          // 給料加算履歴を記録
          const { error: historyError } = await supabase
            .from('salary_additions')
            .insert({
              user_id: salary.user_id,
              amount: salary.amount,
              date: today.toISOString()
            });

          if (historyError) throw historyError;

          return { success: true, userId: salary.user_id };
        } catch (error) {
          console.error(`Error processing salary for user ${salary.user_id}:`, error);
          return { success: false, userId: salary.user_id, error };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

    return NextResponse.json({
      message: `処理完了: ${successful}件成功, ${failed}件失敗`,
      details: results
    });

  } catch (error) {
    console.error('Error in salary cron job:', error);
    return NextResponse.json({
      error: '内部エラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 