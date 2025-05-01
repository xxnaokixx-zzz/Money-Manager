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

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

    // 給与情報を取得
    const { data: salaries, error: salariesError } = await supabase
      .from('salaries')
      .select('*')
      .eq('payday', currentDay);

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

    // 各ユーザーの給与を処理
    const results = await Promise.allSettled(
      salaries.map(async (salary) => {
        try {
          // トランザクションを開始
          const { error: rpcError } = await supabase.rpc('process_salary', {
            p_user_id: salary.user_id,
            p_amount: salary.amount,
            p_date: today.toISOString().split('T')[0],
            p_current_month: currentMonth
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
    console.error('Error in salary processing:', error);
    return new NextResponse(
      JSON.stringify({ error: '内部エラーが発生しました' }),
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