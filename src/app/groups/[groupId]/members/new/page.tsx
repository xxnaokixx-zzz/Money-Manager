'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewMemberPage(
  props: {
    params: Promise<{ groupId: string }>;
  }
) {
  const params = use(props.params);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member'>('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/groups/${params.groupId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add member');
      }

      router.push(`/groups/${params.groupId}`);
    } catch (err) {
      console.error('Error adding member:', err);
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center mb-8">
          <Link
            href={`/groups/${params.groupId}`}
            className="text-blue-500 hover:text-blue-600 mr-4"
          >
            ← 戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-800">メンバーを追加</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              メールアドレス
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-2 border rounded-md"
              placeholder="招待するメンバーのメールアドレス"
            />
          </div>

          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              権限
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'member')}
              className="w-full p-2 border rounded-md"
            >
              <option value="member">メンバー</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">
              管理者は予算や取引の追加・編集ができます
            </p>
          </div>

          {error && (
            <div className="text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '追加中...' : 'メンバーを追加'}
          </button>
        </form>
      </div>
    </main>
  );
} 