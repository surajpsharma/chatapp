import { NextResponse } from 'next/server';
import { currentUser } from '@/app/session';
import store from '@/lib/store';
import hubmod from '@/lib/hub';

// One conversation, with member online status.
export async function GET(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const conv = await store.getConversation(params.id, String(user._id));
  if (!conv) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const hub = hubmod.getHub();
  const online = new Set(hub ? hub.onlineIds() : []);
  return NextResponse.json({
    conversation: {
      ...conv,
      members: conv.members.map((m) => ({ ...m, online: online.has(m.id) })),
    },
  });
}

// Group management. Body: { action: 'rename' | 'add' | 'remove' | 'leave', ... }
export async function PATCH(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const meId = String(user._id);

  const before = await store.getConversation(params.id, meId);
  if (!before) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  let result;
  switch (body.action) {
    case 'rename':
      result = await store.renameGroup(params.id, meId, body.name);
      break;
    case 'add':
      result = await store.addMembers(params.id, meId, Array.isArray(body.memberIds) ? body.memberIds : []);
      break;
    case 'remove':
      result = await store.removeMember(params.id, meId, String(body.memberId || ''));
      break;
    case 'leave':
      result = await store.leaveGroup(params.id, meId);
      break;
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  if (result.error) return NextResponse.json({ error: result.error }, { status: 403 });

  const after = await store.getConversation(params.id, meId);
  const targets = new Set([...before.memberIds, ...(after ? after.memberIds : [])]);
  const hub = hubmod.getHub();
  if (hub) hub.toUsers([...targets], { type: 'conversation', conversationId: params.id });

  return NextResponse.json({ ok: true, conversation: after, left: body.action === 'leave' });
}

// Delete a conversation. `?for=me` (default) hides it from my list;
// `?for=everyone` deletes a group for all members (admin only).
export async function DELETE(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const meId = String(user._id);
  const scope = new URL(req.url).searchParams.get('for') || 'me';
  const hub = hubmod.getHub();

  if (scope === 'everyone') {
    const result = await store.deleteGroup(params.id, meId);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 403 });
    if (hub) {
      hub.toUsers(result.memberIds, { type: 'conversation:deleted', conversationId: params.id });
    }
    return NextResponse.json({ ok: true, scope: 'everyone' });
  }

  const result = await store.deleteConversation(params.id, meId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });
  if (hub) {
    hub.toUsers([meId], { type: 'conversation:removed', conversationId: params.id });
  }
  return NextResponse.json({ ok: true, scope: 'me' });
}
