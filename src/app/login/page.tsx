'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 既にログインしている場合はリダイレクト
    const checkSession = async () => {
      try {
        if (typeof window === 'undefined') return;

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session) {
          const redirectTo = searchParams.get('redirectTo') || '/';
          router.push(redirectTo);
        }
      } catch (error) {
        console.error('Session check error:', error);
      }
    };
    checkSession();
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window === 'undefined') return;

    setLoading(true);
    setError(null);

    try {
      // セッションをクリア
      await supabase.auth.signOut();

      // ログイン処理
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.session) {
        // リダイレクト
        const redirectTo = searchParams.get('redirectTo') || '/';
        router.push(redirectTo);
        router.refresh();
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('ログインに失敗しました。メールアドレスとパスワードを確認してください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
      <div className="max-w-md w-full px-4 py-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">ログイン</h1>

          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                パスワード
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>

            <div className="text-center mt-4">
              <Link href="/signup" className="text-blue-600 hover:text-blue-700">
                アカウントをお持ちでない方はこちら
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
} 