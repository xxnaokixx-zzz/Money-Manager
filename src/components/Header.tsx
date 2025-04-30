'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function Header() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const menuItems = [
    { href: '/transactions', label: '取引履歴' },
    { href: '/add', label: '新規記録' },
    { href: '/budget', label: '予算管理' },
    { href: '/salary', label: '給料設定' },
    { href: '/groups', label: 'グループ一覧' },
    { href: '/groups/new', label: 'グループ作成' },
  ];

  const handleNavigation = (href: string) => {
    setIsMenuOpen(false);
    router.push(href);
  };

  // クライアントサイドでのみレンダリング
  if (!mounted) {
    return (
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold text-gray-800">
              Money App
            </Link>
          </div>
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-gray-200" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {user && (
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200"
              aria-label="メニューを開く"
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          )}
          <button
            onClick={() => handleNavigation('/')}
            className="text-xl font-bold text-gray-800 hover:text-gray-900"
          >
            Money App
          </button>
        </div>

        <div className="flex items-center space-x-8">
          {user && (
            <>
              {/* デスクトップ用ナビゲーション */}
              <nav className="hidden md:flex items-center space-x-6">
                {menuItems.map((item) => (
                  <button
                    key={item.href}
                    onClick={() => handleNavigation(item.href)}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </>
          )}

          <div className="flex items-center space-x-4">
            {user ? (
              <button
                onClick={() => handleNavigation('/account')}
                className="flex items-center space-x-2"
              >
                {profile?.avatar_url ? (
                  <div className="relative w-8 h-8">
                    <Image
                      src={profile.avatar_url}
                      alt="アバター"
                      fill
                      sizes="32px"
                      className="rounded-full object-cover"
                      priority
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `
                            <div class="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                              <span class="text-gray-600">${profile?.name?.[0] || '?'}</span>
                            </div>
                          `;
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-gray-600">
                      {profile?.name?.[0] || '?'}
                    </span>
                  </div>
                )}
              </button>
            ) : (
              <button
                onClick={() => handleNavigation('/login')}
                className="text-blue-500 hover:text-blue-600"
              >
                ログイン
              </button>
            )}
          </div>
        </div>
      </div>

      {/* モバイル用ドロップダウンメニュー */}
      {isMenuOpen && user && (
        <div className="md:hidden bg-white border-t">
          <nav className="px-4 py-2">
            {menuItems.map((item) => (
              <button
                key={item.href}
                onClick={() => handleNavigation(item.href)}
                className="block w-full text-left py-3 text-gray-600 hover:text-gray-900 border-b last:border-b-0"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
} 