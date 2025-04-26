'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<any>(null);

  useEffect(() => {
    const checkInvitation = async () => {
      try {
        const { data, error } = await supabase
          .from('invitations')
          .select('*')
          .eq('token', params.token)
          .single();

        if (error) throw error;

        if (!data) {
          setError('招待が見つかりません');
          return;
        }

        if (data.status !== 'pending') {
          setError('この招待は既に使用されています');
          return;
        }

        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
          setError('この招待は期限切れです');
          return;
        }

        setInvitation(data);
      } catch (err) {
        console.error('Error checking invitation:', err);
        setError('招待の確認に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    checkInvitation();
  }, [params.token]);

  const handleAccept = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { error } = await supabase
        .from('invitations')
        .update({ status: 'accepted' })
        .eq('token', params.token);

      if (error) throw error;

      // ここで招待されたユーザーと招待者の関連付けを行う
      // 例: グループやチームへの参加など

      router.push('/');
    } catch (err) {
      console.error('Error accepting invitation:', err);
      setError('招待の受け入れに失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-800">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 max-w-md w-full">
          <div className="text-red-700 mb-4">{error}</div>
          <Link href="/" className="text-blue-500 hover:text-blue-600">
            ホームに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 max-w-md w-full">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">招待を受け入れる</h1>
        <p className="text-slate-700 mb-6">
          {invitation?.invitee_email} への招待を受け入れますか？
        </p>
        <div className="flex justify-end">
          <button
            onClick={handleAccept}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
          >
            受け入れる
          </button>
        </div>
      </div>
    </div>
  );
} 