'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-browser';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';

interface Group {
  id: number;
  name: string;
  created_at: string;
}

interface GroupMember {
  group_id: number;
  role: string;
  salary_id: number | null;
  groups: Group;
}

interface Salary {
  id: number;
  amount: number;
  payday: number;
  user_id: string;
  base_amount?: number;
  variable_amount?: number;
  status: 'unconfirmed' | 'confirmed';
  last_paid: string;
  special_amount?: number | null;
  is_paid: boolean;
  created_at: string;
}

export default function SalaryPage() {
  const router = useRouter();
  const { user, loading: authLoading, initialized } = useAuth();
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newSalary, setNewSalary] = useState({
    amount: '',
    payday: '25',
    special_amount: '',
    is_paid: false
  });
  const [editingSalary, setEditingSalary] = useState<Salary | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogMessage, setConfirmDialogMessage] = useState<string>('');
  const [dialogType, setDialogType] = useState<'add' | 'edit' | 'delete' | null>(null);

  const fetchSalaries = async () => {
    try {
      if (!user) {
        console.log('fetchSalaries skipped: user not ready');
        return;
      }

      const { data: salaryData, error: salaryError } = await supabase
        .from('salaries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (salaryError) {
        throw new Error(`給与情報の取得に失敗しました: ${salaryError.message}`);
      }

      setSalaries(salaryData || []);
      setError(null);
    } catch (error) {
      console.error('Error fetching salaries:', error);
      setError(error instanceof Error ? error.message : '給与情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialized && !authLoading && user) {
      fetchSalaries();
    }
  }, [initialized, authLoading, user]);

  const handleAddSalary = async () => {
    try {
      if (!user) return;
      setLoading(true);

      const { error } = await supabase
        .from('salaries')
        .insert({
          user_id: user.id,
          amount: Number(newSalary.amount),
          payday: Number(newSalary.payday),
          special_amount: newSalary.special_amount ? Number(newSalary.special_amount) : null,
          is_paid: newSalary.is_paid,
          last_paid: new Date().toISOString().split('T')[0],
          status: 'unconfirmed'
        });

      if (error) throw error;

      await fetchSalaries();
      setShowAdd(false);
      setNewSalary({
        amount: '',
        payday: '25',
        special_amount: '',
        is_paid: false
      });
    } catch (error) {
      console.error('Error adding salary:', error);
      setError(error instanceof Error ? error.message : '給与の追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSalary = async (salary: Salary) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from('salaries')
        .update({
          amount: Number(editingSalary?.amount),
          payday: Number(editingSalary?.payday),
          special_amount: editingSalary?.special_amount ? Number(editingSalary.special_amount) : null,
          is_paid: editingSalary?.is_paid
        })
        .eq('id', salary.id);

      if (error) throw error;

      await fetchSalaries();
      setEditingSalary(null);
    } catch (error) {
      console.error('Error editing salary:', error);
      setError(error instanceof Error ? error.message : '給与の編集に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSalary = async (id: number) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from('salaries')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchSalaries();
    } catch (error) {
      console.error('Error deleting salary:', error);
      setError(error instanceof Error ? error.message : '給与の削除に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePaid = async (salary: Salary) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from('salaries')
        .update({ is_paid: !salary.is_paid })
        .eq('id', salary.id);

      if (error) throw error;

      await fetchSalaries();
    } catch (error) {
      console.error('Error toggling paid status:', error);
      setError(error instanceof Error ? error.message : '給与の入金状態の更新に失敗しました');
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

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
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
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              給与を追加
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">現在の給与</h3>
            {loading ? (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : salaries.length === 0 ? (
              <p className="text-gray-500">給与情報がまだ登録されていません。</p>
            ) : (
              <div className="space-y-4">
                {salaries.map((salary) => (
                  <div key={salary.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-gray-600">給与額</p>
                        <p className="text-2xl font-bold text-gray-900">
                          ¥{salary.amount.toLocaleString()}
                        </p>
                        {salary.special_amount && (
                          <p className="text-sm text-blue-600 mt-1">
                            今月の特別金額: ¥{salary.special_amount.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleTogglePaid(salary)}
                          className={`px-3 py-1 rounded-full text-sm ${salary.is_paid
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                          {salary.is_paid ? '入金済み' : '未入金'}
                        </button>
                        <button
                          onClick={() => setEditingSalary(salary)}
                          className="p-2 text-gray-600 hover:text-gray-900"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setDialogType('delete');
                            setConfirmDialogMessage('この給与情報を削除しますか？');
                            setShowConfirmDialog(true);
                          }}
                          className="p-2 text-red-600 hover:text-red-900"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">支払い日</p>
                        <p className="text-base font-medium text-gray-900">
                          毎月 {salary.payday} 日
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">最終入金日</p>
                        <p className="text-base font-medium text-gray-900">
                          {new Date(salary.last_paid).toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 給与追加モーダル */}
        {showAdd && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">給与を追加</h3>
              <form onSubmit={(e) => { e.preventDefault(); handleAddSalary(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    給与額
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                    <input
                      type="number"
                      value={newSalary.amount}
                      onChange={(e) => setNewSalary({ ...newSalary, amount: e.target.value })}
                      placeholder="例: 300000"
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    支払い日
                  </label>
                  <select
                    value={newSalary.payday}
                    onChange={(e) => setNewSalary({ ...newSalary, payday: e.target.value })}
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    今月の特別金額（任意）
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                    <input
                      type="number"
                      value={newSalary.special_amount}
                      onChange={(e) => setNewSalary({ ...newSalary, special_amount: e.target.value })}
                      placeholder="例: 50000"
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_paid"
                    checked={newSalary.is_paid}
                    onChange={(e) => setNewSalary({ ...newSalary, is_paid: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_paid" className="ml-2 block text-sm text-gray-900">
                    入金済み
                  </label>
                </div>
                <div className="flex justify-end gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    追加
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 給与編集モーダル */}
        {editingSalary && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">給与を編集</h3>
              <form onSubmit={(e) => { e.preventDefault(); handleEditSalary(editingSalary); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    給与額
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                    <input
                      type="number"
                      value={editingSalary.amount}
                      onChange={(e) => setEditingSalary({ ...editingSalary, amount: Number(e.target.value) })}
                      placeholder="例: 300000"
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    支払い日
                  </label>
                  <select
                    value={editingSalary.payday}
                    onChange={(e) => setEditingSalary({ ...editingSalary, payday: Number(e.target.value) })}
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    今月の特別金額（任意）
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                    <input
                      type="number"
                      value={editingSalary.special_amount || ''}
                      onChange={(e) => setEditingSalary({ ...editingSalary, special_amount: e.target.value ? Number(e.target.value) : null })}
                      placeholder="例: 50000"
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="edit_is_paid"
                    checked={editingSalary.is_paid}
                    onChange={(e) => setEditingSalary({ ...editingSalary, is_paid: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="edit_is_paid" className="ml-2 block text-sm text-gray-900">
                    入金済み
                  </label>
                </div>
                <div className="flex justify-end gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setEditingSalary(null)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    更新
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 確認ダイアログ */}
        {showConfirmDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">確認</h3>
              <p className="text-gray-600 mb-6">
                {confirmDialogMessage}
              </p>
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmDialog(false);
                    setDialogType(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (dialogType === 'delete' && editingSalary) {
                      await handleDeleteSalary(editingSalary.id);
                    }
                    setShowConfirmDialog(false);
                    setDialogType(null);
                    setEditingSalary(null);
                  }}
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
} 