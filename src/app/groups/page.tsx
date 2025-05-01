"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';

interface GroupMember {
  user_id: string;
  name: string;
  role: string;
}

interface Group {
  id: number;
  name: string;
  description: string;
  created_at: string;
  created_by: string | null;
  members: GroupMember[];
  creator?: {
    name: string;
  };
}

interface RawGroupMember {
  user_id: string;
  role: string;
  user?: {
    name: string;
  };
}

interface RawGroup {
  id: number;
  name: string;
  description: string;
  created_at: string;
  created_by: string;
  creator?: {
    name: string;
  };
  members: RawGroupMember[];
}

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push('/login');
          return;
        }

        const { data, error } = await supabase
          .from('groups')
          .select(`
            *,
            creator:users!groups_created_by_fkey(name),
            members:group_members(user_id, role, user:users(name))
          `)
          .eq('created_by', session.user.id);

        if (error) throw error;

        const formattedGroups: Group[] = (data as RawGroup[]).map((group) => {
          const otherMembers = Array.isArray(group.members)
            ? group.members.filter((m: RawGroupMember) => m.user_id !== group.created_by).map((m: RawGroupMember) => ({
              user_id: m.user_id,
              name: m.user?.name || '',
              role: m.role,
            }))
            : [];

          return {
            ...group,
            members: [
              {
                user_id: group.created_by,
                name: group.creator?.name || '',
                role: 'owner'
              },
              ...otherMembers
            ],
          };
        });

        setGroups(formattedGroups);
      } catch (err) {
        console.error('Error fetching groups:', err);
        setError('グループの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [router]);

  const handleDeleteGroup = async (groupId: number) => {
    if (!window.confirm('本当にこのグループを削除しますか？')) {
      return;
    }

    setDeletingGroupId(groupId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('認証エラーが発生しました');
      }

      // まずメンバーを削除
      const { error: memberError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId);

      if (memberError) {
        throw memberError;
      }

      // 次にグループを削除
      const { error: groupError } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId)
        .eq('created_by', session.user.id);

      if (groupError) {
        throw groupError;
      }

      // 成功したら、グループリストから削除
      setGroups(groups.filter(g => g.id !== groupId));
    } catch (error) {
      console.error('Error deleting group:', error);
      setError('グループの削除に失敗しました');
    } finally {
      setDeletingGroupId(null);
    }
  };

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                個人画面に戻る
              </Link>
              <h1 className="text-2xl font-bold text-gray-800">グループ一覧</h1>
            </div>
            <Link
              href="/groups/new"
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新しいグループを作成
            </Link>
          </div>

          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">グループがありません</p>
              <Link
                href="/groups/new"
                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                最初のグループを作成
              </Link>
            </div>
          ) : (
            <div className="grid gap-6">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-800">{group.name}</h2>
                      {group.description && (
                        <p className="text-gray-600 mt-1">{group.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/groups/${group.id}`}
                        className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        詳細を見る
                      </Link>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        disabled={deletingGroupId === group.id}
                        className="inline-flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingGroupId === group.id ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            削除中...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            削除
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    <p>作成日: {new Date(group.created_at).toLocaleDateString()}</p>
                    <p className="mt-1">
                      メンバー: {group.members.length}人
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
} 