'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-browser';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';

interface Salary {
  id: number;
  amount: number;
  payday: number;
  user_id: string;
}

export default function SalaryPage() {
  const router = useRouter();
  const { user, loading: authLoading, initialized } = useAuth();
  const [salary, setSalary] = useState<Salary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSalary = async () => {
    try {
      if (!user) {
        console.log('fetchSalary skipped: user not ready');
        return;
      }

      console.log('Fetching salary data for user:', user.id);

      // 給与データを取得（最新のものから順に）
      const { data, error: salaryError } = await supabase
        .from('salaries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      console.log('Fetch salary response:', {
        recordCount: data?.length,
        records: data,
        error: salaryError
      });

      if (salaryError) {
        throw salaryError;
      }

      if (!data || data.length === 0) {
        console.log('No salary data found for user');
        setSalary(null);
        setError(null);
        return;
      }

      // 最新のデータを使用
      const latestSalary = data[0];
      console.log('Latest salary data:', {
        amount: latestSalary.amount,
        payday: latestSalary.payday,
        last_paid: latestSalary.last_paid,
        created_at: latestSalary.created_at
      });

      // データの検証
      if (typeof latestSalary.amount !== 'number' || latestSalary.amount <= 0) {
        console.error('Invalid salary amount:', latestSalary.amount);
        setError('給与額が無効です。正しい値を設定してください。');
        setSalary(null);
        return;
      }

      if (typeof latestSalary.payday !== 'number' || latestSalary.payday < 1 || latestSalary.payday > 31) {
        console.error('Invalid payday:', latestSalary.payday);
        setError('給与日が無効です。正しい値を設定してください。');
        setSalary(null);
        return;
      }

      setSalary(latestSalary);
      setError(null);
    } catch (error) {
      console.error('Error fetching salary:', {
        error,
        message: error instanceof Error ? error.message : '不明なエラー',
        stack: error instanceof Error ? error.stack : undefined
      });
      setError(error instanceof Error ? error.message : '給与情報の取得に失敗しました');
      setSalary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initializePage = async () => {
      try {
        if (!initialized || authLoading) {
          console.log('Waiting for auth initialization...');
          return;
        }

        if (!user) {
          console.log('ユーザーが未認証のためログインページへ遷移');
          router.push('/login');
          return;
        }

        await fetchSalary();

        // テーブル構造の確認
        const { data, error } = await supabase
          .from('salaries')
          .select('*')
          .limit(1);

        console.log('Salaries table structure:', {
          fullData: data,
          columns: data && data[0] ? Object.entries(data[0]).map(([key, value]) => ({
            name: key,
            type: typeof value,
            value: value
          })) : [],
          error
        });
      } catch (error) {
        console.error('Error during page initialization:', error);
        setError('ページの初期化中にエラーが発生しました');
      }
    };

    initializePage();
  }, [initialized, authLoading, user]);

  const handleSalaryUpdate = async (amount: number, payday: number) => {
    try {
      setLoading(true);
      if (!user) throw new Error('ユーザーが見つかりません');

      // 入力値の検証
      if (typeof amount !== 'number' || amount <= 0) {
        throw new Error('給与額は0より大きい値を入力してください');
      }
      if (typeof payday !== 'number' || payday < 1 || payday > 31) {
        throw new Error('給与日は1から31の間で入力してください');
      }

      console.log('Starting salary update:', {
        user_id: user.id,
        amount,
        payday,
        currentDate: new Date().toISOString()
      });

      // 既存のレコードを確認
      const { data: existingData, error: checkError } = await supabase
        .from('salaries')
        .select('*')
        .eq('user_id', user.id);

      if (checkError) {
        console.error('Error checking existing salary:', checkError);
        throw checkError;
      }

      console.log('Existing salary records:', {
        count: existingData?.length,
        records: existingData
      });

      // 既存のレコードを削除
      if (existingData && existingData.length > 0) {
        const { error: deleteError } = await supabase
          .from('salaries')
          .delete()
          .eq('user_id', user.id);

        if (deleteError) {
          console.error('Delete error:', deleteError);
          throw deleteError;
        }
        console.log('Successfully deleted existing records');
      }

      // 給与日の計算（月末調整）
      const currentDate = new Date();
      const monthLastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      const adjustedPayday = Math.min(payday, monthLastDay);
      const lastPaid = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        adjustedPayday
      ).toISOString().split('T')[0];

      console.log('Calculated payment date:', {
        payday,
        monthLastDay,
        adjustedPayday,
        lastPaid
      });

      // 新しいレコードを挿入
      const { data: insertedData, error: insertError } = await supabase
        .from('salaries')
        .insert({
          user_id: user.id,
          amount,
          payday,
          last_paid: lastPaid
        })
        .select();

      console.log('Insert response:', {
        data: insertedData,
        error: insertError,
        code: insertError?.code,
        message: insertError?.message
      });

      if (insertError) {
        console.error('Insert Error:', insertError);
        throw insertError;
      }

      // データベースの状態を確認
      const { data: verifyData, error: verifyError } = await supabase
        .from('salaries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (verifyError) {
        console.error('Error verifying data:', verifyError);
        throw verifyError;
      }

      console.log('Database state after update:', {
        recordCount: verifyData?.length,
        latestRecord: verifyData?.[0],
        allRecords: verifyData
      });

      // 最新のデータを状態に反映
      if (verifyData && verifyData.length > 0) {
        const latestSalary = verifyData[0];
        if (typeof latestSalary.amount !== 'number' || latestSalary.amount <= 0) {
          console.error('Invalid salary data detected:', latestSalary);
          throw new Error('給与データが不正です');
        }
        setSalary(latestSalary);
        setError(null);
        console.log('Successfully updated salary state:', latestSalary);
      } else {
        console.error('No salary data found after update');
        throw new Error('給与データの更新に失敗しました');
      }
    } catch (error) {
      console.error('Error handling salary:', {
        error,
        message: error instanceof Error ? error.message : '不明なエラー',
        stack: error instanceof Error ? error.stack : undefined
      });
      setError(error instanceof Error ? error.message : '給与情報の更新に失敗しました');
      setSalary(null);
    } finally {
      setLoading(false);
    }
  };

  if (!initialized || authLoading) {
    return (
      <AuthGuard>
        <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          </div>
        </main>
      </AuthGuard>
    );
  }

  if (loading) {
    return (
      <AuthGuard>
        <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          </div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center mb-8">
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              ホームに戻る
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">給与設定</h1>
          </div>

          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">給与情報</h3>
                {loading ? (
                  <p className="mt-2 text-gray-500">読み込み中...</p>
                ) : salary === null ? (
                  <p className="mt-2 text-gray-500">給与情報がまだ登録されていません。</p>
                ) : (
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">現在の給与</p>
                    <p className="font-semibold text-blue-500">
                      ¥{salary.amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      毎月 {salary.payday} 日支払い
                    </p>
                  </div>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const amount = parseInt(formData.get('amount') as string);
                const payday = parseInt(formData.get('payday') as string);
                handleSalaryUpdate(amount, payday);
              }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  給与額
                </label>
                <input
                  type="number"
                  name="amount"
                  defaultValue={salary?.amount || ''}
                  placeholder="例: 300000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  給与日
                </label>
                <select
                  name="payday"
                  defaultValue={salary?.payday || 25}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}日
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {salary ? '更新' : '設定'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
} 