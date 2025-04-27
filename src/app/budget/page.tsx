'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';

interface Budget {
  id: number;
  amount: number;
  category: string;
  user_id: string;
}

export default function BudgetPage() {
  const router = useRouter();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedBudgets, setEditedBudgets] = useState<Budget[]>([]);
  const [amount, setAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!isMounted) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id);

        if (!isMounted) return;

        if (error) throw error;

        setBudgets(data || []);
        setEditedBudgets(data || []);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching budgets:', error);
        setError('予算の取得に失敗しました');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleNavigation = (href: string) => {
    setLoading(true);
    router.push(href);
  };

  const handleReset = async () => {
    if (!confirm('本当に予算をリセットしますか？この操作は取り消せません。')) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // 予算をリセット（すべての予算を削除）
      const { error } = await supabase
        .from('budgets')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      // 取引履歴もリセット
      const { error: transactionError } = await supabase
        .from('transactions')
        .delete()
        .eq('user_id', user.id);

      if (transactionError) throw transactionError;

      setBudgets([]);
      setEditedBudgets([]);
      alert('予算と履歴がリセットされました');
    } catch (error) {
      console.error('Error resetting budgets:', error);
      setError('予算のリセットに失敗しました');
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // 既存の予算を削除
      const { error: deleteError } = await supabase
        .from('budgets')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      // 新しい予算を追加
      const { error: insertError } = await supabase
        .from('budgets')
        .insert(editedBudgets.map(budget => ({
          ...budget,
          user_id: user.id
        })));

      if (insertError) throw insertError;

      setBudgets(editedBudgets);
      setIsEditing(false);
      alert('予算が更新されました');
    } catch (error) {
      console.error('Error saving budgets:', error);
      setError('予算の保存に失敗しました');
    }
  };

  const handleCancel = () => {
    setEditedBudgets(budgets);
    setIsEditing(false);
  };

  const handleAmountChange = (id: number, amount: number) => {
    setEditedBudgets(prev =>
      prev.map(budget =>
        budget.id === id ? { ...budget, amount } : budget
      )
    );
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
        .from('budgets')
        .upsert([
          {
            amount: Number(amount),
            month: `${selectedMonth}-01`,
            user_id: user.id
          }
        ]);

      if (error) throw error;

      handleNavigation('/');
    } catch (error) {
      console.error('Error saving budget:', error);
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

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
          <div className="mb-8">
            <button
              onClick={() => handleNavigation('/')}
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m-4 0h4" />
              </svg>
              ホームに戻る
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">予算設定</h1>
            <p className="text-gray-600 mt-2">
              月ごとの予算を設定して、支出管理を始めましょう。
            </p>
          </div>

          <div className="text-red-500">{error}</div>

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-8">
          <button
            onClick={() => handleNavigation('/')}
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m-4 0h4" />
            </svg>
            ホームに戻る
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">予算設定</h1>
          <p className="text-gray-600 mt-2">
            月ごとの予算を設定して、支出管理を始めましょう。
          </p>
        </div>

        {budgets.length > 0 ? (
          <>
            <div className="flex justify-between items-center mb-6">
              {!isEditing ? (
                <>
                  <button
                    onClick={handleEdit}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    編集
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    リセット
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                  >
                    キャンセル
                  </button>
                </>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="space-y-4">
                {editedBudgets.map(budget => (
                  <div key={budget.id} className="flex items-center justify-between">
                    <span className="font-medium">{budget.category}</span>
                    {isEditing ? (
                      <input
                        type="number"
                        value={budget.amount}
                        onChange={(e) => handleAmountChange(budget.id, parseInt(e.target.value) || 0)}
                        className="w-32 px-2 py-1 border rounded"
                      />
                    ) : (
                      <span className="text-gray-600">
                        ¥{budget.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
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
                {loading ? '保存中...' : '予算を設定'}
              </button>
            </form>
          </div>
        )}

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