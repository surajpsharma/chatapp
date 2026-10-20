import { NextResponse } from 'next/server';
import auth from '@/lib/auth';
import store from '@/lib/store';

// Sign in with either the email address or the username.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { identifier, password } = body || {};
    if (typeof identifier !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Enter your email (or username) and password.' },
        { status: 400 }
      );
    }

    const user = await store.findUserByLogin(identifier);
    if (!user || !auth.verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Incorrect email/username or password.' }, { status: 401 });
    }

    const res = NextResponse.json({ user: store.publicUser(user) });
    res.cookies.set(auth.COOKIE, auth.signToken(user), auth.cookieOptions());
    return res;
  } catch (e) {
    console.error('login failed', e);
    return NextResponse.json({ error: 'Could not sign in.' }, { status: 500 });
  }
}
