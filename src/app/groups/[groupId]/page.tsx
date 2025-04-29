'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface Transaction {
  id: number;
  amount: number;
  category: string;
  date: string;
  type: 'income' | 'expense';
}

export default function GroupPage(
  props: {
    params: Promise<{ groupId: string }>;
  }
) {
  const params = use(props.params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      fetchTransactions();
    }
  }, [authLoading, user]);

  const fetchTransactions = async () => {
    try {
      // TODO: グループの取引履歴を取得する処理を実装
      setTransactions([]);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      setError(error.message || '取引履歴の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-8">
          <div className="flex items-center">
            <Link
              href="/groups"
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              グループ一覧に戻る
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">グループの管理</h1>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
            {error}
          </div>
        )}

        {/* 今月の収支カード */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">今月の収支</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50 rounded-lg">
              <p className="text-sm text-emerald-700 mb-1">収入</p>
              <p className="text-2xl font-bold text-emerald-700">
                ¥{transactions
                  .filter(t => t.type === 'income')
                  .reduce((sum, t) => sum + t.amount, 0)
                  .toLocaleString()}
              </p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-red-700 mb-1">支出</p>
              <p className="text-2xl font-bold text-red-700">
                ¥{transactions
                  .filter(t => t.type === 'expense')
                  .reduce((sum, t) => sum + t.amount, 0)
                  .toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* 最近の取引カード */}
        <div className="mt-8 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">最近の取引</h2>
            <Link
              href={`/groups/${params.groupId}/transactions`}
              className="text-blue-500 hover:text-blue-600 text-sm"
            >
              すべて表示 →
            </Link>
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

        {/* アクションカード */}
        <div className="mt-8 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">アクション</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href={`/groups/${params.groupId}/add`}
              className="inline-block bg-blue-500 text-white py-2 px-4 rounded-md text-center hover:bg-blue-600 transition-colors"
            >
              新規記録を追加
            </Link>
            <Link
              href={`/groups/${params.groupId}/members/new`}
              className="inline-block bg-blue-100 text-blue-700 py-2 px-4 rounded-md text-center hover:bg-blue-200 transition-colors"
            >
              メンバーを追加
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
} 