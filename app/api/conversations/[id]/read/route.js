import { NextResponse } from 'next/server';
import { currentUser } from '@/app/session';
import store from '@/lib/store';
import hubmod from '@/lib/hub';

// Mark everything in this conversation as read, and tell the other people so
// they can show "Seen".
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const meId = String(user._id);
  const result = await store.markRead(params.id, meId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });

  if (result.count > 0) {
    const hub = hubmod.getHub();
    if (hub) {
      hub.toUsers(
        result.memberIds.filter((id) => id !== meId),
        { type: 'read', conversationId: params.id, userId: meId }
      );
    }
  }
  return NextResponse.json({ ok: true, count: result.count });
}
