'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';

export default function Header() {
  const { user, profile } = useAuth();

  const menuItems = [
    { href: '/transactions', label: '取引履歴' },
    { href: '/add', label: '新規記録' },
    { href: '/budget', label: '予算管理' },
    { href: '/salary', label: '給料設定' },
  ];

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link href="/" className="text-xl font-bold text-gray-800">
            Money App
          </Link>

          {user && (
            <nav className="hidden md:flex items-center space-x-6">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-gray-600 hover:text-gray-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="flex items-center">
          {user ? (
            <Link href="/account" className="flex items-center">
              <div className="w-8 h-8 relative rounded-full overflow-hidden">
                {profile?.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt="プロフィール"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-gray-400"
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
            </Link>
          ) : (
            <Link href="/login" className="text-gray-600 hover:text-gray-900">
              ログイン
            </Link>
          )}
        </div>
      </div>
    </header>
  );
} 