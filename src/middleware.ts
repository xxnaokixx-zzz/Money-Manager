import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // 認証が必要なパスの場合
  if (req.nextUrl.pathname.startsWith('/debug')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', req.url));
    }
  }

  // ログイン済みユーザーがログインページにアクセスした場合
  if (req.nextUrl.pathname.startsWith('/auth/login')) {
    if (session) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/debug', '/auth/login'],
}; 