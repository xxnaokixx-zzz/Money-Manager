'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const [categories, setCategories] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedFixedCategoryIds, setSelectedFixedCategoryIds] = useState<string[]>([]);
  const [categoryAmounts, setCategoryAmounts] = useState<{ [catId: string]: number }>({});
  const searchParams = useSearchParams();
  const handleMonthChange = (newMonth: string) => {
    const formattedMonth = newMonth.length === 10 ? newMonth.slice(0, 7) : newMonth;
    setSelectedMonth(formattedMonth);
    router.push(`/budget?month=${formattedMonth}`, { scroll: false });
  };

  const initialMonth = (() => {
    const monthParam = searchParams.get('month');
    if (monthParam) {
      return monthParam.length === 10 ? monthParam.slice(0, 7) : monthParam;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);

  // URLパラメータの変更を監視
  useEffect(() => {
    const monthParam = searchParams.get('month');
    if (monthParam) {
      const formatted = monthParam.length === 10 ? monthParam.slice(0, 7) : monthParam;
      if (formatted !== selectedMonth) {
        setSelectedMonth(formatted);
      }
    }
  }, [searchParams, selectedMonth]);

  // 月が変更されたときのデータ取得
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          setLoading(false);
          return;
        }

        // 給与（選択月の給与）を取得
        const monthDate = new Date(`${selectedMonth}-01`);
        const formattedDate = monthDate.toISOString().split('T')[0];
        const { data: salaryRow } = await supabase
          .from('salaries')
          .select('amount')
          .eq('user_id', user.id)
          .eq('last_paid', formattedDate)
          .maybeSingle();

        setSalary(salaryRow?.amount || 0);

        // 予算を取得
        const { data: budgetData, error: budgetError } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', formattedDate)
          .single();

        if (budgetError && budgetError.code === 'PGRST116') {
          // 予算が存在しない場合は新規作成
          const { data: newBudget, error: createError } = await supabase
            .from('budgets')
            .insert([{
              user_id: user.id,
              month: formattedDate,
              amount: 0
            }])
            .select()
            .single();

          if (createError) throw createError;
          setBudget(newBudget);
        } else if (budgetError) {
          throw budgetError;
        } else {
          setBudget(budgetData);
        }

        // 固定費カテゴリを取得
        const { data: budgetCatData } = await supabase
          .from('budget_categories')
          .select('category_id, amount')
          .eq('budget_id', budgetData?.id || 0);

        if (budgetCatData) {
          setSelectedFixedCategoryIds(budgetCatData.map(bc => String(bc.category_id)));
          const initialAmounts: { [catId: string]: number } = {};
          budgetCatData.forEach(bc => {
            initialAmounts[String(bc.category_id)] = bc.amount;
          });
          setCategoryAmounts(initialAmounts);
        } else {
          setSelectedFixedCategoryIds([]);
          setCategoryAmounts({});
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'データ取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedMonth, router]);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, type')
        .eq('type', 'expense')
        .order('name');
      if (!error) setCategories(data || []);
    };
    fetchCategories();
  }, []);

  const handleToggleFixedCategory = (catId: string) => {
    setSelectedFixedCategoryIds(ids =>
      ids.includes(catId) ? ids.filter(id => id !== catId) : [...ids, catId]
    );
  };

  const handleAmountChange = (catId: string, value: string) => {
    setCategoryAmounts(amts => ({ ...amts, [catId]: Number(value) }));
  };

  const handleRemoveFixedCategory = (catId: string) => {
    setSelectedFixedCategoryIds(ids => ids.filter(id => id !== catId));
    setCategoryAmounts(amts => {
      const newAmts = { ...amts };
      delete newAmts[catId];
      return newAmts;
    });
  };

  const fixedTotal = selectedFixedCategoryIds.reduce(
    (sum, catId) => sum + (categoryAmounts[catId] || 0), 0
  );
  const freeBudget = salary - fixedTotal;

  const handleRegisterBudget = async () => {
    if (!budget) return;
    // 金額未入力（0または空欄）のカテゴリーは自動で外す
    const validCategoryIds = selectedFixedCategoryIds.filter(catId => categoryAmounts[catId] && categoryAmounts[catId] > 0);
    setSelectedFixedCategoryIds(validCategoryIds);
    setCategoryAmounts(amts => {
      const newAmts = { ...amts };
      Object.keys(newAmts).forEach(catId => {
        if (!validCategoryIds.includes(catId)) {
          delete newAmts[catId];
        }
      });
      return newAmts;
    });
    const fixedTotal = validCategoryIds.reduce((sum, catId) => sum + (categoryAmounts[catId] || 0), 0);
    const freeBudget = salary - fixedTotal;
    await supabase
      .from('budgets')
      .update({ amount: freeBudget })
      .eq('id', budget.id);
    // budget_categoriesも更新
    for (const catId of validCategoryIds) {
      await supabase
        .from('budget_categories')
        .upsert([
          {
            budget_id: budget.id,
            category_id: Number(catId),
            amount: categoryAmounts[catId]
          }
        ], { onConflict: 'budget_id,category_id' });
    }
    alert('予算を登録しました！');
    // 予算登録後、同じ月の予算ページに遷移
    router.push(`/budget?month=${selectedMonth}`, { scroll: false });
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
              {(() => {
                const [year, month] = selectedMonth.split('-');
                return (
                  <span className="text-sm text-gray-600">{`${year}年${Number(month)}月の給与（自動取得）`}</span>
                );
              })()}
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
            <div className="text-sm font-medium text-gray-700 mb-2">固定費に含めるカテゴリーを選択</div>
            <div className="flex flex-wrap gap-2 mb-6">
              {categories.map(cat => {
                const selected = selectedFixedCategoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleToggleFixedCategory(cat.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition
                      ${selected
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-gray-100 text-gray-900 border border-gray-300'}
                      focus:outline-none focus:ring-2 focus:ring-blue-400`}
                    style={{ minWidth: 80, minHeight: 40, touchAction: 'manipulation' }}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
            <div className="space-y-3">
              {selectedFixedCategoryIds.map(catId => {
                const cat = categories.find(c => String(c.id) === String(catId));
                if (!cat) return null;
                return (
                  <div
                    key={catId}
                    className="flex items-center bg-white border border-blue-200 rounded-xl px-4 py-3 shadow-sm"
                  >
                    <div className="flex-1 text-blue-700 font-bold text-base">{cat.name}</div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-700">¥</span>
                      <input
                        type="number"
                        value={categoryAmounts[catId] || ''}
                        onChange={e => handleAmountChange(catId, e.target.value)}
                        className="w-28 rounded-md border-gray-300 px-2 py-1 text-left text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                        placeholder="金額"
                        min={0}
                      />
                      <span className="ml-1 text-gray-700">円</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFixedCategory(catId)}
                      className="ml-4 p-1 rounded-full hover:bg-red-100 transition"
                      aria-label="削除"
                    >
                      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
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