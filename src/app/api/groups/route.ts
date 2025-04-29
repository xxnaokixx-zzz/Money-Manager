import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    console.log('Starting group creation...');
    const cookieStore = await cookies();
    console.log('Cookie store:', cookieStore);

    // すべてのクッキーをログ出力
    const allCookies = cookieStore.getAll();
    console.log('All cookies:', allCookies);

    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    console.log('Supabase client created');

    // リクエストヘッダーをすべてログ出力
    const headers = Object.fromEntries(request.headers.entries());
    console.log('Request headers:', headers);

    // リクエストヘッダーから認証トークンを取得
    const authHeader = request.headers.get('Authorization');
    console.log('Auth header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No valid authorization header');
      return NextResponse.json({ error: '認証情報が見つかりません' }, { status: 401 });
    }

    const accessToken = authHeader.split(' ')[1];
    console.log('Access token from header:', accessToken);

    // トークンを直接使用してユーザー情報を取得
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    console.log('User data:', user, 'User error:', userError);

    if (userError || !user) {
      console.error('User authentication error:', userError);
      return NextResponse.json({ error: '認証エラーが発生しました', details: userError?.message }, { status: 401 });
    }

    const { name, description } = await request.json();
    console.log('Request data:', { name, description });

    if (!name) {
      console.log('Name is required');
      return NextResponse.json({ error: 'グループ名は必須です' }, { status: 400 });
    }

    // トランザクションを開始
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

    console.log('Group creation result:', { group, groupError });

    if (groupError) {
      console.error('Group creation error:', groupError);
      return NextResponse.json({
        error: 'グループの作成に失敗しました',
        details: groupError.message,
        code: groupError.code
      }, { status: 500 });
    }

    if (!group) {
      console.error('No group data returned');
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
          user_id: user.id,
          role: 'owner',
        }
      ]);

    console.log('Member addition result:', { memberError });

    if (memberError) {
      console.error('Member addition error:', memberError);
      // グループ作成をロールバック
      await supabase
        .from('groups')
        .delete()
        .eq('id', group.id);

      return NextResponse.json({
        error: 'グループメンバーの追加に失敗しました',
        details: memberError.message,
        code: memberError.code
      }, { status: 500 });
    }

    console.log('Group created successfully');
    return NextResponse.json(group);
  } catch (error) {
    console.error('Error in group creation:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
    return NextResponse.json({
      error: 'グループの作成に失敗しました',
      details: errorMessage
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
    const groupsWithMembers = groups.map((group) => ({
      ...group,
      members: [
        // 作成者を管理者として追加
        {
          user_id: group.created_by,
          name: group.creator?.name || '',
          role: 'owner'
        },
        // その他のメンバーを追加
        ...(Array.isArray(group.members)
          ? group.members.map((m: any) => ({
            user_id: m.user_id,
            name: m.user?.name || '',
            role: m.role,
          }))
          : [])
      ],
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
