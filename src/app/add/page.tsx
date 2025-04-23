'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const expenseCategories = [
  '食費',
  '日用品',
  '交通費',
  '交際費',
  '娯楽',
  '衣服',
  '美容',
  '医療費',
  '教育費',
  '住居費',
  '光熱費',
  '通信費',
  'その他'
];

const incomeCategories = [
  '給与',
  '賞与',
  '副業',
  '投資',
  'その他'
];

export default function AddTransaction() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert([
          {
            type: formData.type,
            amount: parseInt(formData.amount),
            category: formData.category,
            date: formData.date,
            description: formData.description,
          },
        ])
        .select();

      if (error) throw error;

      router.push('/transactions');
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('取引の追加に失敗しました');
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">新規取引記録</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              取引タイプ
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value, category: '' })}
              className="w-full p-2 border rounded-md"
            >
              <option value="expense">支出</option>
              <option value="income">収入</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              金額
            </label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full p-2 border rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              カテゴリー
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="">カテゴリーを選択</option>
              {formData.type === 'expense'
                ? expenseCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))
                : incomeCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              日付
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full p-2 border rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              説明
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border rounded-md"
              rows={3}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600"
          >
            保存
          </button>
        </form>
      </div>
    </main>
  );
} 