import { NextResponse } from 'next/server';
import { currentUser } from '@/app/session';
import store from '@/lib/store';
import hubmod from '@/lib/hub';

// All of my conversations (1:1 and group), newest activity first.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const meId = String(user._id);
  const conversations = await store.listConversations(meId);
  const hub = hubmod.getHub();
  return NextResponse.json({
    conversations,
    online: hub ? hub.onlineIds() : [],
  });
}

// Create a conversation. Body: { userId } for a 1:1, or { type:'group', name, memberIds }.
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const meId = String(user._id);

  const body = await req.json().catch(() => ({}));
  const hub = hubmod.getHub();

  if (body.type === 'group') {
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Give the group a name.' }, { status: 400 });
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];

    const conv = await store.createGroupConversation(meId, name, memberIds);
    const view = await store.getConversation(String(conv._id), meId);
    if (hub) hub.toUsers(view.memberIds, { type: 'conversation', conversationId: view.id });
    return NextResponse.json({ conversation: view }, { status: 201 });
  }

  const otherId = String(body.userId || '');
  if (!otherId) return NextResponse.json({ error: 'Pick someone to message.' }, { status: 400 });

  const other = await store.findUserById(otherId);
  if (!other) return NextResponse.json({ error: 'That user no longer exists.' }, { status: 404 });
  if (otherId === meId) return NextResponse.json({ error: "You can't message yourself." }, { status: 400 });

  const { conv, created } = await store.createDirectConversation(meId, otherId);
  const view = await store.getConversation(String(conv._id), meId);
  if (created && hub) {
    hub.toUsers(view.memberIds, { type: 'conversation', conversationId: view.id });
  }
  return NextResponse.json({ conversation: view, created }, { status: created ? 201 : 200 });
}
