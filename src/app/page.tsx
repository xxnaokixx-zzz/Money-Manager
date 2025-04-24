'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { supabase } from '@/lib/supabase';

// Chart.jsの初期化
ChartJS.register(ArcElement, Tooltip, Legend);

interface Transaction {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  date: string;
}

interface Budget {
  id: number;
  amount: number;
  month: string;
}

interface Salary {
  id: number;
  amount: number;
  payday: number;
  last_paid: string;
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [salary, setSalary] = useState<Salary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { totalIncome, totalExpense } = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    return { totalIncome: income, totalExpense: expense };
  }, [transactions]);

  const checkAndAddSalary = useCallback(async (salary: Salary) => {
    const today = new Date();
    const currentDay = today.getDate();
    const lastPaid = new Date(salary.last_paid);
    const currentMonth = today.getMonth();
    const lastPaidMonth = lastPaid.getMonth();

    if (currentDay >= salary.payday &&
      (currentMonth !== lastPaidMonth ||
        (currentMonth === lastPaidMonth && currentDay > lastPaid.getDate()))) {
      try {
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert([{
            type: 'income',
            amount: salary.amount,
            category: '給与',
            date: today.toISOString().split('T')[0],
            description: '給料'
          }]);

        if (transactionError) throw transactionError;

        const currentMonthStr = today.toISOString().split('T')[0].slice(0, 7);
        const { data: budgetData, error: budgetError } = await supabase
          .from('budgets')
          .select('*')
          .eq('month', `${currentMonthStr}-01`)
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
            .insert([{ amount: salary.amount, month: `${currentMonthStr}-01` }]);

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
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [
        { data: transactionsData, error: transactionsError },
        { data: budgetData, error: budgetError },
        { data: salaryData, error: salaryError }
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false }),
        supabase
          .from('budgets')
          .select('*')
          .eq('month', `${new Date().toISOString().split('T')[0].slice(0, 7)}-01`)
          .single(),
        supabase
          .from('salaries')
          .select('*')
          .single()
      ]);

      if (transactionsError) throw transactionsError;
      if (budgetError && budgetError.code !== 'PGRST116') throw budgetError;
      if (salaryError && salaryError.code !== 'PGRST116') throw salaryError;

      if (transactionsData) {
        setTransactions(transactionsData);
      }

      if (budgetData) {
        setBudget(budgetData);
      }

      if (salaryData) {
        setSalary(salaryData);
        await checkAndAddSalary(salaryData);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [checkAndAddSalary]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = useMemo(() => ({
    labels: ['使用済み', '残り'],
    datasets: [
      {
        data: [
          totalExpense,
          budget ? Math.max(0, budget.amount - totalExpense) : Math.max(0, totalIncome - totalExpense)
        ],
        backgroundColor: ['#EF4444', '#10B981'],
        borderWidth: 0,
      },
    ],
  }), [totalExpense, budget, totalIncome]);

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
          <h2 className="text-lg font-semibold mb-4 text-slate-900">今月の予算状況</h2>
          <div className="aspect-square relative">
            <Doughnut data={chartData} options={chartOptions} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-sm text-slate-700">残り</div>
                <div className="text-2xl font-bold text-slate-900">
                  ¥{budget
                    ? Math.max(0, budget.amount - totalExpense).toLocaleString()
                    : Math.max(0, totalIncome - totalExpense).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
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
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">最近の取引</h2>
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
