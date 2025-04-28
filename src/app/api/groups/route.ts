import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    // cookies()をawaitでラップ
    const cookieStore = await cookies(); // ←awaitを追加

    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'グループ名は必須です' }, { status: 400 });
    }

    // accessTokenのみで認証（refreshTokenは不要）
    const accessTokenCookie = await cookieStore.get('sb-bsnjmxzypumljbimdlwp-auth-token');
    const accessToken = accessTokenCookie?.value;
    console.log('accessToken', accessToken);

    if (!accessToken) {
      return NextResponse.json({ error: '認証情報が見つかりません' }, { status: 401 });
    }

    // refreshTokenは空文字でOK
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: '',
    });
    // ★ ここで手動でセッションを復元！
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: '',
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('user', user, 'userError', userError);
    if (!user || userError) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert([
        {
          name,
          description,
          created_by: user.id,
        }
      ])
      .select()
      .single();

    if (groupError) {
      throw groupError;
    }

    const { error: memberError } = await supabase
      .from('group_members')
      .insert([
        {
          group_id: Number(group.id),
          user_id: user.id,
          role: 'owner',
        }
      ]);

    if (memberError) {
      console.error('Error adding creator to group_members:', memberError);
    }

    return NextResponse.json(group);
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json({ error: 'グループの作成に失敗しました' }, { status: 500 });
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

    // グループ一覧＋各グループのメンバー（名前付き）も取得
    const { data: groups, error: groupError } = await supabase
      .from('groups')
      .select(`*, members:group_members(user_id, role, user:users(name))`)
      .eq('created_by', user.id);

    if (groupError) {
      throw groupError;
    }

    // メンバーのuser_idとnameを配列で返す
    const groupsWithMembers = groups.map((group) => ({
      ...group,
      members: Array.isArray(group.members)
        ? group.members.map((m: any) => ({
          user_id: m.user_id,
          name: m.user?.name || '',
          role: m.role,
        }))
        : [],
    }));

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
