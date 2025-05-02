'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';

interface Budget {
  id: number;
  amount: number;
  month: string;
  group_id: string;
}

interface Salary {
  amount: number;
  status: string;
  payday: number;
}

interface GroupMember {
  user_id: string;
  salary_id: number | null;
  salaries: Salary | null;
}

export default function GroupBudgetPage() {
  const router = useRouter();
  const params = useParams();
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

        // グループの予算を取得
        const groupId = params.groupId as string;
        if (!groupId) {
          throw new Error('Invalid group ID');
        }

        const monthDate = new Date(`${selectedMonth}-01`);
        const formattedDate = monthDate.toISOString().split('T')[0];

        // グループの予算を取得
        const { data: budgetData, error: budgetError } = await supabase
          .from('group_budgets')
          .select('*')
          .eq('group_id', groupId)
          .eq('month', formattedDate)
          .single();

        console.log('予算取得結果:', {
          budgetData,
          budgetError,
          month: formattedDate
        });

        if (budgetError && budgetError.code !== 'PGRST116') {
          throw budgetError;
        }

        // 予算データを設定（収入は含めない）
        setBudget(budgetData);
        setEditedAmount(budgetData ? String(budgetData.amount) : '');

        // 給与収入を取得
        const [year, month] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const fromDay = 1;  // 月の初日
        const toDay = lastDay;  // 月の最終日

        // グループメンバーの給与情報を取得
        const { data: membersData, error: membersError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId);

        if (membersError) throw membersError;

        // メンバーの給与情報を取得
        const memberIds = membersData?.map(m => m.user_id) || [];
        const { data: salaryData, error: salaryError } = await supabase
          .from('salaries')
          .select('amount, status, payday, user_id')
          .in('user_id', memberIds)
          .eq('status', 'unpaid')
          .gte('payday', fromDay)
          .lte('payday', toDay);

        if (salaryError) throw salaryError;

        // 給与収入を計算
        const salaryIncome = salaryData?.reduce((sum, salary) => {
          const amount = typeof salary.amount === 'number' ? salary.amount : 0;
          return sum + amount;
        }, 0) || 0;

        console.log('給与収入計算結果:', {
          salaryIncome,
          salaryCount: salaryData?.length
        });

        setSalaryIncome(salaryIncome);

        // その他の収入を取得
        const { data: incomeData, error: incomeError } = await supabase
          .from('transactions')
          .select('amount')
          .eq('group_id', groupId)
          .eq('type', 'income')
          .gte('date', `${selectedMonth}-01`)
          .lte('date', `${selectedMonth}-${String(lastDay).padStart(2, '0')}`);

        if (incomeError) throw incomeError;

        // その他の収入を計算
        const otherIncome = incomeData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        setOtherIncome(otherIncome);

        // 総収入を計算（予算とは別に管理）
        const totalIncome = otherIncome;  // 未入金の給与収入は含めない
        setTotalIncome(totalIncome);

        console.log('最終計算結果:', {
          budget: budgetData?.amount,
          salaryIncome,
          otherIncome,
          totalIncome
        });

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
  }, [selectedMonth, params.groupId]);

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
      const baseBudget = Number(editedAmount);

      if (baseBudget < 0) {
        throw new Error('予算額は0以上である必要があります');
      }

      console.log('予算保存開始:', {
        baseBudget,
        selectedMonth
      });

      const monthDate = new Date(`${selectedMonth}-01`);
      const formattedDate = monthDate.toISOString().split('T')[0];

      // 既存の予算を確認
      const { data: existingBudget, error: checkError } = await supabase
        .from('group_budgets')
        .select('*')
        .eq('group_id', params.groupId as string)
        .eq('month', formattedDate)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingBudget) {
        // 既存の予算を更新（収入は含めない）
        const { error: updateError } = await supabase
          .from('group_budgets')
          .update({ amount: baseBudget })
          .eq('id', existingBudget.id);

        if (updateError) throw updateError;
      } else {
        // 新規予算を作成（収入は含めない）
        const { error: insertError } = await supabase
          .from('group_budgets')
          .insert({
            group_id: params.groupId as string,
            month: formattedDate,
            amount: baseBudget
          });

        if (insertError) throw insertError;
      }

      console.log('予算保存完了:', {
        baseBudget,
        month: formattedDate,
        existingBudget: existingBudget?.id
      });

      // 予算データのみを更新（収入は含めない）
      setBudget({
        id: existingBudget?.id || 0,
        group_id: params.groupId as string,
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
      <AuthGuard>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">予算設定</h1>
          <Link
            href={`/groups/${params.groupId}`}
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
    </AuthGuard>
  );
} 