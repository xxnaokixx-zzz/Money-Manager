'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

// Chart.jsの初期化
ChartJS.register(ArcElement, Tooltip, Legend);

interface Transaction {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  date: string;
  description?: string;
  user_id: string;
}

interface Budget {
  id: number;
  amount: number;
  category_id: number;
  category?: string;
  user_id: string;
}

interface Salary {
  id: number;
  amount: number;
  payday: number;
  last_paid: string;
}

interface Profile {
  id: string;
  username: string;
  avatar_url?: string | null;
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [salary, setSalary] = useState<Salary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerInfo, setOwnerInfo] = useState<{ name: string; type: string } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));
  const router = useRouter();

  // 型を明示的に定義
  interface CategoryExpenses {
    [key: string]: number;
  }

  interface TransactionSummary {
    totalIncome: number;
    totalExpense: number;
    categoryExpenses: CategoryExpenses;
  }

  const { totalIncome, totalExpense, categoryExpenses } = useMemo<TransactionSummary>(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    // カテゴリーごとの支出を計算
    const categoryExpenses: CategoryExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        const category = t.category || '未分類';
        acc[category] = (acc[category] || 0) + t.amount;
        return acc;
      }, {} as CategoryExpenses);

    return {
      totalIncome: income,
      totalExpense: expense,
      categoryExpenses
    };
  }, [transactions]);

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      console.log('Current user ID:', user.id);

      // プロフィール情報の取得
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
        return;
      }

      if (!profileData) {
        try {
          // プロフィールが存在しない場合は新規作成
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([
              {
                id: user.id,
                username: 'あなた'
              }
            ])
            .select()
            .single();

          if (insertError) {
            console.error('Error creating profile:', insertError);
            // プロフィール作成に失敗した場合でも、デフォルトのユーザー名を使用
            setOwnerInfo({
              name: 'あなた',
              type: '個人'
            });
            return;
          }

          setProfile(newProfile);
          setOwnerInfo({
            name: newProfile.username || 'あなた',
            type: '個人'
          });
        } catch (error) {
          console.error('Unexpected error creating profile:', error);
          // エラーが発生した場合でも、デフォルトのユーザー名を使用
          setOwnerInfo({
            name: 'あなた',
            type: '個人'
          });
        }
      } else {
        setProfile(profileData);
        setOwnerInfo({
          name: profileData.username || 'あなた',
          type: '個人'
        });
      }

      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', `${selectedMonth}-01`)
        .lte('date', new Date(new Date(`${selectedMonth}-01`).getFullYear(), new Date(`${selectedMonth}-01`).getMonth() + 1, 0).toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (transactionsError) {
        console.error('Error fetching transactions:', transactionsError);
        return;
      }

      console.log('取引データ:', transactionsData); // デバッグ用ログ
      setTransactions(transactionsData || []);

      const { data: budgetsData, error: budgetsError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id);

      if (budgetsError) {
        console.error('Error fetching budgets:', budgetsError);
        return;
      }

      console.log('予算データ:', budgetsData); // デバッグ用ログ

      // category_idに基づいてカテゴリー名を設定
      const processedBudgets = budgetsData?.map(budget => {
        console.log('予算のカテゴリーID:', budget.category_id); // デバッグ用ログ
        return {
          ...budget,
          category: getCategoryName(budget.category_id)
        };
      }) || [];

      console.log('処理後の予算データ:', processedBudgets); // デバッグ用ログ
      setBudgets(processedBudgets);

      const { data: salaryData, error: salaryError } = await supabase
        .from('salaries')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (salaryError && salaryError.code !== 'PGRST116') {
        console.error('Error fetching salary:', salaryError);
        return;
      }

      setSalary(salaryData);
      if (salaryData) {
        await checkAndAddSalary(salaryData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const checkAndAddSalary = useCallback(async (salary: Salary): Promise<void> => {
    const today = new Date();
    const currentDay = today.getDate();
    const lastPaid = new Date(salary.last_paid);
    const currentMonth = today.getMonth();
    const lastPaidMonth = lastPaid.getMonth();

    if (currentDay >= salary.payday &&
      (currentMonth !== lastPaidMonth ||
        (currentMonth === lastPaidMonth && currentDay > lastPaid.getDate()))) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        const { error: transactionError } = await supabase
          .from('transactions')
          .insert([{
            type: 'income',
            amount: salary.amount,
            category_id: 1,
            date: today.toISOString().split('T')[0],
            description: '給料'
          }]);

        if (transactionError) throw transactionError;

        const currentMonthStr = today.toISOString().split('T')[0].slice(0, 7);
        const { data: budgetData, error: budgetError } = await supabase
          .from('budgets')
          .select('*')
          .eq('month', `${currentMonthStr}-01`)
          .eq('user_id', user.id)
          .single();

        if (budgetError && budgetError.code !== 'PGRST116') {
          throw budgetError;
        }

        if (budgetData) {
          const { error: updateError } = await supabase
            .from('budgets')
            .update({ amount: budgetData.amount + salary.amount })
            .eq('id', budgetData.id);

          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from('budgets')
            .insert([{
              amount: salary.amount,
              month: `${currentMonthStr}-01`,
              user_id: user.id
            }]);

          if (insertError) throw insertError;
        }

        const { error: salaryError } = await supabase
          .from('salaries')
          .update({ last_paid: today.toISOString().split('T')[0] })
          .eq('id', salary.id);

        if (salaryError) throw salaryError;

        fetchData();
      } catch (err) {
        console.error('Error adding salary:', err);
        setError('給料の自動追加に失敗しました');
      }
    }
  }, [router, fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = useMemo(() => ({
    labels: ['使用済み', '残り'],
    datasets: [
      {
        data: [
          totalExpense,
          budgets.length > 0 ? Math.max(0, budgets[0].amount - totalExpense) : Math.max(0, totalIncome - totalExpense)
        ],
        backgroundColor: ['#EF4444', '#10B981'],
        borderWidth: 0,
      },
    ],
  }), [totalExpense, budgets, totalIncome]);

  const chartOptions = useMemo(() => ({
    cutout: '70%',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
      },
    },
  }), []);

  // カテゴリーIDからカテゴリー名を取得する関数
  const getCategoryName = (categoryId: number): string => {
    console.log('Getting category name for ID:', categoryId); // デバッグ用ログ
    switch (categoryId) {
      case 1:
        return '食費';
      case 2:
        return '交通費';
      case 3:
        return '娯楽';
      case 4:
        return 'その他';
      default:
        console.log('Unknown category ID:', categoryId); // デバッグ用ログ
        return '未分類';
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-slate-800">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6 border border-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">予算状況</h2>
            <div className="flex space-x-2">
              <Link
                href="/budget"
                className="inline-flex items-center px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                編集
              </Link>
              <Link
                href="/budget/history"
                className="inline-flex items-center px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                履歴
              </Link>
            </div>
          </div>
          {budgets.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              予算が設定されていません
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative w-48 h-48 mb-4">
                <Doughnut data={chartData} options={chartOptions} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      ¥{Math.max(0, budgets[0].amount - totalExpense).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">
                      残り
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2 w-full">
                {Object.entries(categoryExpenses).map(([category, amount]) => (
                  <div key={category} className="flex justify-between text-sm">
                    <span className="font-medium">{category}</span>
                    <span className="text-gray-600">
                      <span className="text-red-500">¥{amount.toLocaleString()}</span>
                      <span className="mx-1">/</span>
                      <span className="text-blue-500">¥{budgets[0].amount.toLocaleString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 text-slate-900">今月の収支</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-slate-700">収入</div>
              <div className="text-2xl font-bold text-emerald-700">
                ¥{totalIncome.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-700">支出</div>
              <div className="text-2xl font-bold text-red-700">
                ¥{totalExpense.toLocaleString()}
              </div>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <div className="text-sm text-slate-700">収支</div>
              <div className="text-2xl font-bold text-slate-900">
                ¥{(totalIncome - totalExpense).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900">最近の取引</h2>
          <div className="flex space-x-2">
            <Link
              href="/add"
              className="inline-flex items-center px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <svg
                className="w-4 h-4 mr-1"
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
              追加
            </Link>
            <Link
              href="/transactions"
              className="inline-flex items-center px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              すべて表示
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  日付
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  カテゴリー
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  金額
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {transactions.slice(0, 5).map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {new Date(transaction.date).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {transaction.category}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${transaction.type === 'income' ? 'text-emerald-700' : 'text-red-700'
                    }`}>
                    {transaction.type === 'income' ? '+' : '-'}
                    ¥{transaction.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
