'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase-browser';
import Link from 'next/link';
import TransactionEditModal from '@/components/TransactionEditModal';

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

export default function AllTransactions() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [nextSalaryInfo, setNextSalaryInfo] = useState<{ date: string; amount: number } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        // 月の最初の日と最後の日を計算
        const [year, month] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const firstDay = `${selectedMonth}-01`;
        const lastDayStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

        const { data, error } = await supabase
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
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTransactions(data || []);
      } catch (error) {
        console.error('Error fetching transactions:', error);
        setError('データの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [router, selectedMonth]);

  useEffect(() => {
    const fetchNextSalaryInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        // 今月の給料日を取得
        const { data: currentMonthSalary, error: currentError } = await supabase
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
          .eq('type', 'income')
          .eq('categories.name', '給与')
          .gte('date', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`)
          .lte('date', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-31`)
          .order('date', { ascending: true })
          .limit(1);

        if (currentError) throw currentError;

        // 今月の給料が見つからない場合は来月の給料を取得
        if (!currentMonthSalary || currentMonthSalary.length === 0) {
          const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
          const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;

          const { data: nextMonthSalary, error: nextError } = await supabase
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
            .eq('type', 'income')
            .eq('categories.name', '給与')
            .gte('date', `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`)
            .lte('date', `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-31`)
            .order('date', { ascending: true })
            .limit(1);

          if (nextError) throw nextError;
          if (nextMonthSalary && nextMonthSalary.length > 0) {
            setNextSalaryInfo({
              date: nextMonthSalary[0].date,
              amount: nextMonthSalary[0].amount
            });
          }
        } else {
          setNextSalaryInfo({
            date: currentMonthSalary[0].date,
            amount: currentMonthSalary[0].amount
          });
        }
      } catch (error) {
        console.error('Error fetching salary info:', error);
      }
    };

    fetchNextSalaryInfo();
  }, [user, authLoading]);

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const handleTransactionClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsEditModalOpen(true);
  };

  const handleTransactionUpdate = () => {
    // 取引一覧を再取得
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        const [year, month] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const firstDay = `${selectedMonth}-01`;
        const lastDayStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

        const { data, error } = await supabase
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
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTransactions(data || []);
      } catch (error) {
        console.error('Error fetching transactions:', error);
        setError('データの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  };

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
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800">取引履歴</h1>
        <div className="flex space-x-2">
          <Link
            href="/add"
            className="inline-flex items-center px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            取引を追加
          </Link>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
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
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            戻る
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <div className="flex justify-between items-center">
            <div className="space-y-4">
              <div>
                <div className="text-sm text-slate-700">収入合計</div>
                <div className="text-2xl font-bold text-emerald-700">
                  +¥{totalIncome.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-700">支出合計</div>
                <div className="text-2xl font-bold text-red-700">
                  -¥{totalExpense.toLocaleString()}
                </div>
              </div>
            </div>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
                  種類
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  カテゴリー
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  金額
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  メモ
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  onClick={() => handleTransactionClick(transaction)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {new Date(transaction.date).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {transaction.type === 'income' ? '収入' : '支出'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`${transaction.categories?.name === '給与' ? 'font-bold' : ''}`}>
                      {transaction.categories?.name || '未分類'}
                    </span>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${transaction.type === 'income' ? 'text-emerald-700' : 'text-red-700'
                    }`}>
                    {transaction.type === 'income' ? '+' : '-'}
                    ¥{transaction.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {transaction.description || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTransaction && (
        <TransactionEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          transaction={selectedTransaction}
          onUpdate={handleTransactionUpdate}
        />
      )}
    </div>
  );
} 