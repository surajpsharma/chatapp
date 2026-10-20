import { NextResponse } from 'next/server';
import { currentUser } from '@/app/session';
import store from '@/lib/store';
import hubmod from '@/lib/hub';

// Message history (oldest first). `?before=<messageId>` pages backwards.
export async function GET(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const url = new URL(req.url);
  const before = url.searchParams.get('before');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  const messages = await store.listMessages(params.id, String(user._id), { limit, before });
  if (messages === null) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  return NextResponse.json({ messages });
}

// Send a message, then push it to everyone in the conversation over the socket.
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = await store.createMessage(params.id, String(user._id), body.body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  const hub = hubmod.getHub();
  if (hub) {
    hub.toUsers(result.memberIds, {
      type: 'message',
      conversationId: params.id,
      message: result.message,
    });
  }
  return NextResponse.json({ message: result.message }, { status: 201 });
}
