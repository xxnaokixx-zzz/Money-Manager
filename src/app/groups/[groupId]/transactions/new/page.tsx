'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { use } from 'react';

export default function NewGroupTransactionPage(props: { params: Promise<{ groupId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transaction, setTransaction] = useState({
    type: 'expense',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });
  const [salaryDate, setSalaryDate] = useState<string | null>(null);

  useEffect(() => {
    const fetchSalaryDate = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('salary_dates')
          .select('date')
          .eq('user_id', user.id)
          .single();

        if (error) throw error;
        if (data) setSalaryDate(data.date);
      } catch (error) {
        console.error('Error fetching salary date:', error);
      }
    };

    fetchSalaryDate();
  }, []);

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

      // グループメンバーであることを確認
      const { data: member, error: memberError } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', params.groupId)
        .eq('user_id', user.id)
        .single();

      if (memberError) {
        throw new Error('グループメンバーではありません');
      }

      const { error } = await supabase
        .from('transactions')
        .insert([{
          type: transaction.type,
          amount: Number(transaction.amount),
          category: transaction.category,
          date: transaction.date,
          description: transaction.description,
          group_id: params.groupId,
          user_id: user.id
        }]);

      if (error) throw error;

      router.push(`/groups/${params.groupId}`);
    } catch (error) {
      console.error('Error creating transaction:', error);
      setError(error instanceof Error ? error.message : '取引の作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigation = (href: string) => {
    setLoading(true);
    router.push(href);
  };

  return (
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
          <h1 className="text-2xl font-bold text-gray-800">取引を追加</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setTransaction({ ...transaction, type: 'income' })}
              className={`p-4 rounded-lg border-2 ${transaction.type === 'income'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-700'
                }`}
            >
              <div className="text-lg font-semibold">収入</div>
              <div className="text-sm">お金が入ってきた</div>
            </button>
            <button
              type="button"
              onClick={() => setTransaction({ ...transaction, type: 'expense' })}
              className={`p-4 rounded-lg border-2 ${transaction.type === 'expense'
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
                value={transaction.amount}
                onChange={(e) => setTransaction({ ...transaction, amount: e.target.value })}
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
            <input
              type="text"
              value={transaction.category}
              onChange={(e) => setTransaction({ ...transaction, category: e.target.value })}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="カテゴリーを入力"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              日付
            </label>
            <div className="space-y-2">
              <input
                type="date"
                value={transaction.date}
                onChange={(e) => setTransaction({ ...transaction, date: e.target.value })}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
              {salaryDate && (
                <div className="text-sm text-gray-500">
                  今月の給料日: {new Date(salaryDate).toLocaleDateString('ja-JP')}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              メモ（任意）
            </label>
            <input
              type="text"
              value={transaction.description}
              onChange={(e) => setTransaction({ ...transaction, description: e.target.value })}
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
  );
} 