'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface Budget {
  id: number;
  amount: number;
  month: string;
  user_id: string;
}

interface BudgetCategory {
  category_id: number;
  category_name: string;
  category_type: string;
  amount: number;
}

export default function BudgetPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salary, setSalary] = useState<number>(0);
  const [fixedCategories, setFixedCategories] = useState<BudgetCategory[]>([]);
  const [isEditingCategory, setIsEditingCategory] = useState<number | null>(null);
  const [editedCategoryAmount, setEditedCategoryAmount] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!isMounted) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          if (isMounted) setLoading(false);
          return;
        }
        // 給与（今月分）を取得
        const { data: salaryRow } = await supabase
          .from('salaries')
          .select('amount')
          .eq('user_id', user.id)
          .order('last_paid', { ascending: false })
          .limit(1)
          .maybeSingle();
        setSalary(salaryRow?.amount || 0);
        // 予算を取得
        const monthDate = new Date(`${selectedMonth}-01`);
        const formattedDate = monthDate.toISOString().split('T')[0];
        const { data: budgetData } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', formattedDate)
          .single();
        setBudget(budgetData);
        // 固定費カテゴリのみ取得
        const { data: budgetCatData } = await supabase
          .from('budget_categories')
          .select('category_id, amount')
          .eq('budget_id', budgetData?.id || 0);
        const { data: categoryData } = await supabase
          .from('categories')
          .select('id, name, type')
          .in('name', ['住居費', '光熱費', '通信費', '交通費']);
        const fixed = (categoryData || []).map(cat => {
          const found = (budgetCatData || []).find(bc => bc.category_id === cat.id);
          return {
            category_id: cat.id,
            category_name: cat.name,
            category_type: cat.type,
            amount: found ? found.amount : 0
          };
        });
        setFixedCategories(fixed);
      } catch (error) {
        if (!isMounted) return;
        setError(error instanceof Error ? error.message : 'データ取得に失敗しました');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [router, selectedMonth]);

  const handleEditCategory = (categoryId: number, amount: number) => {
    setIsEditingCategory(categoryId);
    setEditedCategoryAmount(String(amount));
  };

  const handleSaveCategory = async (categoryId: number) => {
    if (!budget) return;
    await supabase
      .rpc('update_budget_category', {
        p_budget_id: budget.id,
        p_category_id: categoryId,
        p_amount: Number(editedCategoryAmount)
      });
    setIsEditingCategory(null);
    setEditedCategoryAmount('');
    // 再取得
    const { data: budgetCatData } = await supabase
      .from('budget_categories')
      .select('category_id, amount')
      .eq('budget_id', budget.id);
    const { data: categoryData } = await supabase
      .from('categories')
      .select('id, name, type')
      .in('name', ['住居費', '光熱費', '通信費', '交通費']);
    const fixed = (categoryData || []).map(cat => {
      const found = (budgetCatData || []).find(bc => bc.category_id === cat.id);
      return {
        category_id: cat.id,
        category_name: cat.name,
        category_type: cat.type,
        amount: found ? found.amount : 0
      };
    });
    setFixedCategories(fixed);
  };

  const fixedTotal = fixedCategories.reduce((sum, cat) => sum + cat.amount, 0);
  const freeBudget = salary - fixedTotal;

  const handleRegisterBudget = async () => {
    if (!budget) return;
    await supabase
      .from('budgets')
      .update({ amount: freeBudget })
      .eq('id', budget.id);
    alert('予算を登録しました！');
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">予算設定</h1>
      {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 space-y-6">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">今月の給与（自動取得）</span>
              <span className="text-xl font-bold text-emerald-600">¥{salary.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">固定費合計</span>
              <span className="text-xl font-bold text-gray-900">¥{fixedTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">君が自由に使える金額</span>
              <span className="text-xl font-bold text-blue-600">¥{freeBudget.toLocaleString()}</span>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-200">
            <div className="text-sm font-medium text-gray-700 mb-2">固定費の内訳</div>
            <div className="space-y-4">
              {fixedCategories.map((category) => (
                <div key={category.category_id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600">{category.category_name}</div>
                    {isEditingCategory === category.category_id ? (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                          <input
                            type="number"
                            value={editedCategoryAmount}
                            onChange={(e) => setEditedCategoryAmount(e.target.value)}
                            className="block w-full rounded-md border-gray-300 pl-8 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            placeholder="金額を入力"
                          />
                        </div>
                        <button
                          onClick={() => handleSaveCategory(category.category_id)}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        >保存</button>
                        <button
                          onClick={() => { setIsEditingCategory(null); setEditedCategoryAmount(''); }}
                          className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                        >キャンセル</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="text-xl font-bold text-gray-900">¥{category.amount.toLocaleString()}</div>
                        <button
                          onClick={() => handleEditCategory(category.category_id, category.amount)}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >編集</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-4 flex flex-col items-end">
            <div className="mb-2 text-right text-gray-700 font-medium">
              この内容で予算を登録していい？
            </div>
            <button
              onClick={handleRegisterBudget}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg text-lg font-bold hover:bg-blue-700 shadow"
            >予算を登録</button>
          </div>
        </div>
      </div>
    </div>
  );
} 