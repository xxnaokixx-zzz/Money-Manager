import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

export async function POST(request: Request, props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { category, amount } = await request.json();
    if (!category || !amount) {
      return NextResponse.json(
        { error: 'Category and amount are required' },
        { status: 400 }
      );
    }

    // グループメンバーであることを確認
    const { data: member, error: memberError } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', params.groupId)
      .eq('user_id', user.id)
      .single();

    if (memberError) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // 予算を作成
    const { data: budget, error: budgetError } = await supabase
      .from('group_budgets')
      .insert({
        group_id: params.groupId,
        category,
        amount,
        created_by: user.id
      })
      .select()
      .single();

    if (budgetError) {
      throw budgetError;
    }

    return NextResponse.json({ budget });
  } catch (error) {
    console.error('Error creating group budget:', error);
    return NextResponse.json(
      { error: 'Failed to create group budget' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request, props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // グループメンバーであることを確認
    const { data: member, error: memberError } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', params.groupId)
      .eq('user_id', user.id)
      .single();

    if (memberError) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // 予算を取得
    const { data: budgets, error } = await supabase
      .from('group_budgets')
      .select(`
        *,
        creator:users(
          id,
          name,
          avatar_url
        )
      `)
      .eq('group_id', params.groupId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ budgets });
  } catch (error) {
    console.error('Error fetching group budgets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch group budgets' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { budgetId } = await request.json();
    if (!budgetId) {
      return NextResponse.json(
        { error: 'Budget ID is required' },
        { status: 400 }
      );
    }

    // グループのオーナーまたは予算の作成者であることを確認
    const { data: member, error: memberError } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', params.groupId)
      .eq('user_id', user.id)
      .single();

    if (memberError) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const { data: budget, error: budgetError } = await supabase
      .from('group_budgets')
      .select('created_by')
      .eq('id', budgetId)
      .single();

    if (budgetError) {
      throw budgetError;
    }

    if (member.role !== 'owner' && budget.created_by !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // 予算を削除
    const { error: deleteError } = await supabase
      .from('group_budgets')
      .delete()
      .eq('id', budgetId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting group budget:', error);
    return NextResponse.json(
      { error: 'Failed to delete group budget' },
      { status: 500 }
    );
  }
} 