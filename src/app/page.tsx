'use client';

import { useState, useEffect } from 'react';
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
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const checkAndAddSalary = async (salary: Salary) => {
    const today = new Date();
    const currentDay = today.getDate();
    const lastPaid = new Date(salary.last_paid);
    const currentMonth = today.getMonth();
    const lastPaidMonth = lastPaid.getMonth();

    // 給料日が来ていて、まだ今月支払われていない場合
    if (currentDay >= salary.payday &&
      (currentMonth !== lastPaidMonth ||
        (currentMonth === lastPaidMonth && currentDay > lastPaid.getDate()))) {

      try {
        // 給料を取引として記録
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

        // 予算を更新
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
          // 既存の予算を更新
          const { error: updateError } = await supabase
            .from('budgets')
            .update({ amount: budgetData.amount + salary.amount })
            .eq('id', budgetData.id);

          if (updateError) throw updateError;
        } else {
          // 新規予算を作成
          const { error: insertError } = await supabase
            .from('budgets')
            .insert([{ amount: salary.amount, month: `${currentMonthStr}-01` }]);

          if (insertError) throw insertError;
        }

        // 最後の支払い日を更新
        const { error: salaryError } = await supabase
          .from('salaries')
          .update({ last_paid: today.toISOString().split('T')[0] })
          .eq('id', salary.id);

        if (salaryError) throw salaryError;

        // データを再取得
        fetchData();
      } catch (err) {
        console.error('Error adding salary:', err);
        setError('給料の自動追加に失敗しました');
      }
    }
  };

  const fetchData = async () => {
    try {
      // 取引データの取得
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

      if (transactionsError) throw transactionsError;

      // 予算データの取得
      const currentMonth = new Date().toISOString().split('T')[0].slice(0, 7);
      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select('*')
        .eq('month', `${currentMonth}-01`)
        .single();

      if (budgetError && budgetError.code !== 'PGRST116') {
        throw budgetError;
      }

      // 給料データの取得
      const { data: salaryData, error: salaryError } = await supabase
        .from('salaries')
        .select('*')
        .single();

      if (salaryError && salaryError.code !== 'PGRST116') {
        throw salaryError;
      }

      if (transactionsData) {
        setTransactions(transactionsData);

        const income = transactionsData
          .filter(t => t.type === 'income')
          .reduce((sum, t) => sum + t.amount, 0);

        const expense = transactionsData
          .filter(t => t.type === 'expense')
          .reduce((sum, t) => sum + t.amount, 0);

        setTotalIncome(income);
        setTotalExpense(expense);
      }

      if (budgetData) {
        setBudget(budgetData);
      }

      if (salaryData) {
        setSalary(salaryData);
        // 給料日のチェックと自動加算
        checkAndAddSalary(salaryData);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const chartData = {
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
  };

  const chartOptions = {
    cutout: '70%',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
      },
    },
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <p>読み込み中...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
          >
            再試行
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* ヘッダーセクション */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">
            Money Manager
          </h1>
          <p className="text-xl text-gray-600">
            あなたの支出と収入を簡単に管理
          </p>
        </div>

        {/* 予算サマリーセクション */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-12">
          <div className="flex flex-col items-center">
            <div className="relative w-64 h-64 mb-8">
              <Doughnut data={chartData} options={chartOptions} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-500 text-sm">残り予算</p>
                  <p className="text-3xl font-bold text-gray-800">
                    {budget
                      ? Math.max(0, budget.amount - totalExpense).toLocaleString()
                      : Math.max(0, totalIncome - totalExpense).toLocaleString()}円
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 text-center">
              <div>
                <p className="text-gray-500 text-sm">
                  {budget ? '予算額' : '総収入'}
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {budget
                    ? budget.amount.toLocaleString()
                    : totalIncome.toLocaleString()}円
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">総支出</p>
                <p className="text-2xl font-bold text-red-600">
                  {totalExpense.toLocaleString()}円
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* クイックアクセスカード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link
            href="/transactions"
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow transform hover:-translate-y-1"
          >
            <div className="text-blue-500 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">取引履歴</h2>
            <p className="text-gray-600">収入と支出の記録を確認</p>
          </Link>

          <Link
            href="/add"
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow transform hover:-translate-y-1"
          >
            <div className="text-green-500 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">新規記録</h2>
            <p className="text-gray-600">収入または支出を記録</p>
          </Link>

          <Link
            href="/salary"
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow transform hover:-translate-y-1"
          >
            <div className="text-yellow-500 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">給料設定</h2>
            <p className="text-gray-600">給料日と金額を設定</p>
          </Link>

          <Link
            href="/budget"
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow transform hover:-translate-y-1"
          >
            <div className="text-purple-500 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">予算管理</h2>
            <p className="text-gray-600">予算の設定と管理</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
