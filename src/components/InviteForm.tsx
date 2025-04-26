'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function InviteForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '招待の送信に失敗しました');
      }

      setInviteLink(data.inviteLink);
      setSuccess(true);
      setEmail('');
    } catch (err) {
      console.error('Error sending invitation:', err);
      setError(err instanceof Error ? err.message : '招待の送信に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">招待を送信</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            メールアドレス
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="招待するメールアドレス"
          />
        </div>

        {error && (
          <div className="text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="text-emerald-700 text-sm">
            招待を送信しました
            {inviteLink && (
              <div className="mt-2 p-2 bg-slate-50 rounded-md break-all">
                {inviteLink}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? '送信中...' : '招待を送信'}
        </button>
      </form>
    </div>
  );
} 