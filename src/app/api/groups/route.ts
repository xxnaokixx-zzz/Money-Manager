import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

interface GroupMember {
  user_id: string;
  role: string;
  user?: {
    name: string;
  };
}

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // セッションを取得
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error('Session error:', sessionError);
      return NextResponse.json({ error: '認証エラーが発生しました' }, { status: 401 });
    }

    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'グループ名は必須です' }, { status: 400 });
    }

    // トランザクションを開始
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert([
        {
          name,
          description,
          created_by: session.user.id,
        }
      ])
      .select()
      .single();

    if (groupError) {
      console.error('Group creation error:', groupError);
      return NextResponse.json({
        error: 'グループの作成に失敗しました',
        details: groupError.message
      }, { status: 500 });
    }

    if (!group) {
      return NextResponse.json({
        error: 'グループの作成に失敗しました',
        details: 'グループデータが返されませんでした'
      }, { status: 500 });
    }

    const { error: memberError } = await supabase
      .from('group_members')
      .insert([
        {
          group_id: Number(group.id),
          user_id: session.user.id,
          role: 'owner',
        }
      ]);

    if (memberError) {
      console.error('Member addition error:', memberError);
      // グループ作成をロールバック
      await supabase
        .from('groups')
        .delete()
        .eq('id', group.id);

      return NextResponse.json({
        error: 'メンバーの追加に失敗しました',
        details: memberError.message
      }, { status: 500 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({
      error: '予期せぬエラーが発生しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const accessTokenCookie = await cookieStore.get('sb-bsnjmxzypumljbimdlwp-auth-token');
    const accessToken = accessTokenCookie?.value;

    if (!accessToken) {
      return NextResponse.json({ error: '認証情報が見つかりません' }, { status: 401 });
    }

    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: '',
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!user || userError) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // グループ一覧＋作成者情報とメンバー情報を取得
    const { data: groups, error: groupError } = await supabase
      .from('groups')
      .select(`
        *,
        creator:users!groups_created_by_fkey(name),
        members:group_members(user_id, role, user:users(name))
      `)
      .eq('created_by', user.id);

    if (groupError) {
      throw groupError;
    }

    // メンバーのuser_idとnameを配列で返す（作成者を含む）
    const groupsWithMembers = groups.map((group) => {
      // group.membersから作成者を除外
      const otherMembers = Array.isArray(group.members)
        ? group.members.filter((m: GroupMember) => m.user_id !== group.created_by).map((m: GroupMember) => ({
          user_id: m.user_id,
          name: m.user?.name || '',
          role: m.role,
        }))
        : [];

      return {
        ...group,
        members: [
          // 作成者を管理者として追加
          {
            user_id: group.created_by,
            name: group.creator?.name || '',
            role: 'owner'
          },
          ...otherMembers
        ],
      };
    });

    return NextResponse.json(groupsWithMembers);
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json({ error: 'グループの取得に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const accessTokenCookie = await cookieStore.get('sb-bsnjmxzypumljbimdlwp-auth-token');
    const accessToken = accessTokenCookie?.value;

    if (!accessToken) {
      return NextResponse.json({ error: '認証情報が見つかりません' }, { status: 401 });
    }

    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: '',
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!user || userError) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { groupId } = await request.json();
    if (!groupId) {
      return NextResponse.json({ error: 'グループIDが必要です' }, { status: 400 });
    }

    // まず group_members を削除
    await supabase.from('group_members').delete().eq('group_id', groupId);

    // 次にグループ本体を削除
    const { error: groupError } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId)
      .eq('created_by', user.id);

    if (groupError) {
      throw groupError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json({ error: 'グループの削除に失敗しました' }, { status: 500 });
  }
}
