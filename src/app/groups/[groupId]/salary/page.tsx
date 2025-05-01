'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-browser';
import AuthGuard from '@/components/AuthGuard';

interface Member {
  user_id: string;
  name: string;
  role: string;
  salary_id: number | null;
  salary?: {
    amount: number;
    payday: number;
  };
}

export default function GroupSalaryPage({ params }: { params: { groupId: string } }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select(`
          user_id,
          role,
          salary_id,
          users (
            name
          ),
          salaries (
            id,
            amount,
            payday
          )
        `)
        .eq('group_id', params.groupId);

      if (membersError) throw membersError;

      const formattedMembers: Member[] = membersData.map((m: any) => ({
        user_id: m.user_id,
        name: m.users.name,
        role: m.role,
        salary_id: m.salary_id,
        salary: m.salaries ? {
          amount: m.salaries.amount,
          payday: m.salaries.payday
        } : undefined
      }));

      setMembers(formattedMembers);
    } catch (error) {
      console.error('Error fetching members:', error);
      setError(error instanceof Error ? error.message : 'メンバー情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSalaryUpdate = async (userId: string, amount: number, payday: number) => {
    try {
      setLoading(true);

      // 給与情報を作成または更新
      const { data: salaryData, error: salaryError } = await supabase
        .from('salaries')
        .upsert({
          user_id: userId,
          amount,
          payday,
          group_id: parseInt(params.groupId),
          last_paid: new Date().toISOString().split('T')[0]
        })
        .select()
        .single();

      if (salaryError) throw salaryError;

      // group_membersのsalary_idを更新
      const { error: memberError } = await supabase
        .from('group_members')
        .update({ salary_id: salaryData.id })
        .eq('group_id', params.groupId)
        .eq('user_id', userId);

      if (memberError) throw memberError;

      await fetchMembers();
    } catch (error) {
      console.error('Error updating salary:', error);
      setError(error instanceof Error ? error.message : '給与情報の更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

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
              href={`/groups/${params.groupId}`}
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors mr-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              グループに戻る
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">給与設定</h1>
          </div>

          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {members.map((member) => (
              <div key={member.user_id} className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">{member.name}</h3>
                    <p className="text-sm text-gray-500">{member.role}</p>
                  </div>
                  {member.salary && (
                    <div className="text-right">
                      <p className="text-sm text-gray-500">現在の給与</p>
                      <p className="font-semibold text-blue-500">
                        ¥{member.salary.amount.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {member.salary.payday}日支払い
                      </p>
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const amount = parseInt(formData.get('amount') as string);
                    const payday = parseInt(formData.get('payday') as string);
                    handleSalaryUpdate(member.user_id, amount, payday);
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
                      defaultValue={member.salary?.amount || ''}
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
                      defaultValue={member.salary?.payday || 25}
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
                      {member.salary ? '更新' : '設定'}
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        </div>
      </main>
    </AuthGuard>
  );
} 