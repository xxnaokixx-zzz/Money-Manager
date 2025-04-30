'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import Image from 'next/image';

function UserSetupForm({ user }: { user: any }) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // ユーザー情報を更新
      const { error: updateError } = await supabase
        .from('users')
        .update({
          name: formData.name,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);

      if (updateError) {
        if (updateError.message.includes('connection') && retryCount < MAX_RETRIES) {
          setRetryCount(prev => prev + 1);
          setTimeout(() => handleSubmit(e), 1000 * retryCount);
          return;
        }
        throw updateError;
      }

      // ホームページにリダイレクト
      router.push('/');
    } catch (err) {
      console.error('Error setting up user:', err);
      setError(err instanceof Error ? err.message : 'ユーザー情報の設定に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      // ファイルサイズのチェック（5MB以下）
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('ファイルサイズは5MB以下にしてください');
      }

      // ファイル名をユニークにする
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // 画像をアップロード
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        if (uploadError.message.includes('connection') && retryCount < MAX_RETRIES) {
          setRetryCount(prev => prev + 1);
          setTimeout(() => handleImageUpload(e), 1000 * retryCount);
          return;
        }
        throw uploadError;
      }

      // アップロードした画像のURLを取得
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
    } catch (err) {
      console.error('Error uploading image:', err);
      setError(err instanceof Error ? err.message : '画像のアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-6">ユーザー設定</h1>

          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-md mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center">
              <div className="relative w-24 h-24 mb-4">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="プロフィール画像"
                    className="rounded-full object-cover"
                    fill
                    sizes="96px"
                    priority
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                    <svg
                      className="w-12 h-12 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-blue-500 hover:text-blue-600 text-sm"
              >
                {uploading ? 'アップロード中...' : '画像を選択'}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ユーザー名
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full p-3 border rounded-md text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="ユーザー名を入力"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? '設定中...' : 'ユーザー情報を設定'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function SetupWrapper() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1秒

  useEffect(() => {
    const checkSession = async () => {
      try {
        // セッションキャッシュをチェック
        const cachedSession = localStorage.getItem('auth_session');
        const cachedTime = parseInt(localStorage.getItem('session_cache_time') || '0');

        if (cachedSession && Date.now() - cachedTime < 5 * 60 * 1000) { // 5分
          const session = JSON.parse(cachedSession);
          if (session.user) {
            setCurrentUser(session.user);
            setIsReady(true);
            return;
          }
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        if (!session) {
          router.push('/login');
        } else {
          setCurrentUser(session.user);
          setIsReady(true);
          // セッションをキャッシュ
          localStorage.setItem('auth_session', JSON.stringify(session));
          localStorage.setItem('session_cache_time', Date.now().toString());
        }
      } catch (err) {
        console.error('Session check error:', err);
        if (retryCount < MAX_RETRIES) {
          // 指数バックオフを実装
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.log(`Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(prev => prev + 1);
          setTimeout(checkSession, delay);
        } else {
          console.error('Failed to check session after retries:', err);
          router.push('/login');
        }
      }
    };
    checkSession();
  }, [router, retryCount]);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
          {retryCount > 0 && (
            <p className="mt-2 text-sm text-gray-500">
              接続を試みています... ({retryCount}/{MAX_RETRIES})
            </p>
          )}
        </div>
      </div>
    );
  }

  return <UserSetupForm user={currentUser} />;
} 