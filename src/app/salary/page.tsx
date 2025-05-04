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
  group_id: number;
  base_amount?: number;
  variable_amount?: number;
  status: 'unconfirmed' | 'confirmed';
}

export default function SalaryPage() {
  const router = useRouter();
  const { user, loading: authLoading, initialized } = useAuth();
  const [salary, setSalary] = useState<Salary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayDate, setDisplayDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editedAmount, setEditedAmount] = useState('');
  const [currentGroupName, setCurrentGroupName] = useState<string | null>(null);
  const [baseAmount, setBaseAmount] = useState('');
  const [variableAmount, setVariableAmount] = useState('');
  const [lastMonthVariable, setLastMonthVariable] = useState<number | null>(null);
  const [status, setStatus] = useState<'unconfirmed' | 'confirmed'>('unconfirmed');
  const [showVariableEdit, setShowVariableEdit] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    payday: number;
    confirmVariable: boolean;
  } | null>(null);

  useEffect(() => {
    if (salary) {
      setEditedAmount(salary.amount.toString());
      setBaseAmount(salary.base_amount?.toString() || '');
      setVariableAmount(salary.variable_amount ? salary.variable_amount.toString() : '');
      setStatus((salary.status as 'unconfirmed' | 'confirmed') || 'unconfirmed');
    }
  }, [salary]);

  const ensureGroupMembership = async (userId: string, groupId: number) => {
    // group_membersに既に存在するかチェック
    const { data: existing, error: checkError } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('user_id', userId)
      .eq('group_id', groupId);
    if (checkError) {
      console.error('グループメンバー確認エラー:', checkError);
      throw new Error('グループメンバー確認に失敗しました');
    }
    if (!existing || existing.length === 0) {
      // 存在しなければ追加
      const { error: insertError } = await supabase
        .from('group_members')
        .insert({ user_id: userId, group_id: groupId, role: 'owner' });
      if (insertError) {
        console.error('グループメンバー追加エラー:', insertError);
        throw new Error('グループメンバー追加に失敗しました');
      }
      console.log('グループメンバーを追加しました:', { userId, groupId });
    }
  };

  const fetchSalary = async () => {
    try {
      if (!user) {
        console.log('fetchSalary skipped: user not ready');
        return;
      }

      console.log('Fetching salary data for user:', user.id);

      // 給与データを取得（最新のものから順に）
      const { data: salaryData, error: salaryError } = await supabase
        .from('salaries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      console.log('Fetch salary response:', {
        recordCount: salaryData?.length,
        records: salaryData,
        error: salaryError,
        userId: user.id
      });

      if (salaryError) {
        console.error('給与情報取得エラー:', salaryError);
        throw new Error(`給与情報の取得に失敗しました: ${salaryError.message}`);
      }

      if (!salaryData || salaryData.length === 0) {
        console.log('No salary data found for user');
        setSalary(null);
        setError(null);
        return;
      }

      // 複数の給与情報が存在する場合は警告を表示
      if (salaryData.length > 1) {
        console.warn('複数の給与情報が存在します:', {
          count: salaryData.length,
          records: salaryData
        });
      }

      // 最新のデータを使用
      const latestSalary = salaryData[0];
      console.log('Latest salary data:', {
        id: latestSalary.id,
        amount: latestSalary.amount,
        payday: latestSalary.payday,
        last_paid: latestSalary.last_paid,
        created_at: latestSalary.created_at
      });

      // データの検証
      if (!latestSalary || typeof latestSalary.amount !== 'number' || latestSalary.amount <= 0) {
        console.error('Invalid salary amount:', latestSalary?.amount);
        setError('給与額が無効です。正しい値を設定してください。');
        setSalary(null);
        return;
      }

      if (!latestSalary || typeof latestSalary.payday !== 'number' || latestSalary.payday < 1 || latestSalary.payday > 31) {
        console.error('Invalid payday:', latestSalary?.payday);
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

        console.log('Initializing page for user:', {
          userId: user.id,
          authState: { initialized, authLoading }
        });

        await fetchSalary();

        // テーブル構造の確認
        const { data, error } = await supabase
          .from('salaries')
          .select('*')
          .limit(1);

        if (error) {
          console.error('Error checking table structure:', error);
          throw new Error('テーブル構造の確認に失敗しました');
        }

        console.log('Salaries table structure:', {
          fullData: data,
          columns: data && data[0] ? Object.entries(data[0]).map(([key, value]) => ({
            name: key,
            type: typeof value,
            value: value
          })) : [],
        });
      } catch (error) {
        console.error('Error during page initialization:', {
          error,
          message: error instanceof Error ? error.message : '不明なエラー',
          stack: error instanceof Error ? error.stack : undefined
        });
        setError(error instanceof Error ? error.message : 'ページの初期化中にエラーが発生しました');
        setSalary(null);
      } finally {
        setLoading(false);
      }
    };

    initializePage();
  }, [initialized, authLoading, user]);

  const handleSalaryUpdate = async (payday: number, confirmVariable = false) => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error('ユーザーが認証されていません');
      }

      const base = parseInt(baseAmount);
      const variable = variableAmount ? parseInt(variableAmount) : 0;
      if (isNaN(base) || base <= 0) {
        throw new Error('基本給は0より大きい値を入力してください');
      }
      if (payday < 1 || payday > 31) {
        throw new Error('給与日は1から31の間で入力してください');
      }

      const today = new Date();
      const lastPaid = today.toISOString().split('T')[0];
      const newStatus = confirmVariable ? 'confirmed' : 'unconfirmed';
      const amount = base + variable;

      console.log('給与更新データ:', {
        base,
        variable,
        amount,
        payday,
        lastPaid,
        status: newStatus,
        confirmVariable
      });

      // 既存の給与情報を確認
      const { data: existingSalary, error: existingError } = await supabase
        .from('salaries')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingError) {
        console.error('給与情報取得エラー:', existingError);
        throw new Error('給与情報の取得に失敗しました');
      }

      const updateData = {
        base_amount: base,
        variable_amount: variable,
        amount,
        payday,
        last_paid: lastPaid,
        updated_at: new Date().toISOString(),
        status: newStatus
      };

      console.log('更新データ:', updateData);

      if (existingSalary) {
        // 既存の給与情報を更新
        const { error: updateError } = await supabase
          .from('salaries')
          .update(updateData)
          .eq('id', existingSalary.id);

        if (updateError) {
          console.error('給与更新エラー:', updateError);
          throw updateError;
        }
      } else {
        // 新しい給与情報を作成
        const { error: insertError } = await supabase
          .from('salaries')
          .insert({
            user_id: user.id,
            ...updateData
          });

        if (insertError) {
          console.error('給与作成エラー:', insertError);
          throw insertError;
        }
      }

      await fetchSalary();
      setShowVariableEdit(false);
      setShowConfirmDialog(false);
      setPendingUpdate(null);
    } catch (error) {
      console.error('給与更新エラー:', error);
      setError(error instanceof Error ? error.message : '給与情報の更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDayClick = (day: number) => {
    setSelectedDay(day);
    if (salary) {
      setEditedAmount(salary.amount.toString());
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay) return;

    const amount = parseInt(editedAmount);
    const confirmVariable = status === 'unconfirmed' && showVariableEdit;

    if (confirmVariable) {
      setPendingUpdate({ payday: selectedDay, confirmVariable });
      setShowConfirmDialog(true);
    } else {
      await handleSalaryUpdate(selectedDay, false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const fetchLastMonthVariable = async () => {
      const today = new Date();
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDayStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${lastDayOfMonth.getDate()}`;

      const { data, error } = await supabase
        .from('salaries')
        .select('variable_amount')
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .gte('last_paid', lastMonthStr)
        .lte('last_paid', lastDayStr)
        .order('last_paid', { ascending: false })
        .limit(1);

      if (error) {
        console.error('前月変動分取得エラー:', error);
        return;
      }

      if (data && data.length > 0) {
        setLastMonthVariable(data[0].variable_amount);
      }
    };
    fetchLastMonthVariable();
  }, [user]);

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

          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">給与情報</h3>
                {loading ? (
                  <p className="mt-2 text-gray-500">読み込み中...</p>
                ) : salary === null ? (
                  <p className="mt-2 text-gray-500">給与情報がまだ登録されていません。</p>
                ) : (
                  <div className="flex items-center space-x-8">
                    <div>
                      <p className="text-sm text-gray-600">現在の給与</p>
                      <p className="text-3xl font-bold text-gray-900">
                        ¥{salary.amount.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center">
                      <div className="flex items-center px-4 py-2 bg-gray-50 rounded-lg">
                        <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <div>
                          <p className="text-sm text-gray-600">支払い日</p>
                          <p className="text-base font-medium text-gray-900">
                            毎月 <span className="font-bold">{salary.payday}</span> 日
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <div className="bg-white rounded-lg p-4 border border-gray-300">
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      const newDate = new Date(displayDate);
                      newDate.setMonth(newDate.getMonth() - 1);
                      setDisplayDate(newDate);
                    }}
                    className="p-1 hover:bg-gray-100 rounded-full"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="font-medium text-slate-700">
                    {displayDate.getFullYear()}年{displayDate.getMonth() + 1}月
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newDate = new Date(displayDate);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setDisplayDate(newDate);
                    }}
                    className="p-1 hover:bg-gray-100 rounded-full"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
                    <div key={day} className="text-center text-sm text-slate-500 py-1">
                      {day}
                    </div>
                  ))}
                  {(() => {
                    const firstDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1);
                    const lastDay = new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 0);
                    const days = [];
                    const today = new Date();

                    // 月初めの空きマスを追加
                    for (let i = 0; i < firstDay.getDay(); i++) {
                      days.push(<div key={`empty-${i}`} className="h-8"></div>);
                    }

                    // 日付を追加
                    for (let i = 1; i <= lastDay.getDate(); i++) {
                      const isSelected = i === selectedDay;
                      const isPayday = i === (salary?.payday || 25);
                      const isToday = i === today.getDate() &&
                        today.getMonth() === displayDate.getMonth() &&
                        today.getFullYear() === displayDate.getFullYear();

                      days.push(
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleDayClick(i)}
                          className={`relative rounded-full w-8 h-8 flex items-center justify-center mx-auto text-sm
                            ${isSelected ? 'bg-blue-500 text-white font-bold' : ''}
                            ${isPayday && !isSelected ? 'bg-blue-100 text-blue-600 font-medium' : ''}
                            ${isToday && !isSelected && !isPayday ? 'border-2 border-slate-300' : ''}
                            ${!isSelected && !isToday && !isPayday ? 'text-slate-700 hover:bg-slate-100' : ''}
                          `}
                        >
                          {i}
                        </button>
                      );
                    }

                    return days;
                  })()}
                </div>
              </div>
            </div>

            {selectedDay && (
              <div className="border-t border-gray-200 pt-6">
                <form onSubmit={(e) => { e.preventDefault(); handleEditSubmit(e); }} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-medium text-gray-900">
                      {selectedDay}日の給与設定
                    </h4>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {salary ? '更新' : '設定'}
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      基本給
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                      <input
                        type="number"
                        value={baseAmount}
                        onChange={(e) => setBaseAmount(e.target.value)}
                        placeholder="例: 300000"
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      変動分（残業など）
                    </label>
                    {status === 'confirmed' || showVariableEdit ? (
                      <div className="relative flex gap-2 items-center">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                        <input
                          type="number"
                          value={variableAmount}
                          onChange={(e) => setVariableAmount(e.target.value)}
                          placeholder="例: 50000"
                          className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {status !== 'confirmed' && (
                          <button
                            type="button"
                            className="ml-2 px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-xs"
                            onClick={() => {
                              setShowVariableEdit(false);
                              setVariableAmount('');
                            }}
                          >
                            キャンセル
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700 font-semibold">
                          {lastMonthVariable !== null ? `¥${lastMonthVariable.toLocaleString()}` : '未設定'}
                        </span>
                        <span className="text-xs text-gray-500">（前月実績から予想）</span>
                        <button
                          type="button"
                          className="ml-2 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs"
                          onClick={() => setShowVariableEdit(true)}
                        >
                          明細確認後に更新
                        </button>
                      </div>
                    )}
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        {showConfirmDialog && pendingUpdate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                給与確定の確認
              </h3>
              <p className="text-gray-600 mb-6">
                変動分を含めた給与を確定しますか？
                確定後は予算に自動反映されます。
              </p>
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmDialog(false);
                    setPendingUpdate(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => handleSalaryUpdate(pendingUpdate.payday, pendingUpdate.confirmVariable)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  確定する
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
} 