'use client';

import { useState, useEffect, useMemo, useCallback, Suspense, MouseEvent } from 'react';
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

// リップルエフェクト用の関数
function createRipple(e: MouseEvent<HTMLAnchorElement>) {
  const button = e.currentTarget;
  const circle = document.createElement('span');
  const diameter = Math.max(button.clientWidth, button.clientHeight);
  const radius = diameter / 2;
  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${e.clientX - button.getBoundingClientRect().left - radius}px`;
  circle.style.top = `${e.clientY - button.getBoundingClientRect().top - radius}px`;
  circle.classList.add('ripple');
  const ripple = button.getElementsByClassName('ripple')[0];
  if (ripple) {
    ripple.remove();
  }
  button.appendChild(circle);
}

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
      const lastDay = new Date(year, month, 0).getDate();
      const firstDay = `${selectedMonth}-01`;
      const lastDayStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

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
          .select('id, amount, payday, last_paid, user_id, created_at')
          .eq('user_id', user.id)
          .eq('last_paid', firstDay)
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
        statusText: salaryData.statusText,
        month: selectedMonth,
        firstDay,
        lastDayStr,
        lastPaid: salaryData.data?.last_paid,
        payday: salaryData.data?.payday,
        amount: salaryData.data?.amount,
        created_at: salaryData.data?.created_at
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
    <main className="min-h-screen bg-gradient-to-b from-blue-100 via-white to-blue-50 animate-fade-in">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* ヘッダー部分 */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-8 gap-2 sm:gap-0">
          <div className="flex-1 flex items-center">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 text-left tracking-tight animate-fade-in-up">ホーム</h1>
          </div>
          <div className="flex flex-wrap gap-2 items-center justify-end">
            <Link
              href="/transactions/income"
              className="inline-flex items-center px-3 py-2 bg-emerald-500 text-white rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all duration-200 text-sm font-semibold"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              収入を記録
            </Link>
            <Link
              href="/transactions/expense"
              className="inline-flex items-center px-3 py-2 bg-red-500 text-white rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all duration-200 text-sm font-semibold"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
              支出を記録
            </Link>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6 animate-fade-in-down shadow-md">
            {error}
          </div>
        )}

        {/* メインコンテンツ */}
        <div className="space-y-6">
          {/* 予算カード */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-md border border-slate-200 animate-fade-in-up hover:shadow-xl transition-shadow duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-2 sm:space-y-0">
              <div className="flex items-center">
                <h2 className="text-lg font-semibold text-gray-800">予算</h2>
                <span className="ml-2 text-sm text-gray-500">
                  {selectedMonth}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const [year, month] = selectedMonth.split('-').map(Number);
                    const newDate = new Date(year, month - 2, 1);
                    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const [year, month] = selectedMonth.split('-').map(Number);
                    const newDate = new Date(year, month, 1);
                    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : budgets.length > 0 ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <p className="text-sm text-gray-500">予算額</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ¥{budgets[0].amount.toLocaleString()}
                    </p>
                  </div>
                  <Link
                    href={`/budget?month=${selectedMonth}`}
                    className="inline-flex items-center px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    予算を設定
                  </Link>
                </div>

                {/* 円グラフ */}
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

                <div className="border-t border-slate-200 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">予算が設定されていません</p>
                <Link
                  href={`/budget?month=${selectedMonth}`}
                  className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  予算を設定する
                </Link>
              </div>
            )}
          </div>

          {/* 給与情報カード */}
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-2 sm:space-y-0">
              <h2 className="text-lg font-semibold text-gray-800">給料情報</h2>
              <div className="flex items-center space-x-2">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
                  <span className="text-sm text-slate-600">給料日設定</span>
                </div>
                <Link
                  href={`/salary?month=${selectedMonth}`}
                  className="inline-flex items-center px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  設定
                </Link>
              </div>
            </div>
            {salary ? (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500">給料日</div>
                  <div className="text-xl sm:text-2xl font-bold text-slate-900">
                    {(() => {
                      const [year, month] = selectedMonth.split('-').map(Number);
                      const payday = salary.payday;
                      return `${year}/${month}/${payday}`;
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">給料額</div>
                  <div className="text-xl sm:text-2xl font-bold text-slate-900">
                    ¥{salary.amount.toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-500 mb-4">給与情報が設定されていません</p>
                <Link
                  href={`/salary?month=${selectedMonth}`}
                  className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  給与情報を設定する
                </Link>
              </div>
            )}
          </div>

          {/* 最近の取引 */}
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">最近の取引</h2>
              <Link
                href="/transactions"
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                すべて見る
              </Link>
            </div>
            {transactions.length > 0 ? (
              <div className="space-y-4">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
                    onClick={() => handleNavigation('/transactions')}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${transaction.type === 'income' ? 'bg-emerald-100' : 'bg-red-100'
                        }`}>
                        <svg className={`w-5 h-5 ${transaction.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                            transaction.type === 'income' ? 'M12 6v6m0 0v6m0-6h6m-6 0H6' : 'M20 12H4'
                          } />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{transaction.description}</p>
                        <p className="text-sm text-gray-500">{transaction.categories?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${transaction.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                        {transaction.type === 'income' ? '+' : '-'}¥{transaction.amount.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(transaction.date).toLocaleDateString('ja-JP', {
                          month: 'numeric',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-500">取引がありません</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
