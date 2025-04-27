import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'グループ名は必須です' },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });
    // 認証ユーザーのIDを取得
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    // グループ作成
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert([
        {
          name,
          description,
          created_by: user.id, // ユーザーIDをセット
        }
      ])
      .select()
      .single();

    if (groupError) {
      throw groupError;
    }

    // 作成者を自動でgroup_membersにadminとして追加
    const { error: memberError } = await supabase
      .from('group_members')
      .insert([
        {
          group_id: group.id,
          user_id: user.id,
          role: 'admin',
        }
      ]);
    if (memberError) {
      // グループは作成できているので、member追加失敗だけ通知
      console.error('Error adding creator to group_members:', memberError);
      // ここではエラーをthrowせず、groupだけ返す
    }

    return NextResponse.json(group);
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json(
      { error: 'グループの作成に失敗しました' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    // 認証チェックを削除
    // const { data: { user } } = await supabase.auth.getUser();
    // if (!user) {
    //   return NextResponse.json(
    //     { error: '認証が必要です' },
    //     { status: 401 }
    //   );
    // }
    // グループごとにメンバー（users.name, users.email）をJOINして取得
    const { data: groups, error } = await supabase
      .from('groups')
      .select(`
        *,
        group_members(
          user_id,
          users(name, email)
        )
      `);

    if (error) {
      throw error;
    }

    // 整形: 各グループにmembers配列（ユーザー名 or メールアドレス）を追加
    const groupsWithMembers = groups.map((group: any) => ({
      ...group,
      members: (group.group_members || []).map((gm: any) => gm.users?.name || gm.users?.email || '不明ユーザー'),
    }));

    return NextResponse.json(groupsWithMembers);
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { error: 'グループの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { groupId } = await request.json();
    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
    }
    // 認証ユーザーのIDを取得
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    // グループの作成者またはadminかどうか確認
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, created_by')
      .eq('id', groupId)
      .single();
    if (groupError || !group) {
      return NextResponse.json({ error: 'グループが見つかりません' }, { status: 404 });
    }
    // adminかどうかも確認
    const { data: member, error: memberError } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();
    if (group.created_by !== user.id && (!member || member.role !== 'admin')) {
      return NextResponse.json({ error: '削除権限がありません' }, { status: 403 });
    }
    // まずgroup_membersを削除
    await supabase.from('group_members').delete().eq('group_id', groupId);
    // グループ本体を削除
    const { error: deleteError } = await supabase.from('groups').delete().eq('id', groupId);
    if (deleteError) {
      throw deleteError;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json(
      { error: 'グループの削除に失敗しました' },
      { status: 500 }
    );
  }
} 