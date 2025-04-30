'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';

interface Member {
  user_id: string;
  name: string;
  monthly_income: number;
}

interface MemberData {
  user_id: string;
  users: {
    name: string;
  } | null;
}

interface Budget {
  amount: number;
  month: string;
}

export default function GroupBudgetPage() {
  const params = useParams();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isEditing, setIsEditing] = useState(false);
  const [editedAmount, setEditedAmount] = useState('');

  const totalIncome = members.reduce((sum, member) => sum + member.monthly_income, 0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Debug: Starting data fetch');
        const { data: { session } } = await supabase.auth.getSession();
        console.log('Debug: Session:', session);

        if (!session) {
          router.push('/login');
          return;
        }

        console.log('Debug: Fetching members data for group:', params.groupId);
        // メンバー情報を取得（名前を含む）
        const { data: membersData, error: membersError } = await supabase
          .from("group_members")
          .select(`
            user_id,
            users:user_id (
              name
            )
          `)
          .eq("group_id", params.groupId);

        console.log('Debug: Members data:', membersData);
        console.log('Debug: Members error:', membersError);

        if (membersError) {
          console.error('Debug: Members error details:', membersError);
          throw membersError;
        }

        // 各メンバーの今月の収入を取得
        const currentMonth = `${selectedMonth}-01`;
        const memberIncomes = await Promise.all(
          ((membersData || []) as unknown as MemberData[]).map(async (member) => {
            const { data: budgetData, error: budgetError } = await supabase
              .from("budgets")
              .select("amount")
              .eq("user_id", member.user_id)
              .eq("month", currentMonth)
              .single();

            if (budgetError && budgetError.code !== "PGRST116") {
              console.error('Debug: Budget error for user:', member.user_id, budgetError);
            }

            return {
              user_id: member.user_id,
              name: member.users?.name || '未設定',
              monthly_income: budgetData?.amount || 0
            };
          })
        );

        setMembers(memberIncomes);

        console.log('Debug: Fetching budget data for month:', selectedMonth);
        // 予算情報を取得
        const { data: budgetData, error: budgetError } = await supabase
          .from("group_budgets")
          .select("amount, month")
          .eq("group_id", params.groupId)
          .eq("month", `${selectedMonth}-01`)
          .single();

        console.log('Debug: Budget data:', budgetData);
        console.log('Debug: Budget error:', budgetError);

        if (budgetError && budgetError.code !== "PGRST116") {
          console.error('Debug: Budget error details:', budgetError);
          throw budgetError;
        }
        setBudget(budgetData);
      } catch (err) {
        console.error("Error fetching data:", err);
        if (err instanceof Error) {
          console.error("Error details:", {
            message: err.message,
            name: err.name,
            stack: err.stack
          });
          setError(err.message);
        } else {
          console.error("Unknown error type:", err);
          setError("データの取得に失敗しました");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedMonth, router, params.groupId]);

  const handleEdit = () => {
    setIsEditing(true);
    setEditedAmount(budget?.amount.toString() || "");
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedAmount("");
  };

  const handleSave = async () => {
    try {
      setError(null);
      const amount = parseInt(editedAmount);

      if (isNaN(amount) || amount < 0) {
        setError("有効な予算額を入力してください");
        return;
      }

      const { error: upsertError } = await supabase
        .from("group_budgets")
        .upsert({
          group_id: params.groupId,
          month: `${selectedMonth}-01`,
          amount: amount,
        });

      if (upsertError) throw upsertError;

      setBudget({ amount, month: `${selectedMonth}-01` });
      setIsEditing(false);
      setEditedAmount("");
    } catch (err) {
      console.error("Error saving budget:", err);
      setError("予算の保存に失敗しました");
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4">予算設定</h1>
          <p>読み込み中...</p>
        </div>
      </AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4">予算設定</h1>
          <p className="text-red-500">{error}</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">予算設定</h1>
          <Link
            href={`/groups/${params.groupId}`}
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            グループに戻る
          </Link>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              月を選択
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full p-3 border rounded-md text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              予算額
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
              {isEditing ? (
                <input
                  type="number"
                  value={editedAmount}
                  onChange={(e) => setEditedAmount(e.target.value)}
                  className="w-full pl-8 p-3 border rounded-md text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="予算額を入力"
                  required
                  min="0"
                />
              ) : (
                <div className="w-full pl-8 p-3 border rounded-md text-base bg-gray-50">
                  {budget ? Number(budget.amount).toLocaleString() : '未設定'}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-md">
            <div className="text-sm text-gray-600 mb-2">今月の収入</div>
            <div className="text-lg font-medium text-emerald-600">
              ¥{totalIncome.toLocaleString()}
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-md">
            <div className="text-sm text-gray-600 mb-2">利用可能額</div>
            <div className="text-lg font-medium text-blue-600">
              ¥{((budget?.amount || 0) + totalIncome).toLocaleString()}
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            {!isEditing ? (
              <>
                <button
                  onClick={handleEdit}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  編集
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  保存
                </button>
              </>
            )}
          </div>

          {/* メンバーの収入セクション */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">メンバーの月収</h2>
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.user_id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                  <span className="text-gray-700">{member.name}</span>
                  <span className="font-medium">¥{member.monthly_income.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-md">
                <span className="font-medium text-blue-700">合計月収</span>
                <span className="font-medium text-blue-700">¥{totalIncome.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
} 