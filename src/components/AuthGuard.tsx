"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// 認証状態の型定義
interface AuthState {
  user: any | null;
  authProfile: any | null;
  authLoading: boolean;
  initialized: boolean;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile: authProfile, loading: authLoading, initialized } = useAuth();
  const previousState = useRef<AuthState>({ user, authProfile, authLoading, initialized });

  // 状態の変更を追跡する関数
  const logStateChange = (currentState: AuthState) => {
    if (process.env.NODE_ENV === 'development') {
      const changes = Object.entries(currentState).reduce((acc, [key, value]) => {
        if (previousState.current[key as keyof AuthState] !== value) {
          acc[key] = {
            from: previousState.current[key as keyof AuthState],
            to: value
          };
        }
        return acc;
      }, {} as Record<string, { from: any; to: any }>);

      if (Object.keys(changes).length > 0) {
        console.log('AuthGuard state changes:', changes);
      }
    }
  };

  // 認証状態の監視とリダイレクト処理
  useEffect(() => {
    const currentState: AuthState = { user, authProfile, authLoading, initialized };
    logStateChange(currentState);
    previousState.current = currentState;

    // 初期化前の状態
    if (!initialized) {
      console.log('AuthGuard: Waiting for initialization');
      return;
    }

    // ローディング中の状態
    if (authLoading) {
      console.log('AuthGuard: Still loading');
      return;
    }

    // 認証状態の確認
    if (!user) {
      console.log('AuthGuard: No user found, redirecting to login');
      if (pathname !== '/login' && pathname !== '/signup') {
        router.push('/login');
      }
      return;
    }

    // プロファイル状態の確認
    if (!authProfile) {
      console.log('AuthGuard: No profile found, redirecting to setup');
      if (pathname !== '/users/setup') {
        router.push('/users/setup');
      }
      return;
    }

    console.log('AuthGuard: All conditions met, rendering children');
  }, [user, authProfile, authLoading, initialized, router, pathname]);

  // ローディング中の表示
  if (authLoading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // 認証されていない場合
  if (!user) {
    return null;
  }

  // プロファイルがない場合
  if (!authProfile) {
    return null;
  }

  return <>{children}</>;
} 