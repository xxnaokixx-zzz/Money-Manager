import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // group_budgetsテーブルのデータを削除
    const { error } = await supabase
      .from('group_budgets')
      .delete()
      .neq('id', 0); // 全レコードを削除

    if (error) {
      throw error;
    }

    return NextResponse.json({ message: 'Group budgets reset successfully' });
  } catch (error) {
    console.error('Error resetting group budgets:', error);
    return NextResponse.json(
      { error: 'Failed to reset group budgets' },
      { status: 500 }
    );
  }
} 