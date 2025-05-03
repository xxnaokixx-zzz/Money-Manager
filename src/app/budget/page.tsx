'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
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
  last_month_amount?: number;  // 先月の実績を追加
}

interface LastMonthAmount {
  category_id: number;
  amount: number;
}

export default function BudgetPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedAmount, setEditedAmount] = useState('');
  const [totalIncome, setTotalIncome] = useState(0);
  const [salaryIncome, setSalaryIncome] = useState(0);
  const [otherIncome, setOtherIncome] = useState(0);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [isEditingCategory, setIsEditingCategory] = useState<number | null>(null);
  const [editedCategoryAmount, setEditedCategoryAmount] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isFixedExpensesOpen, setIsFixedExpensesOpen] = useState(true);
  const [isVariableExpensesOpen, setIsVariableExpensesOpen] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);

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

        // 予算を取得
        const monthDate = new Date(`${selectedMonth}-01`);
        const formattedDate = monthDate.toISOString().split('T')[0];
        console.log('月の型変換:', {
          original: selectedMonth,
          date: monthDate,
          formatted: formattedDate,
          type: typeof formattedDate
        });

        const { data: budgetData, error: budgetError } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', formattedDate)
          .single();

        console.log('予算取得結果:', {
          budgetData,
          budgetError,
          userId: user.id,
          month: formattedDate,
          query: {
            table: 'budgets',
            filters: {
              user_id: user.id,
              month: formattedDate
            }
          }
        });

        if (budgetError) {
          console.error('予算取得エラーの詳細:', {
            code: budgetError.code,
            message: budgetError.message,
            details: budgetError.details,
            hint: budgetError.hint
          });
          if (budgetError.code !== 'PGRST116') {
            throw budgetError;
          }
        }

        // 予算が存在しない場合は新規作成
        if (!budgetData) {
          const { data: newBudget, error: insertError } = await supabase
            .from('budgets')
            .insert({
              user_id: user.id,
              month: formattedDate,
              amount: 0
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error creating new budget:', insertError);
            throw insertError;
          }

          console.log('New budget created:', newBudget);
          setBudget(newBudget);
          await fetchBudgetCategories(newBudget.id);
        } else {
          setBudget(budgetData);
          await fetchBudgetCategories(budgetData.id);
        }

        // この月の収入（給与含む）を取得
        const [year, month] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const currentMonthStart = `${selectedMonth}-01`;
        const currentMonthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

        // 給与収入を取得
        const fromDay = 1;  // 月の初日
        const toDay = lastDay;  // 月の最終日

        console.log('給与検索条件:', {
          month: {
            year,
            month,
            selectedMonth,
            fromDay,
            toDay,
            lastDay
          }
        });

        const { data: salaryData, error: salaryError } = await supabase
          .from('salaries')
          .select('amount, status, payday')
          .eq('user_id', user.id)
          .eq('status', 'unpaid')
          .gte('payday', fromDay)
          .lte('payday', toDay);

        console.log('給与データ取得結果:', {
          rawData: salaryData,
          error: salaryError,
          userId: user.id,
          query: {
            table: 'salaries',
            filters: {
              user_id: user.id,
              status: 'unpaid',
              payday: {
                gte: fromDay,
                lte: toDay
              }
            }
          },
          dataDetails: salaryData?.map(s => ({
            amount: s.amount,
            status: s.status,
            payday: s.payday
          }))
        });

        if (salaryError) throw salaryError;

        // 給与収入を計算
        const salaryIncome = salaryData?.reduce((sum, s) => {
          const amount = typeof s.amount === 'number' ? s.amount : 0;
          console.log('給与データ処理:', {
            current: s,
            amount,
            currentSum: sum,
            type: {
              amount: typeof s.amount,
              status: typeof s.status,
              payday: typeof s.payday,
              sum: typeof sum
            }
          });
          return sum + amount;
        }, 0) || 0;

        console.log('給与収入計算結果:', {
          finalAmount: salaryIncome,
          dataLength: salaryData?.length,
          dataTypes: salaryData?.map(s => ({
            amount: typeof s.amount,
            status: typeof s.status,
            payday: typeof s.payday
          }))
        });

        setSalaryIncome(salaryIncome);

        // その他の収入を取得
        const { data: incomeData, error: incomeError } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id)
          .eq('type', 'income')
          .gte('date', currentMonthStart)
          .lte('date', currentMonthEnd);

        if (incomeError) throw incomeError;

        // その他の収入を計算
        const otherIncome = incomeData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        setOtherIncome(otherIncome);

        // 総収入を計算
        const totalIncome = otherIncome;  // 未入金の給与収入は含めない
        setTotalIncome(totalIncome);

        // 予算額のみを表示（収入は含めない）
        setEditedAmount(String(budgetData?.amount || 0));

      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching budget:', error);
        setError(error instanceof Error ? error.message : '予算の取得に失敗しました');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [router, selectedMonth]);

  const handleNavigation = (href: string) => {
    setLoading(true);
    router.push(href);
  };

  const handleEdit = () => {
    // 予算額のみを表示（収入は含めない）
    setEditedAmount(budget ? String(budget.amount) : '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const baseBudget = Number(editedAmount);

      if (baseBudget < 0) {
        throw new Error('予算額は0以上である必要があります');
      }

      // 給与収入を取得
      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const currentMonthStart = `${selectedMonth}-01`;
      const currentMonthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      // 月の日付を整数値で設定（1-31）
      const fromDay = 1;  // 月の初日
      const toDay = lastDay;  // 月の最終日

      console.log('給与検索条件:', {
        month: {
          year,
          month,
          selectedMonth,
          fromDay,
          toDay,
          lastDay
        }
      });

      const { data: salaryData, error: salaryError } = await supabase
        .from('salaries')
        .select('amount, status, payday')
        .eq('user_id', user.id)
        .eq('status', 'unpaid')
        .gte('payday', fromDay)
        .lte('payday', toDay);

      console.log('給与データ取得結果:', {
        rawData: salaryData,
        error: salaryError,
        userId: user.id,
        query: {
          table: 'salaries',
          filters: {
            user_id: user.id,
            status: 'unpaid',
            payday: {
              gte: fromDay,
              lte: toDay
            }
          }
        },
        dataDetails: salaryData?.map(s => ({
          amount: s.amount,
          status: s.status,
          payday: s.payday
        }))
      });

      if (salaryError) throw salaryError;

      const monthDate = new Date(`${selectedMonth}-01`);
      const formattedDate = monthDate.toISOString().split('T')[0];

      // 既存の予算を確認
      const { data: existingBudget, error: checkError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', formattedDate)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingBudget) {
        // 既存の予算を更新
        const { error: updateError } = await supabase
          .from('budgets')
          .update({ amount: baseBudget })
          .eq('id', existingBudget.id);

        if (updateError) throw updateError;
      } else {
        // 新規予算を作成
        const { error: insertError } = await supabase
          .from('budgets')
          .insert({
            user_id: user.id,
            month: formattedDate,
            amount: baseBudget
          });

        if (insertError) throw insertError;
      }

      setBudget({
        id: existingBudget?.id || 0,
        user_id: user.id,
        month: formattedDate,
        amount: baseBudget
      });
      setIsEditing(false);
      alert('予算が更新されました');
    } catch (error) {
      console.error('Error saving budget:', error);
      setError(error instanceof Error ? error.message : '予算の保存に失敗しました');
    }
  };

  const handleCancel = () => {
    setEditedAmount(budget ? String(budget.amount) : '');
    setIsEditing(false);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedMonth(e.target.value);
  };

  // カテゴリーごとの予算を取得する関数
  const fetchBudgetCategories = async (budgetId: number) => {
    console.log('Fetching budget categories for budget:', budgetId);

    // まず予算カテゴリーを取得
    const { data: budgetData, error: budgetError } = await supabase
      .from('budget_categories')
      .select('category_id, amount')
      .eq('budget_id', budgetId)
      .order('category_id');

    if (budgetError) {
      console.error('Error fetching budget categories:', budgetError);
      return;
    }
    console.log('Budget categories data:', budgetData);

    let categoriesToProcess = budgetData;

    // 予算カテゴリーが存在しない場合は作成
    if (!budgetData || budgetData.length === 0) {
      console.log('Creating new budget categories');
      const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select('id')
        .in('name', ['住居費', '光熱費', '通信費', '交通費', '食費', '娯楽費', '医療費', '教育費', '被服費']);

      if (categoriesError) {
        console.error('Error fetching categories:', categoriesError);
        return;
      }

      // 予算カテゴリーを作成
      const { error: insertError } = await supabase
        .from('budget_categories')
        .insert(
          categories.map(category => ({
            budget_id: budgetId,
            category_id: category.id,
            amount: 0
          }))
        );

      if (insertError) {
        console.error('Error creating budget categories:', insertError);
        return;
      }

      // 作成した予算カテゴリーを再取得
      const { data: newBudgetData, error: newBudgetError } = await supabase
        .from('budget_categories')
        .select('category_id, amount')
        .eq('budget_id', budgetId)
        .order('category_id');

      if (newBudgetError) {
        console.error('Error fetching new budget categories:', newBudgetError);
        return;
      }

      console.log('New budget categories created:', newBudgetData);
      categoriesToProcess = newBudgetData;
    }

    // 次にカテゴリー情報を取得
    const categoryIds = categoriesToProcess.map(b => b.category_id);
    console.log('Category IDs to fetch:', categoryIds);

    const { data: categoryData, error: categoryError } = await supabase
      .from('categories')
      .select('id, name, type')
      .in('id', categoryIds);

    if (categoryError) {
      console.error('Error fetching categories:', categoryError);
      return;
    }
    console.log('Category data:', categoryData);

    // データを結合
    const formattedData = categoriesToProcess.map(budget => {
      const category = categoryData.find(c => c.id === budget.category_id);
      return {
        category_id: budget.category_id,
        category_name: category?.name || '',
        category_type: category?.type || '',
        amount: budget.amount
      };
    });
    console.log('Formatted budget categories:', formattedData);

    setBudgetCategories(formattedData);

    // 先月の実績を取得
    await fetchLastMonthAmounts(budgetId);
  };

  // 先月の実績を取得する関数
  const fetchLastMonthAmounts = async (budgetId: number) => {
    console.log('Fetching last month amounts for budget:', budgetId);

    // 現在のユーザーを取得
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Error getting user:', userError);
      return;
    }
    console.log('Current user:', user.id);

    // 現在の予算の月を取得
    const { data: currentBudget, error: budgetError } = await supabase
      .from('budgets')
      .select('month')
      .eq('id', budgetId)
      .single();

    if (budgetError) {
      console.error('Error fetching current budget:', budgetError);
      return;
    }
    console.log('Current budget month:', currentBudget.month);

    // 先月の日付を計算
    const currentDate = new Date(currentBudget.month);
    currentDate.setMonth(currentDate.getMonth() - 1);  // 先月に設定
    const lastMonthStr = currentDate.toISOString().split('T')[0];

    console.log('Last month date:', lastMonthStr);

    // 先月の予算を取得
    const { data: lastMonthBudget, error: lastMonthError } = await supabase
      .from('budgets')
      .select('id')
      .eq('user_id', user.id)
      .eq('month', lastMonthStr)
      .maybeSingle();

    if (lastMonthError) {
      console.error('Error fetching last month budget:', lastMonthError);
      return;
    }

    if (!lastMonthBudget) {
      console.log('No last month budget found');
      return;
    }

    console.log('Last month budget ID:', lastMonthBudget.id);

    // 先月の予算カテゴリーを取得
    const { data: lastMonthData, error: lastMonthDataError } = await supabase
      .from('budget_categories')
      .select('category_id, amount')
      .eq('budget_id', lastMonthBudget.id);

    if (lastMonthDataError) {
      console.error('Error fetching last month amounts:', lastMonthDataError);
      return;
    }
    console.log('Last month amounts data:', lastMonthData);

    // 先月の実績をカテゴリーごとの予算に追加
    setBudgetCategories(prev => {
      const updated = prev.map(category => {
        const lastMonthAmount = lastMonthData?.find(d => d.category_id === category.category_id)?.amount || 0;
        console.log(`Category ${category.category_name}: current=${category.amount}, last=${lastMonthAmount}`);
        return {
          ...category,
          last_month_amount: lastMonthAmount
        };
      });
      console.log('Updated budget categories:', updated);
      return updated;
    });
  };

  // カテゴリーごとの予算を更新する関数
  const updateCategoryBudget = async (budgetId: number, categoryId: number, amount: number) => {
    const { error } = await supabase
      .rpc('update_budget_category', {
        p_budget_id: budgetId,
        p_category_id: categoryId,
        p_amount: amount
      });

    if (error) {
      console.error('Error updating budget category:', error);
      return;
    }

    // 予算カテゴリーを再取得
    await fetchBudgetCategories(budgetId);
  };

  // 合計予算を計算する関数
  const calculateTotalBudget = () => {
    return budgetCategories.reduce((sum, category) => sum + category.amount, 0);
  };

  // 固定費と変動費を分ける
  const fixedCategories = budgetCategories.filter(category =>
    ['住居費', '光熱費', '通信費', '交通費'].includes(category.category_name)
  );

  const variableCategories = budgetCategories.filter(category =>
    !['住居費', '光熱費', '通信費', '交通費'].includes(category.category_name)
  );

  // 変動費カテゴリーの選択肢
  const variableCategoryOptions = [
    { id: 6, name: '食費' },
    { id: 11, name: '娯楽費' },
    { id: 12, name: '医療費' },
    { id: 13, name: '教育費' },
    { id: 14, name: '被服費' }
  ].filter(option => !variableCategories.some(cat => cat.category_id === option.id));

  // 変動費カテゴリーを追加する関数
  const addVariableCategory = async (categoryId: number) => {
    if (!budget) return;

    const { error } = await supabase
      .rpc('update_budget_category', {
        p_budget_id: budget.id,
        p_category_id: categoryId,
        p_amount: 0
      });

    if (error) {
      console.error('Error adding budget category:', error);
      return;
    }

    // 予算カテゴリーを再取得
    await fetchBudgetCategories(budget.id);
  };

  // 変動費カテゴリーを削除する関数
  const removeVariableCategory = async (categoryId: number) => {
    if (!budget) return;

    const { error } = await supabase
      .rpc('update_budget_category', {
        p_budget_id: budget.id,
        p_category_id: categoryId,
        p_amount: 0
      });

    if (error) {
      console.error('Error removing budget category:', error);
      return;
    }

    // 予算カテゴリーを再取得
    await fetchBudgetCategories(budget.id);
  };

  // 予算の自動計算関数を修正
  const calculateBudgetFromLastMonth = async () => {
    if (!budget) return;

    // 確認ダイアログを表示
    const confirmed = window.confirm(
      '固定費のみ先月の実績から予算を設定します。\n\n' +
      '・住居費、光熱費、通信費、交通費が先月と同じ金額に設定されます\n' +
      '・変動費（食費、娯楽費など）は設定されません\n\n' +
      'よろしいですか？'
    );

    if (!confirmed) return;

    setIsCalculating(true);
    try {
      // 固定費のみを更新
      const updates = budgetCategories
        .filter(category =>
          ['住居費', '光熱費', '通信費', '交通費'].includes(category.category_name) &&  // 固定費のみ
          category.last_month_amount !== undefined &&
          category.last_month_amount > 0
        )
        .map(category => ({
          budgetId: budget.id,
          categoryId: category.category_id,
          amount: Math.round(category.last_month_amount as number)
        }));

      if (updates.length === 0) {
        alert('先月の固定費の実績データがありません。');
        return;
      }

      // 一括で更新
      await Promise.all(
        updates.map(update =>
          updateCategoryBudget(update.budgetId, update.categoryId, update.amount)
        )
      );

      // 予算カテゴリーを再取得
      await fetchBudgetCategories(budget.id);
    } finally {
      setIsCalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">予算設定</h1>
        <Link
          href="/"
          className="inline-flex items-center px-4 py-2 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
        >
          戻る
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              対象月
            </label>
            <select
              value={selectedMonth}
              onChange={handleMonthChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() + i);
                const value = format(date, 'yyyy-MM');
                const label = format(date, 'yyyy年M月');
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  予算額
                </label>
                {!isEditing && (
                  <button
                    onClick={handleEdit}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    編集
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                    <input
                      type="number"
                      value={editedAmount}
                      onChange={(e) => setEditedAmount(e.target.value)}
                      className="block w-full rounded-md border-gray-300 pl-8 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="予算額を入力"
                    />
                  </div>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <div className="text-2xl font-bold text-gray-900">
                  {budget ? (
                    `¥${budget.amount.toLocaleString()}`
                  ) : (
                    <span className="text-gray-500">設定されていません</span>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="text-sm font-medium text-gray-700 mb-2">
                今月の収入
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-sm text-gray-600">給与収入</div>
                  <div className="text-xl font-bold text-emerald-600">
                    {salaryIncome > 0 ? (
                      <div className="flex items-center">
                        <span>¥{salaryIncome.toLocaleString()}</span>
                        <span className="ml-2 text-sm font-normal text-amber-600">（未入金）</span>
                      </div>
                    ) : (
                      <span>¥0</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">その他の収入</div>
                  <div className="text-xl font-bold text-emerald-600">
                    ¥{otherIncome.toLocaleString()}
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <div className="text-sm text-gray-600">合計収入</div>
                  <div className="text-2xl font-bold text-emerald-600">
                    ¥{totalIncome.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm font-medium text-gray-700">
                  カテゴリーごとの予算
                </div>
                <button
                  onClick={calculateBudgetFromLastMonth}
                  disabled={isCalculating}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCalculating ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      設定中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      固定費を先月の実績から設定
                    </>
                  )}
                </button>
              </div>
              <div className="space-y-4">
                {/* 固定費 */}
                <div>
                  <button
                    onClick={() => setIsFixedExpensesOpen(!isFixedExpensesOpen)}
                    className="flex justify-between items-center w-full text-left group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-gray-700">固定費</div>
                      <svg
                        className="w-4 h-4 text-gray-400 group-hover:text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                    <svg
                      className={`w-5 h-5 transform transition-transform ${isFixedExpensesOpen ? 'rotate-180' : ''
                        }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {isFixedExpensesOpen && (
                    <div className="mt-2 space-y-2">
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
                                    placeholder="予算額を入力"
                                  />
                                </div>
                                <button
                                  onClick={async () => {
                                    if (budget) {
                                      await updateCategoryBudget(
                                        budget.id,
                                        category.category_id,
                                        Number(editedCategoryAmount)
                                      );
                                      setIsEditingCategory(null);
                                    }
                                  }}
                                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => {
                                    setIsEditingCategory(null);
                                    setEditedCategoryAmount('');
                                  }}
                                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                                >
                                  キャンセル
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="text-xl font-bold text-gray-900 transition-all duration-300 ease-in-out">
                                    ¥{category.amount.toLocaleString()}
                                  </div>
                                  {category.last_month_amount !== undefined && (
                                    <div className={`text-sm ${category.amount > category.last_month_amount
                                      ? 'text-red-500'
                                      : category.amount < category.last_month_amount
                                        ? 'text-blue-500'
                                        : 'text-gray-500'
                                      }`}>
                                      （先月: ¥{category.last_month_amount.toLocaleString()}
                                      {category.amount > category.last_month_amount && ' ↑'}
                                      {category.amount < category.last_month_amount && ' ↓'}
                                      {category.amount === category.last_month_amount && ' →'}
                                      ）
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => {
                                    setIsEditingCategory(category.category_id);
                                    setEditedCategoryAmount(String(category.amount));
                                  }}
                                  className="text-sm text-blue-600 hover:text-blue-700"
                                >
                                  編集
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 変動費 */}
                <div>
                  <div className="flex justify-between items-center">
                    <button
                      onClick={() => setIsVariableExpensesOpen(!isVariableExpensesOpen)}
                      className="flex justify-between items-center w-full text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-700">変動費</div>
                        <svg
                          className="w-4 h-4 text-gray-400 group-hover:text-gray-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                      <svg
                        className={`w-5 h-5 transform transition-transform ${isVariableExpensesOpen ? 'rotate-180' : ''
                          }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    {isVariableExpensesOpen && variableCategoryOptions.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                          }}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          カテゴリーを追加
                        </button>
                        {isCategoryDropdownOpen && (
                          <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                            <div className="py-1">
                              {variableCategoryOptions.map((option) => (
                                <button
                                  key={option.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addVariableCategory(option.id);
                                    setIsCategoryDropdownOpen(false);
                                  }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  {option.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {isVariableExpensesOpen && (
                    <div className="mt-2 space-y-2">
                      {variableCategories.map((category) => (
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
                                    placeholder="予算額を入力"
                                  />
                                </div>
                                <button
                                  onClick={async () => {
                                    if (budget) {
                                      await updateCategoryBudget(
                                        budget.id,
                                        category.category_id,
                                        Number(editedCategoryAmount)
                                      );
                                      setIsEditingCategory(null);
                                    }
                                  }}
                                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => {
                                    setIsEditingCategory(null);
                                    setEditedCategoryAmount('');
                                  }}
                                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                                >
                                  キャンセル
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="text-xl font-bold text-gray-900 transition-all duration-300 ease-in-out">
                                    ¥{category.amount.toLocaleString()}
                                  </div>
                                  {category.last_month_amount !== undefined && (
                                    <div className={`text-sm ${category.amount > category.last_month_amount
                                      ? 'text-red-500'
                                      : category.amount < category.last_month_amount
                                        ? 'text-blue-500'
                                        : 'text-gray-500'
                                      }`}>
                                      （先月: ¥{category.last_month_amount.toLocaleString()}
                                      {category.amount > category.last_month_amount && ' ↑'}
                                      {category.amount < category.last_month_amount && ' ↓'}
                                      {category.amount === category.last_month_amount && ' →'}
                                      ）
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setIsEditingCategory(category.category_id);
                                      setEditedCategoryAmount(String(category.amount));
                                    }}
                                    className="text-sm text-blue-600 hover:text-blue-700"
                                  >
                                    編集
                                  </button>
                                  <button
                                    onClick={async () => {
                                      await removeVariableCategory(category.category_id);
                                    }}
                                    className="text-sm text-red-600 hover:text-red-700"
                                  >
                                    削除
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <div className="text-sm text-gray-600">合計予算</div>
                  <div className="text-2xl font-bold text-gray-900">
                    ¥{calculateTotalBudget().toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 