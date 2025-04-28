'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import Link from 'next/link';

export default function Verify() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          // ユーザーが認証済みの場合はホーム画面にリダイレクト
          router.push('/');
          setLoading(false);
          return;
        }

        // メールアドレスを取得
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setEmail(user.email);
        }
      } catch (err) {
        console.error('Error checking session:', err);
        setError('セッションの確認に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [router]);

  const handleResendEmail = async () => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email || '',
      });

      if (error) throw error;

      alert('確認メールを再送信しました。');
    } catch (err) {
      console.error('Error resending email:', err);
      setError('メールの再送信に失敗しました');
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-md mx-auto px-4 py-12">
          <div className="text-center">読み込み中...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="text-center mb-6">
            <svg
              className="mx-auto h-12 w-12 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-800 text-center mb-4">
            メール認証をお願いします
          </h1>

          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-md mb-4">
              {error}
            </div>
          )}

          <p className="text-gray-600 text-center mb-6">
            {email} に確認メールを送信しました。
            <br />
            メール内のリンクをクリックして認証を完了してください。
          </p>

          <div className="space-y-4">
            <button
              onClick={handleResendEmail}
              className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600"
            >
              確認メールを再送信
            </button>

            <Link
              href="/login"
              className="block text-center text-blue-500 hover:text-blue-600"
            >
              ログイン画面に戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
} 