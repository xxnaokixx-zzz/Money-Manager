import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    message: '自動給与追加機能は一時的に停止中です。手動で給与を追加してください。',
    status: 'disabled'
  }, { status: 200 });
} 