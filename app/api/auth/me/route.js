import { NextResponse } from 'next/server';
import { currentUser } from '@/app/session';
import store from '@/lib/store';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json({ user: store.publicUser(user) });
}
