import { NextResponse } from 'next/server';
import auth from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(auth.COOKIE, '', { ...auth.cookieOptions(), maxAge: 0 });
  return res;
}
