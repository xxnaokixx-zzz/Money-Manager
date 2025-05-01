'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Transaction {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  date: string;
  description?: string;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [salaryInfo, setSalaryInfo] = useState<{
    date: string;
    amount: number;
    user_id: string;
  } | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<Array<{
    date: string;
    amount: number;
    user_id: string;
    group_id: number;
  }>>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!isMounted) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        // 特定のユーザーIDの給料情報を取得
        const { data: salaryData, error: salaryError } = await supabase
          .from('salaries')
          .select('date, amount, user_id')
          .eq('user_id', '223b958f-bb7e-45d7-9880-5c0a2e9220be')
          .single();

        if (!salaryError && salaryData) {
          setSalaryInfo(salaryData);
        }

        // グループID 31の給与自動加算履歴を取得
        const { data: historyData, error: historyError } = await supabase
          .from('salary_additions')
          .select(`
            date,
            amount,
            user_id,
            group_id
          `)
          .eq('group_id', 31)
          .order('date', { ascending: false });

        if (!historyError && historyData) {
          setSalaryHistory(historyData);
        }

        // 選択された月の最初の日と最後の日を計算
        const [year, month] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const firstDay = `${selectedMonth}-01`;
        const lastDayStr = `${selectedMonth}-${lastDay.toString().padStart(2, '0')}`;

        const { data, error } = await supabase
          .from('transactions')
          .select(`
            *,
            category:categories (
              id,
              name,
              type
            )
          `)
          .eq('user_id', user.id)
          .gte('date', firstDay)
          .lte('date', lastDayStr)
          .order('date', { ascending: false });

        console.log('Fetched transactions:', data); // デバッグ用

        if (!isMounted) return;

        if (error) throw error;

        // カテゴリー情報を含むデータに変換
        const transformedData = data?.map(transaction => {
          console.log('Processing transaction:', transaction); // デバッグ用
          return {
            id: transaction.id,
            type: transaction.type,
            amount: transaction.amount,
            category: transaction.category?.name || '未分類',
            date: transaction.date,
            description: transaction.description
          };
        }) as Transaction[];

        console.log('Transformed transactions:', transformedData); // デバッグ用

        setTransactions(transformedData);
        const income = transformedData?.filter(t => t.type === 'income')
          .reduce((sum, t) => sum + t.amount, 0) || 0;
        const expense = transformedData?.filter(t => t.type === 'expense')
          .reduce((sum, t) => sum + t.amount, 0) || 0;

        setTotalIncome(income);
        setTotalExpense(expense);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching transactions:', error);
        setError('取引履歴の取得に失敗しました');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [selectedMonth, router]);

  const handleNavigation = (href: string) => {
    setIsLoading(true);
    router.push(href);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この取引を削除してもよろしいですか？')) return;

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTransactions(transactions.filter(t => t.id !== id));
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <button
                onClick={() => handleNavigation('/')}
                className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m-4 0h4" />
                </svg>
                ホームに戻る
              </button>
              <h1 className="text-2xl font-bold text-gray-800">取引履歴</h1>
            </div>
            <button
              onClick={() => handleNavigation('/add')}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              <svg
                className="w-5 h-5 mr-2"
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
              新規記録
            </button>
          </div>
        </div>

        {salaryInfo && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">給料情報</h2>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500">ユーザーID</div>
                <div className="text-lg font-medium text-gray-900">
                  {salaryInfo.user_id}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">今月の給料日</div>
                <div className="text-lg font-medium text-gray-900">
                  {new Date(salaryInfo.date).toLocaleDateString('ja-JP')}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">給料額</div>
                <div className="text-lg font-medium text-gray-900">
                  ¥{salaryInfo.amount.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {salaryHistory.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">グループID 31の給与自動加算履歴</h2>
            <div className="space-y-4">
              {salaryHistory.map((history, index) => (
                <div key={index} className="flex justify-between items-center">
                  <div>
                    <div className="text-sm text-gray-500">
                      {new Date(history.date).toLocaleDateString('ja-JP')}
                    </div>
                    <div className="text-xs text-gray-400">
                      ユーザーID: {history.user_id}
                    </div>
                    <div className="text-xs text-gray-400">
                      グループID: {history.group_id}
                    </div>
                  </div>
                  <div className="text-lg font-medium text-gray-900">
                    ¥{history.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">収入</h2>
            <div className="text-3xl font-bold text-green-600">
              ¥{totalIncome.toLocaleString()}
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">支出</h2>
            <div className="text-3xl font-bold text-red-600">
              ¥{totalExpense.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="p-2 border rounded-md"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    日付
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    カテゴリー
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    金額
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(transaction.date).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.category}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {transaction.type === 'income' ? '+' : '-'}
                      ¥{transaction.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => handleDelete(transaction.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
} 