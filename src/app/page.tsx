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

// 集計用の型定義
interface CategoryExpenses {
  [key: string]: number;
}

interface TransactionSummary {
  totalIncome: number;
  totalExpense: number;
  categoryExpenses: CategoryExpenses;
  salaryIncome: number;
  otherIncome: number;
}

interface ChartData {
  labels: string[];
  datasets: {
    data: number[];
    backgroundColor: string[];
    borderWidth: number;
  }[];
}

// キャッシュの有効期限（5分）
const CACHE_EXPIRY = 5 * 60 * 1000;

export default function Home() {
  const router = useRouter();
  const { user, profile: authProfile, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [salary, setSalary] = useState<Salary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerInfo, setOwnerInfo] = useState<{ name: string; type: string } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [displayDate, setDisplayDate] = useState(new Date());
  const [newTransaction, setNewTransaction] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });
  const [cache, setCache] = useState<CacheData | null>(null);

  const { totalIncome, totalExpense, categoryExpenses, salaryIncome, otherIncome } = useMemo<TransactionSummary>(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Calculating totals from transactions:', transactions);
      console.log('Raw transactions data for income calculation:', transactions.map(t => ({
        type: t.type,
        amount: t.amount,
        date: t.date,
        category: t.categories?.name
      })));
    }

    // 給与収入とその他の収入を分けて計算
    const salaryIncome = transactions
      .filter(t => t.type === 'income' && t.categories?.name === '給与')
      .reduce((sum, t) => sum + t.amount, 0);

    const otherIncome = transactions
      .filter(t => t.type === 'income' && t.categories?.name !== '給与')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalIncome = salaryIncome + otherIncome;

    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    if (process.env.NODE_ENV === 'development') {
      console.log('Calculated income breakdown:', {
        salary: salaryIncome,
        other: otherIncome,
        total: totalIncome,
        selectedMonth,
        transactionCount: transactions.length
      });
    }

    // カテゴリーごとの支出を計算
    const categoryExpenses: CategoryExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        const category = t.categories?.name || '未分類';
        acc[category] = (acc[category] || 0) + t.amount;
        return acc;
      }, {} as CategoryExpenses);

    return {
      totalIncome,
      totalExpense: expense,
      categoryExpenses,
      salaryIncome,
      otherIncome
    };
  }, [transactions]);

  // 予算と収支の計算
  const budgetCalculations = useMemo(() => {
    const baseBudget = budgets.length > 0 ? budgets[0].amount : 0;
    // 予算額に給与以外の収入を加算
    const adjustedBudget = baseBudget + otherIncome;
    const usedAmount = totalExpense;
    const remainingAmount = Math.max(0, adjustedBudget - usedAmount);

    return {
      baseBudget,
      adjustedBudget,
      usedAmount,
      remainingAmount
    };
  }, [budgets, otherIncome, totalExpense]);

  // チャートデータの作成
  const chartData: ChartData = useMemo(() => {
    const usedAmount = totalExpense;
    const remainingAmount = Math.max(0, budgetCalculations.adjustedBudget - usedAmount);

    return {
      labels: ['使用済み', '残り'],
      datasets: [{
        data: [
          usedAmount,
          remainingAmount
        ],
        backgroundColor: [
          '#EF4444',  // 支出は赤
          '#10B981',  // 残りは緑
        ],
        borderWidth: 0,
      }]
    };
  }, [totalExpense, budgetCalculations]);

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
    rotation: 0,
  }), []);

  // 認証状態のデバッグログ（開発環境のみ）
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Auth state:', { user, profile: authProfile, loading: authLoading });
    }
  }, [user, authProfile, authLoading]);

  // 認証状態に基づく処理
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        setLoading(false);
        return;
      }

      console.log('Fetching data for user:', user.id);
      console.log('Selected month:', selectedMonth);

      // 月の最初の日と最後の日を計算
      const [year, month] = selectedMonth.split('-').map(Number);
      // 次の月の0日目 = 今月の最終日
      const lastDay = new Date(year, month, 0).getDate();
      const firstDay = `${selectedMonth}-01`;
      const lastDayStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      console.log('Date range calculated:', {
        year,
        month,
        firstDay,
        lastDay,
        lastDayStr,
        currentDate: new Date().toISOString().split('T')[0]
      });

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
          .gte('date', firstDay)
          .lte('date', lastDayStr)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', `${selectedMonth}-01`)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('salaries')
          .select('id, amount, payday, last_paid, user_id')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()
      ]);

      // 給与データの詳細をログ出力
      console.log('Salary query result:', {
        data: salaryData.data,
        error: salaryData.error,
        status: salaryData.status,
        statusText: salaryData.statusText
      });

      // 各データの取得結果を詳細にログ出力
      console.log('Transactions query result:', {
        data: transactionsData.data,
        error: transactionsData.error,
        count: transactionsData.data?.length,
        dateRange: { firstDay, lastDayStr }
      });

      // 予算データの詳細をログ出力
      console.log('Budget query details:', {
        month: `${selectedMonth}-01`,
        userId: user.id,
        result: {
          data: budgetsData.data,
          error: budgetsData.error,
          status: budgetsData.status,
          statusText: budgetsData.statusText
        }
      });

      if (transactionsData.error) {
        console.error('Error fetching transactions:', transactionsData.error);
        throw transactionsData.error;
      }
      if (budgetsData.error) {
        console.error('Error fetching budgets:', budgetsData.error);
        throw budgetsData.error;
      }
      if (salaryData.error && salaryData.error.code !== 'PGRST116') {
        console.error('Error fetching salary:', salaryData.error);
        throw salaryData.error;
      }
      if (userData.error) {
        console.error('Error fetching user:', userData.error);
        throw userData.error;
      }

      const transactions = transactionsData.data || [];
      const budgets = budgetsData.data || [];

      // 取得した予算データの詳細をログ出力
      if (budgets.length > 0) {
        console.log('Current budget:', {
          amount: budgets[0].amount,
          month: budgets[0].month,
          created_at: budgets[0].created_at,
          updated_at: budgets[0].updated_at,
          user_id: budgets[0].user_id
        });
      } else {
        console.log('No budget found for the current month');
      }

      console.log('Setting state with:', {
        transactionsCount: transactions.length,
        budgetsCount: budgets.length,
        hasSalary: !!salaryData.data,
        hasUser: !!userData.data
      });

      setTransactions(transactions);
      setBudgets(budgets);
      setSalary(salaryData.data);
      setProfile(userData.data);

      setOwnerInfo({
        name: userData.data?.name || 'あなた',
        type: '個人'
      });
    } catch (error) {
      console.error('Error in fetchData:', error);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [router, selectedMonth]);

  // 初期データ取得
  useEffect(() => {
    fetchData();
  }, [fetchData, selectedMonth]);

  // データの更新を監視
  useEffect(() => {
    console.log('Data updated:', {
      transactions,
      budgets,
      totalIncome,
      totalExpense
    });
  }, [transactions, budgets, totalIncome, totalExpense]);

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

      console.log('Saving transaction:', transactionData);

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

      // フォームをリセット
      setNewTransaction({
        type: 'expense',
        amount: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
        description: ''
      });

      // データを再取得
      await fetchData();
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6 border border-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
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
        <div
          className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
          onClick={() => handleNavigation('/budget')}
        >
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
                  e.stopPropagation();
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
                    <div className="text-base font-semibold text-gray-800 mb-1">
                      残り
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      ¥{budgetCalculations.remainingAmount.toLocaleString()}
                    </div>
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
              <Link
                href="/transactions"
                className="block hover:bg-slate-50 -mx-4 px-4 py-2"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavigation('/transactions');
                }}
              >
                <div className="text-base font-semibold text-gray-900">予算（給与を含む）</div>
                <div className="text-2xl font-bold text-slate-900">
                  {budgets.length > 0 ? (
                    `¥${(budgets[0].amount + otherIncome).toLocaleString()}`
                  ) : (
                    <span className="text-gray-500">設定されていません</span>
                  )}
                </div>
              </Link>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div>
                <Link
                  href="/transactions/income"
                  className="block hover:bg-slate-50 -mx-4 px-4 py-2"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigation('/transactions/income');
                  }}
                >
                  <div className="text-base font-semibold text-gray-900">収入（給与以外）</div>
                  <div className="text-2xl font-bold text-emerald-700">
                    +¥{otherIncome.toLocaleString()}
                  </div>
                </Link>
              </div>
              <div>
                <Link
                  href="/transactions/expense"
                  className="block hover:bg-slate-50 -mx-4 px-4 py-2"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigation('/transactions/expense');
                  }}
                >
                  <div className="text-base font-semibold text-gray-900">支出</div>
                  <div className="text-2xl font-bold text-red-700">
                    -¥{totalExpense.toLocaleString()}
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 給与情報カード */}
      <div className="mt-8 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">給料情報</h2>
          <div className="flex items-center space-x-2">
            <div className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
              <span className="text-sm text-slate-600">給料日設定</span>
            </div>
            <Link
              href="/salary"
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
              設定
            </Link>
          </div>
        </div>
        {salary ? (
          <div className="flex justify-between items-center gap-8">
            <div className="flex-1 space-y-6">
              <div>
                <div className="text-base text-gray-500">次の給料日</div>
                <div className="text-2xl font-bold text-slate-900">
                  {(() => {
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = today.getMonth();
                    const payday = salary.payday;
                    let nextPayday = new Date(year, month, payday);
                    if (today > nextPayday) {
                      nextPayday = new Date(year, month + 1, payday);
                    }
                    const diffTime = nextPayday.getTime() - today.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return (
                      <>
                        {nextPayday.getMonth() + 1}月{payday}日
                        <span className="ml-2 text-base font-normal text-slate-600">
                          （あと{diffDays}日）
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div>
                <div className="text-base text-gray-500">給料額</div>
                <div className="text-2xl font-bold text-slate-900">
                  ¥{salary.amount.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex-1">
              <div className="bg-white rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <button
                    onClick={() => {
                      const newDate = new Date(displayDate);
                      newDate.setMonth(newDate.getMonth() - 1);
                      setDisplayDate(newDate);
                    }}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="font-medium text-slate-700">
                    {displayDate.getFullYear()}年{displayDate.getMonth() + 1}月
                  </div>
                  <button
                    onClick={() => {
                      const newDate = new Date(displayDate);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setDisplayDate(newDate);
                    }}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
                    <div key={day} className="text-center text-sm text-slate-500">
                      {day}
                    </div>
                  ))}
                  {(() => {
                    const firstDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1);
                    const lastDay = new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 0);
                    const days = [];
                    const today = new Date();

                    // 月初めの空きマスを追加
                    for (let i = 0; i < firstDay.getDay(); i++) {
                      days.push(<div key={`empty-${i}`}></div>);
                    }

                    // 日付を追加
                    for (let i = 1; i <= lastDay.getDate(); i++) {
                      const isPayday = i === salary.payday;
                      const isToday = i === today.getDate() &&
                        today.getMonth() === displayDate.getMonth() &&
                        today.getFullYear() === displayDate.getFullYear();

                      days.push(
                        <div
                          key={i}
                          className="relative"
                        >
                          <div
                            className={`rounded-full w-8 h-8 flex items-center justify-center mx-auto
                              ${isPayday ? 'bg-blue-500 text-white font-bold' : ''}
                              ${isToday && !isPayday ? 'border-2 border-slate-300' : ''}
                              ${!isPayday && !isToday ? 'text-slate-700' : ''}
                            `}
                          >
                            {i}
                          </div>
                          {i === salary.payday && (
                            <div className="absolute -top-1 right-1 w-2 h-2 rounded-full bg-red-500"></div>
                          )}
                        </div>
                      );
                    }

                    return days;
                  })()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-500 mb-4">給与情報が設定されていません</p>
            <Link
              href="/salary"
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              給与情報を設定する
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
