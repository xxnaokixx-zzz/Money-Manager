'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';

interface Member {
  user_id: string;
  name: string;
  monthly_income: number;
}

interface Budget {
  amount: number;
  month: string;
}

interface MemberData {
  user_id: string;
  users: {
    name: string;
  };
}

export default function GroupBudgetPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedAmount, setEditedAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().split('T')[0].slice(0, 7)
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const currentMonth = `${selectedMonth}-01`;

      // グループメンバーの情報を取得
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select(`
          user_id,
          users (
            name
          )
        `)
        .eq('group_id', params.groupId);

      if (membersError) {
        throw new Error(`メンバー情報の取得に失敗しました: ${membersError.message}`);
      }

      // メンバーの月次収入を並列で取得
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

      // 予算情報を取得
      const { data: budgetData, error: budgetError } = await supabase
        .from("group_budgets")
        .select("amount, month")
        .eq("group_id", params.groupId)
        .eq("month", currentMonth)
        .single();

      if (budgetError && budgetError.code !== "PGRST116") {
        throw budgetError;
      }

      setBudget(budgetData);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [params.groupId, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const totalIncome = members.reduce((sum, member) => sum + member.monthly_income, 0);

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
      <div className="p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">予算設定</h1>
          <Link
            href={`/groups/${params.groupId}`}
            className="text-blue-500 hover:text-blue-600"
          >
            グループに戻る
          </Link>
        </div>

        <div className="mb-4">
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

        <div className="space-y-4">
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

          <div className="flex justify-end space-x-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  保存
                </button>
              </>
            ) : (
              <button
                onClick={handleEdit}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                編集
              </button>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
} 