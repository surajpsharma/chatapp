import { NextResponse } from 'next/server';
import auth from '@/lib/auth';
import store from '@/lib/store';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, email, password } = body || {};

    const invalid = store.validateRegistration({ username, email, password });
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const nameKey = String(username).trim().toLowerCase();
    const emailKey = String(email).trim().toLowerCase();

    const byName = await store.findUserByLogin(nameKey);
    if (byName && byName.usernameLower === nameKey) {
      return NextResponse.json({ error: 'That username is taken.' }, { status: 409 });
    }
    const byEmail = await store.findUserByLogin(emailKey);
    if (byEmail && byEmail.emailLower === emailKey) {
      return NextResponse.json({ error: 'That email is already registered.' }, { status: 409 });
    }

    let user;
    try {
      user = await store.createUser({
        username,
        email,
        passwordHash: auth.hashPassword(password),
      });
    } catch (e) {
      if (e && e.code === 11000) {
        return NextResponse.json(
          { error: 'That username or email is already in use.' },
          { status: 409 }
        );
      }
      throw e;
    }

    const res = NextResponse.json({ user: store.publicUser(user) }, { status: 201 });
    res.cookies.set(auth.COOKIE, auth.signToken(user), auth.cookieOptions());
    return res;
  } catch (e) {
    console.error('register failed', e);
    return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 });
  }
}
