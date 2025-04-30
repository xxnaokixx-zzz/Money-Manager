import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // 認証状態を確認
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      console.error('Authentication error:', authError);
      return new NextResponse(
        JSON.stringify({ error: '認証エラーが発生しました' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
          },
        }
      );
    }

    // テスト用に日付を5月1日に固定
    const today = new Date('2025-05-01');

    // 給与情報を取得
    const { data: salaries, error: salariesError } = await supabase
      .from('salaries')
      .select('*')
      .eq('payday', today.getDate())
      .not('group_id', 'is', null);

    if (salariesError) {
      console.error('Error fetching salaries:', salariesError);
      return new NextResponse(
        JSON.stringify({ error: '給与情報の取得に失敗しました' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
          },
        }
      );
    }

    if (!salaries || salaries.length === 0) {
      return new NextResponse(
        JSON.stringify({ message: '今日は給与支給日ではありません' }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
          },
        }
      );
    }

    // 各ユーザーの給与を並列処理で処理
    const results = await Promise.allSettled(
      salaries.map(async (salary) => {
        try {
          // ストアドプロシージャを呼び出し
          const { error: rpcError } = await supabase.rpc('add_salary', {
            p_user_id: salary.user_id,
            p_group_id: salary.group_id,
            p_amount: salary.amount,
            p_date: today.toISOString().split('T')[0]
          });

          if (rpcError) throw rpcError;

          return { success: true, salaryId: salary.id };
        } catch (error) {
          console.error(`Error processing salary ${salary.id}:`, error);
          return { success: false, salaryId: salary.id, error };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

    return new NextResponse(
      JSON.stringify({
        message: `処理完了: ${successful}件成功, ${failed}件失敗`,
        details: results
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      }
    );

  } catch (error) {
    console.error('Error in salary cron job:', error);
    return new NextResponse(
      JSON.stringify({
        error: '内部エラーが発生しました',
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      }
    );
  }
} 