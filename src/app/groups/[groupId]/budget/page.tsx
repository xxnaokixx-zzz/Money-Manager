'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { use } from 'react';

interface Budget {
  id: number;
  amount: number;
  month: string;
  group_id: number;
}

export default function GroupBudgetPage(props: { params: Promise<{ groupId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedAmount, setEditedAmount] = useState('');
  const [totalIncome, setTotalIncome] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

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

        // 予算を取得
        const { data: budgetData, error: budgetError } = await supabase
          .from('group_budgets')
          .select('*')
          .eq('group_id', params.groupId)
          .eq('month', `${selectedMonth}-01`)
          .single();

        if (budgetError && budgetError.code !== 'PGRST116') {
          throw budgetError;
        }

        // この月の収入（給与含む）を取得
        const [year, month] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const currentMonthStart = `${selectedMonth}-01`;
        const currentMonthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

        // グループメンバーの給与を取得
        const { data: salaryData, error: salaryError } = await supabase
          .from('transactions')
          .select('amount')
          .eq('group_id', params.groupId)
          .eq('type', 'income')
          .eq('category_id', 1)  // 給与カテゴリー
          .gte('date', currentMonthStart)
          .lte('date', currentMonthEnd);

        if (salaryError) throw salaryError;

        // その他の収入を取得
        const { data: incomeData, error: incomeError } = await supabase
          .from('transactions')
          .select('amount')
          .eq('group_id', params.groupId)
          .eq('type', 'income')
          .neq('category_id', 1)  // 給与以外
          .gte('date', currentMonthStart)
          .lte('date', currentMonthEnd);

        if (incomeError) throw incomeError;

        // 総収入を計算（給与 + その他の収入）
        const totalSalary = salaryData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        const totalOtherIncome = incomeData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        const totalIncome = totalSalary + totalOtherIncome;
        setTotalIncome(totalIncome);

        // 予算データを設定
        setBudget(budgetData);
        if (!budgetData && totalIncome === 0) {
          setEditedAmount('');
        } else {
          const currentAmount = (budgetData?.amount || 0) + totalIncome;
          setEditedAmount(String(currentAmount));
        }

      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching budget:', error);
        setError(error instanceof Error ? error.message : '予算の取得に失敗しました');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [router, params.groupId, selectedMonth]);

  const handleNavigation = (href: string) => {
    setLoading(true);
    router.push(href);
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

      if (member.role !== 'owner') {
        throw new Error('予算の編集はグループ管理者のみ可能です');
      }

      const { error: upsertError } = await supabase
        .from('group_budgets')
        .upsert({
          group_id: params.groupId,
          month: `${selectedMonth}-01`,
          amount: Number(editedAmount)
        });

      if (upsertError) throw upsertError;

      setBudget({
        id: budget?.id || 0,
        group_id: Number(params.groupId),
        month: `${selectedMonth}-01`,
        amount: Number(editedAmount)
      });
      setIsEditing(false);
      alert('予算が更新されました');
    } catch (error) {
      console.error('Error saving budget:', error);
      setError(error instanceof Error ? error.message : '予算の保存に失敗しました');
    }
  };

  const handleCancel = () => {
    setEditedAmount(budget ? String(budget.amount) : '');
    setIsEditing(false);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedMonth(e.target.value);
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
          <button
            onClick={() => handleNavigation(`/groups/${params.groupId}`)}
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            グループに戻る
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">グループ予算設定</h1>
          <p className="text-gray-600 mt-2">
            グループの予算を設定して、支出管理を始めましょう。
          </p>
        </div>

        {error && <div className="text-red-500 mb-4">{error}</div>}

        <div className="bg-white rounded-lg shadow p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              月を選択
            </label>
            <select
              value={selectedMonth}
              onChange={handleMonthChange}
              className="w-full p-3 border rounded-md text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const now = new Date();
                const year = now.getFullYear();
                const month = now.getMonth() + i;
                const date = new Date(year, month, 1);
                const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                const label = `${date.getFullYear()}年${date.getMonth() + 1}月`;
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                予算額
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                {isEditing ? (
                  <input
                    type="number"
                    value={editedAmount}
                    onChange={(e) => setEditedAmount(e.target.value)}
                    className="w-full pl-8 p-3 border rounded-md text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="予算額を入力"
                    required
                    min="0"
                  />
                ) : (
                  <div className="w-full pl-8 p-3 border rounded-md text-base bg-gray-50">
                    {Number(editedAmount) > 0 ? Number(editedAmount).toLocaleString() : '未設定'}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              {!isEditing ? (
                <>
                  <button
                    onClick={async () => {
                      if (window.confirm('予算をリセットしますか？\n※この月の給与による収入も削除されます')) {
                        try {
                          const { data: { user } } = await supabase.auth.getUser();
                          if (!user) {
                            router.push('/login');
                            return;
                          }

                          // 予算をリセット
                          const { error: budgetError } = await supabase
                            .from('group_budgets')
                            .delete()
                            .eq('group_id', params.groupId)
                            .eq('month', `${selectedMonth}-01`);

                          if (budgetError) throw budgetError;

                          // この月の給与による収入を削除
                          const [year, month] = selectedMonth.split('-').map(Number);
                          const lastDay = new Date(year, month, 0).getDate();
                          const currentMonthStart = `${selectedMonth}-01`;
                          const currentMonthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

                          const { error: transactionError } = await supabase
                            .from('transactions')
                            .delete()
                            .eq('group_id', params.groupId)
                            .eq('type', 'income')
                            .eq('category_id', 1) // 給与カテゴリー
                            .gte('date', currentMonthStart)
                            .lte('date', currentMonthEnd);

                          if (transactionError) throw transactionError;

                          setBudget(null);
                          setEditedAmount('0');
                          setTotalIncome(0);
                          alert('予算をリセットしました');
                        } catch (error) {
                          console.error('Error resetting budget:', error);
                          setError('予算のリセットに失敗しました');
                        }
                      }
                    }}
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    リセット
                  </button>
                  <button
                    onClick={handleEdit}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    編集
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    保存
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">予算設定のヒント</h2>
          <ul className="list-disc list-inside text-blue-700 space-y-2">
            <li>グループの収入を基準に予算を設定しましょう</li>
            <li>固定費（家賃、光熱費など）を考慮に入れましょう</li>
            <li>貯金の目標も含めて設定することをお勧めします</li>
          </ul>
        </div>
      </div>
    </main>
  );
} 