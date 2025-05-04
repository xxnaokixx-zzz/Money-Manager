'use client';

import { useState, useEffect, useMemo, useCallback, Suspense, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase-browser';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import AuthGuard from '@/components/AuthGuard';

// Chart.jsの初期化
ChartJS.register(ArcElement, Tooltip, Legend);

// 遅延読み込みするコンポーネント
const DoughnutChart = dynamic(() => import('@/components/DoughnutChart'), {
  loading: () => <div className="w-48 h-48 flex items-center justify-center">読み込み中...</div>,
  ssr: false
});

interface Transaction {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  date: string;
  description?: string;
  user_id: string;
  group_id: number;
  categories?: {
    id: string;
    name: string;
    type: string;
  };
}

interface GroupBudget {
  id: number;
  group_id: number;
  category: string | null;
  amount: number;
  created_at: string;
  updated_at: string;
  month: string | null;
}

interface Group {
  id: number;
  name: string;
  description: string;
  created_at: string;
  created_by: string;
  members: {
    user_id: string;
    name: string;
    role: string;
  }[];
}

interface Salary {
  id: number;
  amount: number;
  payday: number;
  user_id: string;
}

interface ChartData {
  labels: string[];
  datasets: {
    data: number[];
    backgroundColor: string[];
    borderWidth: number;
  }[];
}

export default function GroupHomePage(props: { params: { groupId: string } }) {
  const { groupId } = props.params;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<GroupBudget[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));
  const [displayDate, setDisplayDate] = useState(new Date());
  const [showMessage, setShowMessage] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  const handleNavigation = (href: string) => {
    router.push(href);
  };

  // 収支の計算
  const { totalIncome, totalExpense, categoryExpenses, salaryIncome, otherIncome } = useMemo(() => {
    console.log('収支計算開始:', {
      transactions,
      salaries,
      budgets
    });

    // 給与収入の計算
    const salaryIncome = salaries.reduce((sum, s) => {
      console.log('給与計算:', {
        salary: s,
        currentSum: sum,
        amount: s.amount,
        newSum: sum + (s.amount || 0)
      });
      return sum + (s.amount || 0);
    }, 0);

    console.log('給与収入計算結果:', {
      salaryIncome,
      salaries,
      salaryCount: salaries.length,
      salaryAmounts: salaries.map(s => s.amount)
    });

    // その他の収入の計算
    const otherIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => {
        console.log('その他の収入計算:', {
          transaction: t,
          currentSum: sum,
          amount: t.amount,
          newSum: sum + t.amount
        });
        return sum + t.amount;
      }, 0);

    const totalIncome = otherIncome;  // 未入金の給与収入は含めない

    console.log('収入計算結果:', {
      salaryIncome,
      otherIncome,
      totalIncome,
      transactionCount: transactions.length,
      incomeTransactions: transactions.filter(t => t.type === 'income')
    });

    // 支出の計算
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        console.log('支出計算:', {
          transaction: t,
          currentSum: sum,
          amount: t.amount,
          newSum: sum + t.amount
        });
        return sum + t.amount;
      }, 0);

    const categoryExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        const category = t.categories?.name || '未分類';
        acc[category] = (acc[category] || 0) + t.amount;
        return acc;
      }, {} as { [key: string]: number });

    console.log('最終計算結果:', {
      totalIncome,
      totalExpense: expense,
      categoryExpenses,
      salaryIncome,
      otherIncome,
      expenseTransactions: transactions.filter(t => t.type === 'expense')
    });

    return {
      totalIncome,
      totalExpense: expense,
      categoryExpenses,
      salaryIncome,
      otherIncome
    };
  }, [transactions, salaries]);

  // 予算と収支の計算
  const budgetCalculations = useMemo(() => {
    console.log('予算計算開始:', {
      budgets,
      otherIncome,
      totalExpense,
      salaryIncome
    });

    // 予算の計算
    const baseBudget = budgets[0]?.amount || 0;
    const usedAmount = totalExpense;
    // 予算額のみを使用（収入は含めない）
    const adjustedBudget = baseBudget;
    const remainingAmount = Math.max(0, adjustedBudget - usedAmount);

    console.log('予算計算結果:', {
      baseBudget,
      otherIncome,
      salaryIncome,
      adjustedBudget,
      usedAmount,
      remainingAmount
    });

    return {
      totalIncome,
      totalExpense,
      categoryExpenses,
      salaryIncome,
      otherIncome,
      adjustedBudget,
      remainingAmount,
      usedAmount
    };
  }, [budgets, otherIncome, totalExpense, salaryIncome]);

  // チャートデータの作成
  const chartData: ChartData = useMemo(() => {
    return {
      labels: ['使用済み', '残り'],
      datasets: [{
        data: [
          budgetCalculations.usedAmount,
          budgetCalculations.remainingAmount
        ],
        backgroundColor: [
          '#EF4444',  // 支出は赤
          '#10B981',  // 残りは緑
        ],
        borderWidth: 0,
      }]
    };
  }, [budgetCalculations]);

  // チャートのオプション設定
  const chartOptions = useMemo(() => ({
    cutout: '70%',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
      },
    },
    rotation: 0,
  }), []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // グループの基本情報を取得
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (groupError) throw groupError;
      if (!groupData) throw new Error('グループが見つかりません');

      // グループメンバー情報を取得
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select(`
          user_id,
          role,
          users (
            id,
            name
          )
        `)
        .eq('group_id', groupId);

      if (membersError) throw membersError;
      console.log('グループメンバー情報:', membersData);

      const formattedMembers = membersData.map((m: any) => ({
        user_id: m.user_id,
        name: m.users.name,
        role: m.role
      }));
      console.log('フォーマット済みメンバー情報:', formattedMembers);

      // メンバーの給与情報を取得
      const { data: salariesData, error: salariesError } = await supabase
        .from('salaries')
        .select(`
          id,
          amount,
          payday,
          user_id
        `)
        .in('user_id', formattedMembers.map(m => m.user_id));

      console.log('給与データ取得詳細:', {
        salariesData,
        salariesError,
        memberIds: formattedMembers.map(m => m.user_id),
        query: {
          table: 'salaries',
          select: ['id', 'amount', 'payday', 'user_id'],
          user_ids: formattedMembers.map(m => m.user_id)
        }
      });

      if (salariesError) {
        console.error('給与データ取得エラー:', salariesError);
        throw salariesError;
      }

      if (!salariesData || salariesData.length === 0) {
        console.warn('給与データが取得できませんでした:', {
          members: formattedMembers,
          salariesData
        });
      }

      // 給与データの検証
      const validatedSalaries = (salariesData || [])
        .filter((salary): salary is Salary => {
          if (!salary.amount || salary.amount <= 0) {
            console.warn('無効な給与データ:', salary);
            return false;
          }
          return true;
        });

      console.log('検証済み給与データ:', {
        original: salariesData,
        validated: validatedSalaries,
        memberCount: formattedMembers.length,
        salaryCount: validatedSalaries.length
      });

      // 給与データの計算を確認
      const totalSalary = validatedSalaries.reduce((sum, s) => sum + s.amount, 0);
      console.log('給与合計計算:', {
        totalSalary,
        salaries: validatedSalaries.map(s => ({
          user_id: s.user_id,
          amount: s.amount
        }))
      });

      const formattedGroup: Group = {
        id: groupData.id,
        name: groupData.name,
        description: groupData.description,
        created_at: groupData.created_at,
        created_by: groupData.created_by,
        members: formattedMembers
      };

      setGroup(formattedGroup);

      // 取引データの取得
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0).toISOString();

      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select(`
          *,
          categories (
            id,
            name,
            type
          )
        `)
        .eq('group_id', groupId)
        .gte('date', startDate)
        .lte('date', endDate);

      if (transactionsError) throw transactionsError;
      setTransactions(transactionsData || []);

      // グループ予算データの取得
      const { data: budgetsData, error: budgetsError } = await supabase
        .from('group_budgets')
        .select('*')
        .eq('group_id', groupId)
        .eq('month', `${selectedMonth}-01`);

      if (budgetsError) throw budgetsError;
      setBudgets(budgetsData || []);
      setSalaries(validatedSalaries);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [groupId, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  if (error) {
    return (
      <AuthGuard>
        <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="bg-red-50 text-red-500 p-4 rounded-md">
              {error}
            </div>
          </div>
        </main>
      </AuthGuard>
    );
  }

  if (!group) {
    return (
      <AuthGuard>
        <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="text-center">
              <p className="text-gray-500">グループが見つかりません</p>
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
          {/* ヘッダー部分 */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 space-y-4 sm:space-y-0">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-800">{group?.name}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/groups/${groupId}/transactions/income`}
                className="inline-flex items-center px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                収入を記録
              </Link>
              <Link
                href={`/groups/${groupId}/transactions/expense`}
                className="inline-flex items-center px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
                支出を記録
              </Link>
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          {/* メインコンテンツ */}
          <div className="space-y-6">
            {/* 予算カード */}
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-2 sm:space-y-0">
                <div className="flex items-center">
                  <h2 className="text-lg font-semibold text-gray-800">予算</h2>
                  <span className="ml-2 text-sm text-gray-500">
                    {selectedMonth}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const [year, month] = selectedMonth.split('-').map(Number);
                      const newDate = new Date(year, month - 2, 1);
                      setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      const [year, month] = selectedMonth.split('-').map(Number);
                      const newDate = new Date(year, month, 1);
                      setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : budgets.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <p className="text-sm text-gray-500">予算額</p>
                      <p className="text-2xl font-bold text-slate-900">
                        ¥{budgets[0].amount.toLocaleString()}
                      </p>
                    </div>
                    <Link
                      href={`/groups/${groupId}/budget`}
                      className="inline-flex items-center px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      予算を設定
                    </Link>
                  </div>

                  {/* 円グラフ */}
                  <div className="flex flex-col items-center">
                    <div className="relative w-48 h-48 mb-4">
                      <Suspense fallback={<div className="w-48 h-48 flex items-center justify-center">読み込み中...</div>}>
                        <DoughnutChart data={chartData} options={chartOptions} />
                      </Suspense>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-base font-semibold text-gray-800 mb-1">
                            残り
                          </div>
                          <div className="text-2xl font-bold text-gray-900">
                            ¥{budgetCalculations.remainingAmount.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Link
                          href={`/groups/${groupId}/transactions/income`}
                          className="block hover:bg-slate-50 -mx-4 px-4 py-2"
                          onClick={(e) => {
                            e.preventDefault();
                            handleNavigation(`/groups/${groupId}/transactions/income`);
                          }}
                        >
                          <div className="text-base font-semibold text-gray-900">収入（給与以外）</div>
                          <div className="text-2xl font-bold text-emerald-700">
                            +¥{otherIncome.toLocaleString()}
                          </div>
                        </Link>
                      </div>
                      <div>
                        <Link
                          href={`/groups/${groupId}/transactions/expense`}
                          className="block hover:bg-slate-50 -mx-4 px-4 py-2"
                          onClick={(e) => {
                            e.preventDefault();
                            handleNavigation(`/groups/${groupId}/transactions/expense`);
                          }}
                        >
                          <div className="text-base font-semibold text-gray-900">支出</div>
                          <div className="text-2xl font-bold text-red-700">
                            -¥{totalExpense.toLocaleString()}
                          </div>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">予算が設定されていません</p>
                  <Link
                    href={`/groups/${groupId}/budget`}
                    className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    予算を設定する
                  </Link>
                </div>
              )}
            </div>

            {/* 給与情報カード */}
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-2 sm:space-y-0">
                <h2 className="text-lg font-semibold text-gray-800">給料情報</h2>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center">
                    <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
                    <span className="text-sm text-slate-600">給料日設定</span>
                  </div>
                  <Link
                    href={`/groups/${groupId}/salary`}
                    className="inline-flex items-center px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    設定
                  </Link>
                </div>
              </div>
              {salaries.length > 0 ? (
                <div className="space-y-6">
                  {/* 次の給料日情報 */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500 mb-2">次の給料日</div>
                    <div className="text-xl sm:text-2xl font-bold text-slate-900">
                      {(() => {
                        const today = new Date();
                        const year = today.getFullYear();
                        const month = today.getMonth();
                        const nextPaydays = salaries.map(salary => {
                          let payday = new Date(year, month, salary.payday);
                          if (today > payday) {
                            payday = new Date(year, month + 1, salary.payday);
                          }
                          return payday;
                        });

                        const nextPayday = nextPaydays.reduce((closest, current) => {
                          return current < closest ? current : closest;
                        });

                        const diffTime = nextPayday.getTime() - today.setHours(0, 0, 0, 0);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        const nextPaydayMembers = salaries
                          .filter(s => s.payday === nextPayday.getDate())
                          .map(s => {
                            const member = group.members.find(m => m.user_id === s.user_id);
                            return member?.name;
                          })
                          .filter(Boolean);

                        return (
                          <>
                            {nextPayday.getMonth() + 1}月{nextPayday.getDate()}日
                            <span className="ml-2 text-base font-normal text-slate-600">
                              （あと{diffDays}日）
                            </span>
                            <div className="text-sm text-gray-500 mt-1">
                              {nextPaydayMembers.join(', ')}の給料日
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* メンバー別給与情報 */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-sm text-gray-500">メンバー別給与</div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">給与総額</div>
                        <div className="text-lg font-bold text-slate-900">
                          ¥{salaries.reduce((sum, s) => sum + s.amount, 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {group.members.map((member) => {
                        const memberSalary = salaries.find(s => s.user_id === member.user_id);
                        return (
                          <div
                            key={member.user_id}
                            className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => {
                              if (member.user_id === user?.id) {
                                router.push('/salary');
                              } else {
                                setShowMessage(`${member.name}さんの給与設定は本人のみが可能です`);
                                setTimeout(() => setShowMessage(null), 3000);
                              }
                            }}
                          >
                            <div>
                              <p className="font-medium text-gray-800">{member.name}</p>
                              <p className="text-sm text-gray-500">{member.role}</p>
                            </div>
                            {memberSalary ? (
                              <div className="text-right">
                                <p className="font-semibold text-blue-500">
                                  ¥{memberSalary.amount.toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {memberSalary.payday}日支払い
                                </p>
                              </div>
                            ) : (
                              <div className="text-right">
                                <p className="text-sm text-gray-500">未設定</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500 mb-4">給与情報が設定されていません</p>
                  <Link
                    href={`/groups/${groupId}/salary`}
                    className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    給与情報を設定する
                  </Link>
                </div>
              )}
            </div>

            {/* メンバー一覧 */}
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-2 sm:space-y-0">
                <h2 className="text-lg font-semibold text-gray-800">メンバー一覧</h2>
                <Link
                  href={`/groups/${groupId}/members/new`}
                  className="inline-flex items-center px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  メンバーを追加
                </Link>
              </div>
              <div className="space-y-3">
                {group.members.map((member) => {
                  const memberSalary = salaries.find(s => s.user_id === member.user_id);
                  return (
                    <div key={member.user_id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-gray-50 rounded-lg space-y-2 sm:space-y-0">
                      <div>
                        <p className="font-medium text-gray-800">{member.name}</p>
                        <p className="text-sm text-gray-500">{member.role}</p>
                      </div>
                      {memberSalary && (
                        <div className="text-right">
                          <p className="text-sm text-gray-500">給与</p>
                          <p className="font-semibold text-blue-500">
                            ¥{memberSalary.amount.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">
                            {memberSalary.payday}日支払い
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* メッセージ表示 */}
          {showMessage && (
            <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg animate-fade-in-out">
              {showMessage}
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
} 