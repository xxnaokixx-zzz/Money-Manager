'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      fetchGroups();
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading]);

  const fetchGroups = async () => {
    try {
      let headers: Record<string, string> = {};
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const response = await fetch('/api/groups', { headers });
      if (!response.ok) {
        const errorText = await response.text();
        setError(`グループの取得に失敗しました: ${errorText}`);
        return;
      }
      const data = await response.json();
      setGroups(data);
    } catch (error: any) {
      console.error('Error fetching groups:', error);
      setError(error.message || 'グループの取得に失敗しました');
    }
  };

  const handleNavigation = (href: string) => {
    setLoading(true);
    router.push(href);
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!window.confirm('本当にこのグループを削除しますか？この操作は元に戻せません。')) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'グループの削除に失敗しました');
      await fetchGroups();
    } catch (err: any) {
      setError(err.message || 'グループの削除に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div>
          <p>読み込み中...</p>
          <p>authLoading: {String(authLoading)}</p>
        </div>
      </main>
    );
  }

  console.log('user:', user);
  console.log('user.id:', user?.id);

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <button
                onClick={() => handleNavigation('/')}
                className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m-4 0h4" />
                </svg>
                ホームに戻る
              </button>
              <h1 className="text-2xl font-bold text-gray-800">グループ一覧</h1>
            </div>
            <button
              onClick={() => handleNavigation('/groups/new')}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              新しいグループを作成
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map((group) => (
            <div
              key={group.id}
              className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  {group.name}
                </h2>
                {(user && group.created_by === user.id) && (
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="ml-2 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                  >
                    削除
                  </button>
                )}
              </div>
              <div className="mb-2">
                <span className="text-sm font-medium text-gray-700">メンバー:</span>
                {Array.isArray(group.members) && group.members.length > 0 ? (
                  <ul className="list-disc list-inside text-gray-600 mt-1">
                    {group.members.map((member, idx) => (
                      <li key={member.user_id}>
                        {member.name}（{member.role === 'owner' ? '管理者' : 'メンバー'}）
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-gray-400 ml-2">メンバーなし</span>
                )}
                <div className="mt-2">
                  <Link
                    href={`/groups/${group.id}/members/new`}
                    className="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 text-sm"
                  >
                    メンバーを追加
                  </Link>
                </div>
              </div>
              {group.description && (
                <p className="text-gray-600 mb-4">
                  {group.description}
                </p>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">
                  作成日: {new Date(group.created_at).toLocaleDateString('ja-JP')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {groups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">グループがありません</p>
            <button
              onClick={() => handleNavigation('/groups/new')}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              新しいグループを作成
            </button>
          </div>
        )}
      </div>
    </main>
  );
} 