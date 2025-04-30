import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // 給与関連の取引を削除（description = '給与'）
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('description', '給与');

    if (error) {
      throw error;
    }

    return NextResponse.json({ message: 'Salary transactions reset successfully' });
  } catch (error) {
    console.error('Error resetting salary transactions:', error);
    return NextResponse.json(
      { error: 'Failed to reset salary transactions' },
      { status: 500 }
    );
  }
} 