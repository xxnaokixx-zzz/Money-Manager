'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';

const categories = {
  income: [
    { id: 1, name: '給与' },
    { id: 2, name: '賞与' },
    { id: 3, name: '副業' },
    { id: 4, name: '投資' },
    { id: 5, name: 'その他' }
  ],
  expense: [
    { id: 6, name: '食費' },
    { id: 7, name: '交通費' },
    { id: 8, name: '住居費' },
    { id: 9, name: '光熱費' },
    { id: 10, name: '通信費' },
    { id: 11, name: '娯楽費' },
    { id: 12, name: '医療費' },
    { id: 13, name: '教育費' },
    { id: 14, name: '被服費' }
  ]
};

export default function AddGroupTransaction() {
  const router = useRouter();
  const params = useParams();
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNavigation = (href: string) => {
    setLoading(true);
    router.push(href);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { error } = await supabase
        .from('transactions')
        .insert([{
          type,
          amount: parseInt(amount),
          category_id: categoryId,
          date,
          description,
          group_id: params.groupId as string,
          user_id: user.id
        }]);

      if (error) throw error;

      handleNavigation(`/groups/${params.groupId}/transactions`);
    } catch (error) {
      console.error('Error adding transaction:', error);
      setError('取引の追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-md mx-auto px-4 py-8">
          <div className="mb-8">
            <button
              onClick={() => handleNavigation(`/groups/${params.groupId}`)}
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m-4 0h4" />
              </svg>
              グループに戻る
            </button>
            <h1 className="text-2xl font-bold text-gray-800">グループ取引を追加</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setType('income')}
                className={`p-4 rounded-lg border-2 ${type === 'income'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-700'
                  }`}
              >
                <div className="text-lg font-semibold">収入</div>
                <div className="text-sm">お金が入ってきた</div>
              </button>
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`p-4 rounded-lg border-2 ${type === 'expense'
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-white text-gray-700'
                  }`}
              >
                <div className="text-lg font-semibold">支出</div>
                <div className="text-sm">お金を使った</div>
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                金額
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                  required
                  min="1"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                カテゴリー
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(parseInt(e.target.value))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">選択してください</option>
                {categories[type].map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日付
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メモ（任意）
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="取引の詳細を入力"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? '保存中...' : '保存する'}
            </button>
          </form>
        </div>
      </main>
    </AuthGuard>
  );
} 