'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';

interface Budget {
  id: number;
  amount: number;
  month: string;
  category_id?: number;
}

export default function BudgetPage() {
  const router = useRouter();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBudget();
  }, [selectedMonth]);

  const fetchBudget = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', `${selectedMonth}-01`)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setBudget(data);
        setAmount(data.amount.toString());
      } else {
        setBudget(null);
        setAmount('');
      }
    } catch (error) {
      console.error('Error fetching budget:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('ユーザーが認証されていません');
        return;
      }

      const budgetData = {
        amount: Number(amount),
        month: `${selectedMonth}-01`,
        user_id: user.id
      };

      if (budget) {
        // 既存の予算を更新
        const { error } = await supabase
          .from('budgets')
          .update(budgetData)
          .eq('id', budget.id)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // 新規予算を作成
        const { error } = await supabase
          .from('budgets')
          .insert([budgetData]);

        if (error) throw error;
      }

      // 成功したらフォームをリセット
      setAmount('');
      setSelectedMonth(format(new Date(), 'yyyy-MM'));
      router.push('/');
    } catch (err) {
      console.error('Error saving budget:', err);
      setError('予算の保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-blue-500 hover:text-blue-600 mb-4"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            ホームに戻る
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">予算設定</h1>
          <p className="text-gray-600 mt-2">
            月ごとの予算を設定して、支出管理を始めましょう。
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              予算額
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 p-3 border rounded-md text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="予算額を入力"
                required
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>
          </div>

          <div>
            <label htmlFor="month" className="block text-sm font-medium text-gray-700 mb-2">
              対象月
            </label>
            <input
              type="month"
              id="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full p-3 border rounded-md text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-3 px-4 rounded-md hover:bg-blue-600 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </form>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">予算設定のヒント</h2>
          <ul className="list-disc list-inside text-blue-700 space-y-2">
            <li>毎月の収入を基準に予算を設定しましょう</li>
            <li>固定費（家賃、光熱費など）を考慮に入れましょう</li>
            <li>貯金の目標も含めて設定することをお勧めします</li>
          </ul>
        </div>
      </div>
    </main>
  );
} 