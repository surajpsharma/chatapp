import { NextResponse } from 'next/server';
import { currentUser } from '@/app/session';
import store from '@/lib/store';
import hubmod from '@/lib/hub';

// Delete a message. `?scope=everyone` (sender only) or `?scope=me` (default).
export async function DELETE(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const meId = String(user._id);

  const scope = new URL(req.url).searchParams.get('scope') === 'everyone' ? 'everyone' : 'me';

  const result = await store.deleteMessage(params.id, params.messageId, meId, scope);
  if (result.error) {
    const status = /own messages/.test(result.error) ? 403 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  const hub = hubmod.getHub();
  if (hub) {
    const payload = {
      type: 'message:deleted',
      conversationId: params.id,
      messageId: params.messageId,
      scope,
      userId: meId,
    };
    // "for everyone" reaches the whole conversation; "for me" only reaches me.
    hub.toUsers(scope === 'everyone' ? result.memberIds : [meId], payload);
  }

  return NextResponse.json({ ok: true, scope });
}
