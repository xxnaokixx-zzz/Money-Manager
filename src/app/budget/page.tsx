'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface Budget {
  id: number;
  amount: number;
  month: string;
}

export default function BudgetPage() {
  const router = useRouter();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));

  useEffect(() => {
    fetchBudget();
  }, [month]);

  const fetchBudget = async () => {
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('month', `${month}-01`)
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

    try {
      if (budget) {
        // 既存の予算を更新
        const { error } = await supabase
          .from('budgets')
          .update({ amount: parseInt(amount) })
          .eq('id', budget.id);

        if (error) throw error;
      } else {
        // 新規予算を作成
        const { error } = await supabase
          .from('budgets')
          .insert([{ amount: parseInt(amount), month: `${month}-01` }]);

        if (error) throw error;
      }

      router.push('/');
    } catch (error) {
      console.error('Error saving budget:', error);
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
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">予算設定</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              月
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full p-2 border rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              予算額
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder="予算額を入力"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600"
          >
            {budget ? '予算を更新' : '予算を設定'}
          </button>
        </form>
      </div>
    </main>
  );
} 