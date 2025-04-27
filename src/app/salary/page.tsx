'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface Salary {
  id: number;
  amount: number;
  payday: number; // 1-31の日付
  last_paid: string; // 最後に支払われた日付
}

export default function SalaryPage() {
  const router = useRouter();
  const [salary, setSalary] = useState<Salary | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [payday, setPayday] = useState('25');

  useEffect(() => {
    fetchSalary();
  }, []);

  const fetchSalary = async () => {
    try {
      const { data, error } = await supabase
        .from('salaries')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSalary(data);
        setAmount(data.amount.toString());
        setPayday(data.payday.toString());
      }
    } catch (error) {
      console.error('Error fetching salary:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (salary) {
        // 既存の給料情報を更新
        const { error } = await supabase
          .from('salaries')
          .update({
            amount: parseInt(amount),
            payday: parseInt(payday),
            last_paid: salary.last_paid
          })
          .eq('id', salary.id);

        if (error) throw error;
      } else {
        // 新規給料情報を作成
        const { error } = await supabase
          .from('salaries')
          .insert([{
            amount: parseInt(amount),
            payday: parseInt(payday),
            last_paid: new Date().toISOString().split('T')[0]
          }]);

        if (error) throw error;
      }

      router.push('/');
    } catch (error) {
      console.error('Error saving salary:', error);
      alert('給料情報の保存に失敗しました');
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
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center mb-8">
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m-4 0h4" />
            </svg>
            ホームに戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-800">給与設定</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              給料額
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder="給料額を入力"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              給料日
            </label>
            <select
              value={payday}
              onChange={(e) => setPayday(e.target.value)}
              className="w-full p-2 border rounded-md"
              required
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}日
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600"
          >
            {salary ? '給料情報を更新' : '給料情報を設定'}
          </button>
        </form>
      </div>
    </main>
  );
} 