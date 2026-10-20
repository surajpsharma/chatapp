import { NextResponse } from 'next/server';
import { currentUser } from '@/app/session';
import store from '@/lib/store';
import hubmod from '@/lib/hub';

// People search, used by the "new chat" / "add members" pickers.
// Deliberately returns nothing until a query is typed — no unsolicited
// recommendations.
export async function GET(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ users: [] });

  const users = await store.searchUsers(q, String(user._id), 30);

  const hub = hubmod.getHub();
  const online = new Set(hub ? hub.onlineIds() : []);
  return NextResponse.json({
    users: users.map((u) => ({ ...u, online: online.has(u.id) })),
  });
}
