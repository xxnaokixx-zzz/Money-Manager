'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

interface Budget {
  id: number;
  amount: number;
  month: string;
  user_id: string;
}

export default function BudgetPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedAmount, setEditedAmount] = useState('');
  const [totalIncome, setTotalIncome] = useState(0);
  const [salaryIncome, setSalaryIncome] = useState(0);
  const [otherIncome, setOtherIncome] = useState(0);
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

        // 予算を取得
        const monthDate = new Date(`${selectedMonth}-01`);
        const formattedDate = monthDate.toISOString().split('T')[0];
        console.log('月の型変換:', {
          original: selectedMonth,
          date: monthDate,
          formatted: formattedDate,
          type: typeof formattedDate
        });

        const { data: budgetData, error: budgetError } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', formattedDate)
          .single();

        console.log('予算取得結果:', {
          budgetData,
          budgetError,
          userId: user.id,
          month: formattedDate,
          query: {
            table: 'budgets',
            filters: {
              user_id: user.id,
              month: formattedDate
            }
          }
        });

        if (budgetError) {
          console.error('予算取得エラーの詳細:', {
            code: budgetError.code,
            message: budgetError.message,
            details: budgetError.details,
            hint: budgetError.hint
          });
          if (budgetError.code !== 'PGRST116') {
            throw budgetError;
          }
        }

        // この月の収入（給与含む）を取得
        const [year, month] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const currentMonthStart = `${selectedMonth}-01`;
        const currentMonthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

        // 給与収入を取得
        const fromDay = 1;  // 月の初日
        const toDay = lastDay;  // 月の最終日

        console.log('給与検索条件:', {
          month: {
            year,
            month,
            selectedMonth,
            fromDay,
            toDay,
            lastDay
          }
        });

        const { data: salaryData, error: salaryError } = await supabase
          .from('salaries')
          .select('amount, status, payday')
          .eq('user_id', user.id)
          .eq('status', 'unpaid')
          .gte('payday', fromDay)
          .lte('payday', toDay);

        console.log('給与データ取得結果:', {
          rawData: salaryData,
          error: salaryError,
          userId: user.id,
          query: {
            table: 'salaries',
            filters: {
              user_id: user.id,
              status: 'unpaid',
              payday: {
                gte: fromDay,
                lte: toDay
              }
            }
          },
          dataDetails: salaryData?.map(s => ({
            amount: s.amount,
            status: s.status,
            payday: s.payday
          }))
        });

        if (salaryError) throw salaryError;

        // 給与収入を計算
        const salaryIncome = salaryData?.reduce((sum, s) => {
          const amount = typeof s.amount === 'number' ? s.amount : 0;
          console.log('給与データ処理:', {
            current: s,
            amount,
            currentSum: sum,
            type: {
              amount: typeof s.amount,
              status: typeof s.status,
              payday: typeof s.payday,
              sum: typeof sum
            }
          });
          return sum + amount;
        }, 0) || 0;

        console.log('給与収入計算結果:', {
          finalAmount: salaryIncome,
          dataLength: salaryData?.length,
          dataTypes: salaryData?.map(s => ({
            amount: typeof s.amount,
            status: typeof s.status,
            payday: typeof s.payday
          }))
        });

        setSalaryIncome(salaryIncome);

        // その他の収入を取得
        const { data: incomeData, error: incomeError } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id)
          .eq('type', 'income')
          .gte('date', currentMonthStart)
          .lte('date', currentMonthEnd);

        if (incomeError) throw incomeError;

        // その他の収入を計算
        const otherIncome = incomeData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        setOtherIncome(otherIncome);

        // 総収入を計算
        const totalIncome = otherIncome;  // 未入金の給与収入は含めない
        setTotalIncome(totalIncome);

        // 予算データを設定
        setBudget(budgetData);
        if (!budgetData && totalIncome === 0) {
          setEditedAmount('');  // 予算も収入もない場合は空文字列
        } else {
          // 予算額のみを表示（収入は含めない）
          setEditedAmount(String(budgetData?.amount || 0));
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
  }, [router, selectedMonth]);

  const handleNavigation = (href: string) => {
    setLoading(true);
    router.push(href);
  };

  const handleEdit = () => {
    // 予算額のみを表示（収入は含めない）
    setEditedAmount(budget ? String(budget.amount) : '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const baseBudget = Number(editedAmount);

      if (baseBudget < 0) {
        throw new Error('予算額は0以上である必要があります');
      }

      // 給与収入を取得
      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const currentMonthStart = `${selectedMonth}-01`;
      const currentMonthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      // 月の日付を整数値で設定（1-31）
      const fromDay = 1;  // 月の初日
      const toDay = lastDay;  // 月の最終日

      console.log('給与検索条件:', {
        month: {
          year,
          month,
          selectedMonth,
          fromDay,
          toDay,
          lastDay
        }
      });

      const { data: salaryData, error: salaryError } = await supabase
        .from('salaries')
        .select('amount, status, payday')
        .eq('user_id', user.id)
        .eq('status', 'unpaid')
        .gte('payday', fromDay)
        .lte('payday', toDay);

      console.log('給与データ取得結果:', {
        rawData: salaryData,
        error: salaryError,
        userId: user.id,
        query: {
          table: 'salaries',
          filters: {
            user_id: user.id,
            status: 'unpaid',
            payday: {
              gte: fromDay,
              lte: toDay
            }
          }
        },
        dataDetails: salaryData?.map(s => ({
          amount: s.amount,
          status: s.status,
          payday: s.payday
        }))
      });

      if (salaryError) throw salaryError;

      const monthDate = new Date(`${selectedMonth}-01`);
      const formattedDate = monthDate.toISOString().split('T')[0];

      // 既存の予算を確認
      const { data: existingBudget, error: checkError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', formattedDate)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingBudget) {
        // 既存の予算を更新
        const { error: updateError } = await supabase
          .from('budgets')
          .update({ amount: baseBudget })
          .eq('id', existingBudget.id);

        if (updateError) throw updateError;
      } else {
        // 新規予算を作成
        const { error: insertError } = await supabase
          .from('budgets')
          .insert({
            user_id: user.id,
            month: formattedDate,
            amount: baseBudget
          });

        if (insertError) throw insertError;
      }

      setBudget({
        id: existingBudget?.id || 0,
        user_id: user.id,
        month: formattedDate,
        amount: baseBudget
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">予算設定</h1>
        <Link
          href="/"
          className="inline-flex items-center px-4 py-2 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
        >
          戻る
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              対象月
            </label>
            <select
              value={selectedMonth}
              onChange={handleMonthChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() + i);
                const value = format(date, 'yyyy-MM');
                const label = format(date, 'yyyy年M月');
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  予算額
                </label>
                {!isEditing && (
                  <button
                    onClick={handleEdit}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    編集
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                    <input
                      type="number"
                      value={editedAmount}
                      onChange={(e) => setEditedAmount(e.target.value)}
                      className="block w-full rounded-md border-gray-300 pl-8 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="予算額を入力"
                    />
                  </div>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <div className="text-2xl font-bold text-gray-900">
                  {budget ? (
                    `¥${budget.amount.toLocaleString()}`
                  ) : (
                    <span className="text-gray-500">設定されていません</span>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="text-sm font-medium text-gray-700 mb-2">
                今月の収入
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-sm text-gray-600">給与収入</div>
                  <div className="text-xl font-bold text-emerald-600">
                    {salaryIncome > 0 ? (
                      <div className="flex items-center">
                        <span>¥{salaryIncome.toLocaleString()}</span>
                        <span className="ml-2 text-sm font-normal text-amber-600">（未入金）</span>
                      </div>
                    ) : (
                      <span>¥0</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">その他の収入</div>
                  <div className="text-xl font-bold text-emerald-600">
                    ¥{otherIncome.toLocaleString()}
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <div className="text-sm text-gray-600">合計収入</div>
                  <div className="text-2xl font-bold text-emerald-600">
                    ¥{totalIncome.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 