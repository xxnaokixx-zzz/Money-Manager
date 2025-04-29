'use client';

import { useState, useEffect, useMemo, useCallback, Suspense, use } from 'react';
import Link from 'next/link';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { supabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';

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
}

interface Budget {
  id: number;
  amount: number;
  category_id: number;
  category?: string;
  group_id: number;
}

interface Group {
  id: number;
  name: string;
  description: string;
  created_at: string;
  created_by: string;
  members: {
    user_id: string;
    name: string;
    role: string;
  }[];
}

interface Salary {
  id: number;
  amount: number;
  payday: number;
  user_id: string;
}

export default function GroupHomePage(props: { params: Promise<{ groupId: string }> }) {
  const params = use(props.params);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [salary, setSalary] = useState<Salary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));
  const router = useRouter();
  const { user } = useAuth();

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

  // チャート用のデータを準備
  const chartData: ChartData = useMemo(() => {
    const initialBudget = budgets.length > 0 ? budgets[0].amount : 0;
    const currentTotal = initialBudget + totalIncome - totalExpense; // 現在の合計額

    // 予算額(initialBudget)を下回っている分を計算
    const amountBelowBudget = Math.max(0, initialBudget - currentTotal);
    const amountWithinBudget = totalExpense - amountBelowBudget;

    return {
      labels: ['予算割れ分', '使用済み', '残り'],
      datasets: [{
        data: [
          currentTotal < initialBudget ? amountBelowBudget : 0,
          amountWithinBudget,
          Math.max(0, currentTotal)
        ],
        backgroundColor: [
          '#EF4444',  // 予算額を下回った分は赤
          '#10B981',  // 予算内は緑
          '#10B981'   // 残りは緑
        ],
        borderWidth: 0,
      }]
    };
  }, [totalExpense, budgets, totalIncome]);

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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        setLoading(false);
        return;
      }

      // グループ情報の取得
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', params.groupId)
        .single();

      if (groupError) {
        console.error('Group fetch error:', groupError);
        throw new Error(`グループ情報の取得に失敗しました: ${groupError.message}`);
      }

      setGroup(groupData);

      // 取引データの取得
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .eq('group_id', params.groupId)
        .gte('date', `${selectedMonth}-01`)
        .lte('date', new Date(new Date(`${selectedMonth}-01`).getFullYear(), new Date(`${selectedMonth}-01`).getMonth() + 1, 0).toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (transactionsError) {
        console.error('Transactions fetch error:', transactionsError);
        throw new Error(`取引データの取得に失敗しました: ${transactionsError.message}`);
      }

      setTransactions(transactionsData || []);

      // 予算データの取得
      const { data: budgetsData, error: budgetsError } = await supabase
        .from('group_budgets')
        .select('*')
        .eq('group_id', params.groupId);

      if (budgetsError) {
        console.error('Budgets fetch error:', budgetsError);
        throw new Error(`予算データの取得に失敗しました: ${budgetsError.message}`);
      }

      setBudgets(budgetsData || []);

      // 給料情報の取得
      const { data: salaryData, error: salaryError } = await supabase
        .from('salaries')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (salaryError && salaryError.code !== 'PGRST116') {
        console.error('Salary fetch error:', salaryError);
        throw new Error(`給料情報の取得に失敗しました: ${salaryError.message}`);
      }

      setSalary(salaryData);

    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error instanceof Error ? error.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [params.groupId, selectedMonth, router]);

  useEffect(() => {
    fetchData();
  }, [params.groupId]);

  const handleNavigation = useCallback((path: string) => {
    setLoading(true);
    router.push(path);
  }, [router]);

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

  if (!group) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-yellow-100 text-yellow-700 p-4 rounded-lg mb-6 border border-yellow-200">
          グループが見つかりません
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800">{group.name}</h1>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/groups')}
            className="inline-flex items-center px-4 py-2 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
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
            グループ一覧に戻る
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              予算状況
            </h2>
            <div className="flex space-x-2">
              <Link
                href={`/groups/${params.groupId}/budget`}
                className="inline-flex items-center px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavigation(`/groups/${params.groupId}/budget`);
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
                href={`/groups/${params.groupId}/transactions`}
                className="inline-flex items-center px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavigation(`/groups/${params.groupId}/transactions`);
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
                      ¥{Math.max(0, (budgets[0].amount + totalIncome - totalExpense)).toLocaleString()}
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
                      ¥{(budgets[0].amount + totalIncome - totalExpense).toLocaleString()}
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
              href={`/groups/${params.groupId}/transactions/new`}
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
              href={`/groups/${params.groupId}/transactions`}
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