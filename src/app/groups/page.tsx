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
}

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const formattedGroups = data.map((group: any) => ({
          ...group,
          members: [
            {
              user_id: group.created_by,
              name: group.creator?.name || '',
              role: 'owner'
            },
            ...(Array.isArray(group.members)
              ? group.members.map((m: any) => ({
                user_id: m.user_id,
                name: m.user?.name || '',
                role: m.role,
              }))
              : [])
          ],
        }));

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

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800">グループ一覧</h1>
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
                    <Link
                      href={`/groups/${group.id}`}
                      className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      詳細を見る
                    </Link>
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