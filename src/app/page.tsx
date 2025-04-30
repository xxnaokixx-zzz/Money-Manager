'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase-browser';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Chart.jsの初期化
ChartJS.register(ArcElement, Tooltip, Legend);

// 遅延読み込みするコンポーネント
const DoughnutChart = dynamic(() => import('@/components/DoughnutChart'), {
  loading: () => <div className="w-48 h-48 flex items-center justify-center">読み込み中...</div>,
  ssr: false
});

interface Transaction {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  date: string;
  description?: string;
  user_id: string;
  categories?: {
    id: string;
    name: string;
    type: string;
  };
}

interface Budget {
  id: number;
  user_id: string;
  amount: number;
  month: string;
  created_at: string;
  updated_at: string;
}

interface Salary {
  id: number;
  amount: number;
  payday: number;
  last_paid: string;
  user_id: string;
}

interface Profile {
  id: string;
  email: string;
  avatar_url?: string | null;
  name: string;
}

// キャッシュ用の型定義
interface CacheData {
  transactions: Transaction[];
  budgets: Budget[];
  salary: Salary | null;
  profile: Profile | null;
  timestamp: number;
}

// キャッシュの有効期限（5分）
const CACHE_EXPIRY = 5 * 60 * 1000;

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [salary, setSalary] = useState<Salary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerInfo, setOwnerInfo] = useState<{ name: string; type: string } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));
  const [newTransaction, setNewTransaction] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });
  const router = useRouter();
  const { user, profile: authProfile } = useAuth();
  console.log('Auth Profile:', authProfile);

  // 型を明示的に定義
  interface CategoryExpenses {
    [key: string]: number;
  }

  interface TransactionSummary {
    totalIncome: number;
    totalExpense: number;
    categoryExpenses: CategoryExpenses;
  }

  interface ChartData {
    labels: string[];
    datasets: {
      data: number[];
      backgroundColor: string[];
      borderWidth: number;
    }[];
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
        const category = t.categories?.name || '未分類';
        acc[category] = (acc[category] || 0) + t.amount;
        return acc;
      }, {} as CategoryExpenses);

    return {
      totalIncome: income,
      totalExpense: expense,
      categoryExpenses
    };
  }, [transactions]);

  // チャート用のデータを準備
  const chartData: ChartData = useMemo(() => {
    const budgetAmount = budgets.length > 0 ? budgets[0].amount : 0;
    const remainingAmount = Math.max(0, budgetAmount - totalExpense);
    const isUnderBudget = totalExpense < budgetAmount;

    return {
      labels: ['使用済み', '残り'],
      datasets: [{
        data: [
          totalExpense,
          remainingAmount
        ],
        backgroundColor: [
          isUnderBudget ? '#EF4444' : '#10B981',  // 予算を下回る場合は赤、予算以上は緑
          '#10B981',  // 残りは常に緑
        ],
        borderWidth: 0,
      }]
    };
  }, [totalExpense, budgets]);

  // チャートのオプション設定
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
    rotation: 0, // 開始位置を12時の位置に修正
  }), []);

  // キャッシュの初期化
  const [cache, setCache] = useState<CacheData | null>(null);

  // 給与の自動追加を管理するための状態
  const [lastSalaryAddition, setLastSalaryAddition] = useState<Date | null>(null);
  const [isAddingSalary, setIsAddingSalary] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        setLoading(false);
        return;
      }

      // データ取得を並列実行
      const [transactionsData, budgetsData, salaryData, userData] = await Promise.all([
        supabase
          .from('transactions')
          .select(`
            *,
            categories (
              id,
              name,
              type
            )
          `)
          .eq('user_id', user.id)
          .gte('date', `${selectedMonth}-01`)
          .lte('date', new Date(new Date(`${selectedMonth}-01`).getFullYear(), new Date(`${selectedMonth}-01`).getMonth() + 1, 0).toISOString().split('T')[0])
          .order('date', { ascending: false }),
        supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', `${selectedMonth}-01`),
        supabase
          .from('salaries')
          .select('*')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()
      ]);

      if (transactionsData.error) throw transactionsData.error;
      if (budgetsData.error) throw budgetsData.error;
      if (salaryData.error && salaryData.error.code !== 'PGRST116') throw salaryData.error;
      if (userData.error) throw userData.error;

      setTransactions(transactionsData.data || []);
      setBudgets(budgetsData.data || []);
      setSalary(salaryData.data);
      setProfile(userData.data);

      setOwnerInfo({
        name: userData.data?.name || 'あなた',
        type: '個人'
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [router, selectedMonth]);

  // 初期データ取得
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // リンクのプリフェッチ
  useEffect(() => {
    const prefetchLinks = async () => {
      const links = ['/budget', '/budget/history', '/transactions'];
      for (const link of links) {
        await router.prefetch(link);
      }
    };
    prefetchLinks();
  }, [router]);

  const checkAndAddSalary = useCallback(async (salary: Salary): Promise<void> => {
    // 既に処理中の場合や、今日すでに処理済みの場合はスキップ
    if (isAddingSalary || (lastSalaryAddition && isSameDay(lastSalaryAddition, new Date()))) {
      return;
    }

    const today = new Date();
    const lastPaid = new Date(salary.last_paid);
    const currentDay = today.getDate();

    // 給与日で、かつ最終支払日が今月より前の場合のみ実行
    if (currentDay === salary.payday &&
      (lastPaid.getMonth() !== today.getMonth() ||
        lastPaid.getFullYear() !== today.getFullYear())) {

      try {
        setIsAddingSalary(true);
        setLastSalaryAddition(today);

        // トランザクションの開始を確認
        const { data: existingTransaction, error: transactionCheckError } = await supabase
          .from('transactions')
          .select('id')
          .eq('user_id', salary.user_id)
          .eq('type', 'income')
          .eq('description', '給与')
          .gte('date', today.toISOString().split('T')[0])
          .single();

        if (transactionCheckError && transactionCheckError.code !== 'PGRST116') {
          throw transactionCheckError;
        }

        // 今日の給与が既に追加されている場合はスキップ
        if (existingTransaction) {
          console.log('Salary already added today');
          return;
        }

        const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const todayDate = new Date();

        // 個人の予算を更新
        const { data: budgetData, error: budgetError } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', salary.user_id)
          .eq('month', `${currentMonthStr}-01`)
          .single();

        if (budgetError && budgetError.code !== 'PGRST116') {
          throw budgetError;
        }

        // 予算の更新または新規作成
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
              user_id: salary.user_id
            }]);

          if (insertError) throw insertError;
        }

        // グループの予算を更新
        const { data: groupMembers, error: groupMembersError } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', salary.user_id);

        if (groupMembersError) throw groupMembersError;

        // グループ予算の更新とトランザクションの追加を直列処理に変更
        for (const member of groupMembers) {
          // グループ予算の更新
          const { error: groupRpcError } = await supabase.rpc('increment_group_budget', {
            p_amount: salary.amount,
            p_group_id: member.group_id
          });
          if (groupRpcError) throw groupRpcError;

          // グループの取引履歴に給与を追加
          const { error: groupTransactionError } = await supabase
            .from('transactions')
            .insert({
              user_id: salary.user_id,
              group_id: member.group_id,
              amount: salary.amount,
              type: 'income',
              category_id: 1,
              date: todayDate.toISOString().split('T')[0],  // 日付をYYYY-MM-DD形式に変更
              description: '給与'
            });

          if (groupTransactionError) throw groupTransactionError;
        }

        // 最終支払日の更新
        const { error: salaryError } = await supabase
          .from('salaries')
          .update({ last_paid: todayDate.toISOString().split('T')[0] })
          .eq('id', salary.id);

        if (salaryError) throw salaryError;

        // 個人の取引履歴に給与を追加
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            user_id: salary.user_id,
            amount: salary.amount,
            type: 'income',
            category_id: 1,
            date: todayDate.toISOString().split('T')[0],
            description: '給与'
          });

        if (transactionError) throw transactionError;

        // 給料加算履歴を記録
        const { error: historyError } = await supabase
          .from('salary_additions')
          .insert({
            user_id: salary.user_id,
            amount: salary.amount,
            date: todayDate.toISOString().split('T')[0]
          });

        if (historyError) throw historyError;

        fetchData();
      } catch (err) {
        console.error('Error adding salary:', err);
        setError('給料の自動追加に失敗しました');
        // エラーが発生した場合は状態をリセット
        setIsAddingSalary(false);
        setLastSalaryAddition(null);
      } finally {
        setIsAddingSalary(false);
      }
    }
  }, [isAddingSalary, lastSalaryAddition]);

  // 日付が同じ日かどうかを判定するヘルパー関数
  const isSameDay = (date1: Date, date2: Date): boolean => {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  };

  useEffect(() => {
    if (salary && !isAddingSalary) {
      checkAndAddSalary(salary);
    }
  }, [salary, checkAndAddSalary, isAddingSalary]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const amount = parseInt(newTransaction.amount, 10);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('有効な金額を入力してください');
      }

      const transactionData = {
        type: newTransaction.type,
        amount: amount,
        category_id: newTransaction.category || '4', // デフォルトは'その他'
        date: newTransaction.date,
        description: newTransaction.description,
        user_id: user.id
      };

      console.log('Saving transaction:', transactionData); // デバッグ用

      const { error } = await supabase
        .from('transactions')
        .insert([transactionData]);

      if (error) throw error;

      // 収入の場合、予算を更新
      if (newTransaction.type === 'income') {
        const currentMonth = newTransaction.date.slice(0, 7) + '-01';
        const { data: currentBudget, error: budgetFetchError } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', currentMonth)
          .single();

        if (budgetFetchError && budgetFetchError.code !== 'PGRST116') {
          throw budgetFetchError;
        }

        const newAmount = (currentBudget?.amount || 0) + amount;
        const { error: budgetError } = await supabase
          .from('budgets')
          .upsert({
            user_id: user.id,
            month: currentMonth,
            amount: newAmount
          });

        if (budgetError) throw budgetError;
      }

      setNewTransaction({
        type: 'expense',
        amount: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
        description: ''
      });
      fetchData();
    } catch (error) {
      console.error('Error adding transaction:', error);
      setError('取引の追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // カテゴリーIDからカテゴリー名を取得する関数
  const getCategoryName = (categoryId: string | undefined): string => {
    if (categoryId === undefined) return '未分類';

    console.log('Getting category name for ID:', categoryId);
    switch (categoryId) {
      case '1':
        return '食費';
      case '2':
        return '交通費';
      case '3':
        return '娯楽';
      case '4':
        return 'その他';
      default:
        console.log('Unknown category ID:', categoryId);
        return '未分類';
    }
  };

  // ナビゲーションの最適化
  const handleNavigation = useCallback((path: string) => {
    setLoading(true);
    router.push(path);
  }, [router]);

  // ローディング状態の改善
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
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
      {/* ヘッダー */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800">マイホーム</h1>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/groups')}
            className="inline-flex items-center px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            グループを切り替え
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              予算状況
              {authProfile && (
                <span className="ml-2 text-sm text-gray-500">
                  ({authProfile.name}さん)
                </span>
              )}
            </h2>
            <div className="flex space-x-2">
              <Link
                href="/budget"
                className="inline-flex items-center px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavigation('/budget');
                }}
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
                href="/transactions"
                className="inline-flex items-center px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavigation('/transactions');
                }}
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
                <Suspense fallback={<div className="w-48 h-48 flex items-center justify-center">読み込み中...</div>}>
                  <DoughnutChart data={chartData} options={chartOptions} />
                </Suspense>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      ¥{Math.max(0, (budgets[0].amount - totalExpense)).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">
                      残り
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2 w-full">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">予算額</span>
                  <span className="text-gray-600">
                    ¥{budgets[0].amount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">収入</span>
                  <span className="text-emerald-600">
                    +¥{totalIncome.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">支出</span>
                  <span className="text-red-500">
                    -¥{totalExpense.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>利用可能額</span>
                    <span className="text-blue-600">
                      ¥{Math.max(0, budgets[0].amount - totalExpense).toLocaleString()}
                    </span>
                  </div>
                </div>
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
                    {transaction.categories?.name || '未分類'}
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

      {salary && (
        <div className="mt-8 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">給料情報</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-500">次の給料日</div>
              <div className="text-lg font-medium text-gray-900">
                {(() => {
                  const today = new Date();
                  const year = today.getFullYear();
                  const month = today.getMonth();
                  const payday = salary.payday;
                  let nextPayday = new Date(year, month, payday);
                  if (today > nextPayday) {
                    // 今月の給料日を過ぎていれば来月
                    nextPayday = new Date(year, month + 1, payday);
                  }
                  const diffTime = nextPayday.getTime() - today.setHours(0, 0, 0, 0);
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  return `${nextPayday.getMonth() + 1}月${payday}日（あと${diffDays}日）`;
                })()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">給料額</div>
              <div className="text-lg font-medium text-gray-900">
                ¥{salary.amount.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
