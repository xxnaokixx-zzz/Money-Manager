'use client';

import { useAuth } from '@/contexts/AuthContext';
import { uploadAvatar } from '@/lib/supabase-browser';
import { useState } from 'react';
import Image from 'next/image';

export default function DebugPage() {
  const { user, profile, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && user) {
      try {
        setUploading(true);
        setError(null);
        await uploadAvatar(user.id, file);
        console.log('Avatar uploaded successfully');
      } catch (error) {
        console.error('Failed to upload avatar:', error);
        setError(error instanceof Error ? error.message : 'Failed to upload avatar');
      } finally {
        setUploading(false);
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Debug Information</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Authentication State</h2>
        <pre className="bg-gray-100 p-4 rounded">
          {JSON.stringify({ user, profile }, null, 2)}
        </pre>
      </div>

      {user && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Profile Image</h2>
          {profile?.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt="Profile"
              width={128}
              height={128}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center">
              No avatar
            </div>
          )}

          <div className="mt-4">
            <label className="block mb-2">
              Upload new avatar:
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={uploading}
                className="mt-2"
              />
            </label>
            {uploading && <div>Uploading...</div>}
          </div>
        </div>
      )}

      {!user && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Please sign in to upload an avatar.
        </div>
      )}
    </div>
  );
} 