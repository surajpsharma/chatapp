'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Avatar from './Avatar';
import NewChatModal from './NewChatModal';
import NewGroupModal from './NewGroupModal';
import GroupPanel from './GroupPanel';
import Dialog from './Dialog';

/* ---------------- small helpers ---------------- */

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const fmtDay = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtListTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return fmtTime(iso);
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);

export default function ChatApp() {
  const router = useRouter();

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [typing, setTyping] = useState({});
  const [input, setInput] = useState('');
  const [dialog, setDialog] = useState(null);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const wsRef = useRef(null);
  const activeIdRef = useRef(null);
  const meRef = useRef(null);
  const typingTimers = useRef({});
  const typingIdle = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { meRef.current = me; }, [me]);

  const scrollBottom = useCallback((instant) => {
    const el = scrollRef.current;
    if (!el) return;
    if (instant) el.scrollTop = el.scrollHeight;
    else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  const closeActive = useCallback(() => {
    setActiveId(null);
    activeIdRef.current = null;
    setActiveConv(null);
    setMessages([]);
  }, []);

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversations', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    setConversations(data.conversations);
    setOnlineIds(new Set(data.online || []));
  }, []);

  const markRead = useCallback(async (id) => {
    try {
      await fetch(`/api/conversations/${id}/read`, { method: 'POST', credentials: 'same-origin' });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    } catch {
      /* ignore */
    }
  }, []);

  const openConversation = useCallback(
    async (id) => {
      setActiveId(id);
      activeIdRef.current = id;
      setPanelOpen(false);
      const [convRes, msgRes] = await Promise.all([
        fetch(`/api/conversations/${id}`, { credentials: 'same-origin' }),
        fetch(`/api/conversations/${id}/messages`, { credentials: 'same-origin' }),
      ]);
      if (convRes.ok) setActiveConv((await convRes.json()).conversation);
      if (msgRes.ok) setMessages((await msgRes.json()).messages);
      else setMessages([]);
      markRead(id);
      setTimeout(() => scrollBottom(true), 30);
      inputRef.current?.focus();
    },
    [markRead, scrollBottom]
  );

  const refreshActive = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    const res = await fetch(`/api/conversations/${id}`, { credentials: 'same-origin' });
    if (res.ok) setActiveConv((await res.json()).conversation);
    else closeActive();
  }, [closeActive]);

  /* ---------------- boot ---------------- */

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) {
        router.replace('/login');
        return;
      }
      const data = await res.json();
      setMe(data.user);
      meRef.current = data.user;
      setLoading(false);
      loadConversations();
    })();
  }, [router, loadConversations]);

  /* ---------------- realtime ---------------- */

  useEffect(() => {
    if (!me) return undefined;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (data.type === 'presence') {
        setOnlineIds(new Set(data.users.map((u) => u.id)));
      } else if (data.type === 'message') {
        const { conversationId, message } = data;
        const mine = meRef.current && message.senderId === meRef.current.id;

        if (activeIdRef.current === conversationId) {
          setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
          if (!mine) markRead(conversationId);
          setTimeout(() => scrollBottom(), 30);
        }

        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conversationId);
          if (idx === -1) {
            loadConversations();
            return prev;
          }
          const conv = { ...prev[idx] };
          conv.lastMessage = {
            body: message.body,
            senderId: message.senderId,
            createdAt: message.createdAt,
          };
          conv.updatedAt = message.createdAt;
          if (!mine && activeIdRef.current !== conversationId) {
            conv.unread = (conv.unread || 0) + 1;
          }
          return [conv, ...prev.filter((c) => c.id !== conversationId)];
        });

        setTyping((prev) => {
          const cur = { ...(prev[conversationId] || {}) };
          delete cur[message.senderId];
          return { ...prev, [conversationId]: cur };
        });
      } else if (data.type === 'typing') {
        const { conversationId, userId, username, isTyping } = data;
        setTyping((prev) => {
          const cur = { ...(prev[conversationId] || {}) };
          if (isTyping) cur[userId] = username;
          else delete cur[userId];
          return { ...prev, [conversationId]: cur };
        });
        const key = conversationId + userId;
        clearTimeout(typingTimers.current[key]);
        if (isTyping) {
          typingTimers.current[key] = setTimeout(() => {
            setTyping((prev) => {
              const cur = { ...(prev[conversationId] || {}) };
              delete cur[userId];
              return { ...prev, [conversationId]: cur };
            });
          }, 4000);
        }
      } else if (data.type === 'read') {
        if (meRef.current && data.userId !== meRef.current.id) {
          setMessages((prev) =>
            prev.map((m) => (m.senderId === meRef.current.id ? { ...m, seen: true } : m))
          );
        }
      } else if (data.type === 'message:deleted') {
        if (data.scope === 'everyone') {
          setMessages((prev) =>
            prev.map((m) => (m.id === data.messageId ? { ...m, deleted: true, body: '' } : m))
          );
        } else if (meRef.current && data.userId === meRef.current.id) {
          setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
        }
      } else if (data.type === 'conversation:removed') {
        if (meRef.current && data.userId === meRef.current.id) {
          setConversations((prev) => prev.filter((c) => c.id !== data.conversationId));
          if (activeIdRef.current === data.conversationId) closeActive();
        }
      } else if (data.type === 'conversation:deleted') {
        setConversations((prev) => prev.filter((c) => c.id !== data.conversationId));
        if (activeIdRef.current === data.conversationId) closeActive();
      } else if (data.type === 'conversation') {
        loadConversations();
        if (activeIdRef.current === data.conversationId) refreshActive();
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [me, loadConversations, markRead, refreshActive, scrollBottom, closeActive]);

  /* ---------------- actions ---------------- */

  function sendTyping(isTyping) {
    const id = activeIdRef.current;
    if (!id || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'typing', conversationId: id, isTyping }));
  }

  function onInputChange(e) {
    setInput(e.target.value);
    sendTyping(true);
    clearTimeout(typingIdle.current);
    typingIdle.current = setTimeout(() => sendTyping(false), 1500);
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const text = input.trim();
    const id = activeIdRef.current;
    if (!text || !id) return;
    setInput('');
    sendTyping(false);
    clearTimeout(typingIdle.current);

    const res = await fetch(`/api/conversations/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ body: text }),
    });
    if (res.ok) {
      const { message } = await res.json();
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setTimeout(() => scrollBottom(), 30);
    }
    inputRef.current?.focus();
  }

  async function startDirect(user) {
    setNewChatOpen(false);
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ userId: user.id }),
    });
    if (res.ok) {
      const { conversation } = await res.json();
      await loadConversations();
      openConversation(conversation.id);
    }
  }

  async function createGroup(name, memberIds) {
    setNewGroupOpen(false);
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ type: 'group', name, memberIds }),
    });
    if (res.ok) {
      const { conversation } = await res.json();
      await loadConversations();
      openConversation(conversation.id);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    wsRef.current?.close();
    router.replace('/login');
  }

  /* ---------------- deletes ---------------- */

  function deleteChat(conv) {
    const isGroup = conv.type === 'group';
    const isAdmin = (conv.adminIds || []).includes(String(me.id));
    const actions = [];
    if (isGroup && isAdmin) {
      actions.push({
        label: 'Delete group for everyone',
        danger: true,
        run: () => runDelete(`/api/conversations/${conv.id}?for=everyone`),
      });
    }
    actions.push({
      label: 'Delete chat for me',
      danger: true,
      run: () => runDelete(`/api/conversations/${conv.id}?for=me`),
    });

    setDialog({
      title: isGroup ? 'Delete this group?' : 'Delete this chat?',
      message: isGroup
        ? 'Deleting for everyone removes it for all members.'
        : 'It disappears from your list. It comes back if they message you again.',
      actions,
    });
  }

  async function runDelete(url) {
    const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
    if (res.ok) {
      await loadConversations();
      if (activeIdRef.current) {
        const still = await fetch(`/api/conversations/${activeIdRef.current}`, {
          credentials: 'same-origin',
        });
        if (!still.ok) closeActive();
      }
    }
  }

  function deleteMessage(msg) {
    const mine = msg.senderId === me.id;
    const actions = [];
    if (mine) {
      actions.push({
        label: 'Delete for everyone',
        danger: true,
        run: () => runDeleteMessage(msg.id, 'everyone'),
      });
    }
    actions.push({
      label: 'Delete for me',
      danger: true,
      run: () => runDeleteMessage(msg.id, 'me'),
    });

    setDialog({
      title: 'Delete message?',
      message: mine
        ? 'Everyone in this chat will see it removed, or just you.'
        : 'It will be removed only for you.',
      actions,
    });
  }

  async function runDeleteMessage(messageId, scope) {
    const convId = activeIdRef.current;
    if (!convId) return;
    await fetch(`/api/conversations/${convId}/messages/${messageId}?scope=${scope}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  }

  /* ---------------- render ---------------- */

  if (loading) {
    return <div className="center-screen"><div className="spinner" /></div>;
  }
  if (!me) return null;

  const typingHere = activeId ? Object.values(typing[activeId] || {}) : [];
  const lastOutgoingId = [...messages].reverse().find((m) => m.senderId === me.id && !m.deleted)?.id;
  const renderedDays = new Set();

  const subtitle = activeConv
    ? activeConv.type === 'group'
      ? activeConv.members.map((m) => (m.id === me.id ? 'You' : m.username)).join(', ')
      : activeConv.members.find((m) => m.id !== me.id)?.online
      ? 'online'
      : 'offline'
    : '';

  return (
    <div className={'app-shell' + (activeId ? ' chat-open' : '')}>
      {/* ---------- Sidebar ---------- */}
      <aside className="sidebar">
        <header className="sidebar-head">
          <div className="brand">
            <span className="brand-mark">C</span>
            <h1>Chat</h1>
          </div>
          <div className="sidebar-actions">
            <button className="icon-btn" title="New message" onClick={() => setNewChatOpen(true)} aria-label="New message">
              <svg viewBox="0 0 24 24" width="19" height="19"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>
            </button>
            <button className="icon-btn" title="New group" onClick={() => setNewGroupOpen(true)} aria-label="New group">
              <svg viewBox="0 0 24 24" width="19" height="19"><path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 7a3 3 0 1 0 0 .01M17 8a3 3 0 1 0 0 .01M21 19v-1a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/></svg>
            </button>
          </div>
        </header>

        <div className="conv-list">
          {conversations.length === 0 && (
            <div className="empty-note">
              No conversations yet.<br />Start one with the + button.
            </div>
          )}
          {conversations.map((c) => {
            const other = c.type === 'direct' ? c.members.find((m) => m.id !== me.id) : null;
            const isTyping = Object.keys(typing[c.id] || {}).length > 0;
            return (
              <div
                key={c.id}
                className={'conv' + (c.id === activeId ? ' active' : '')}
                onClick={() => openConversation(c.id)}
                onKeyDown={(e) => e.key === 'Enter' && openConversation(c.id)}
                role="button"
                tabIndex={0}
              >
                <Avatar
                  name={c.type === 'group' ? c.name : other?.username || c.name}
                  size={50}
                  showStatus={c.type === 'direct'}
                  online={other ? onlineIds.has(other.id) : false}
                />
                <span className="conv-main">
                  <span className="conv-top">
                    <span className="conv-name">{c.name}</span>
                    <span className="conv-time">{fmtListTime(c.lastMessage?.createdAt || c.updatedAt)}</span>
                  </span>
                  <span className="conv-bottom">
                    <span className={'conv-preview' + (isTyping ? ' typing' : '')}>
                      {isTyping ? 'typing…' : c.lastMessage?.body || 'No messages yet'}
                    </span>
                    {c.unread > 0 && <span className="unread">{c.unread > 99 ? '99+' : c.unread}</span>}
                  </span>
                </span>
                <button
                  className="conv-del"
                  title="Delete chat"
                  aria-label="Delete chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(c);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            );
          })}
        </div>

        <footer className="sidebar-foot">
          <div className="me-row">
            <Avatar name={me.username} size={38} />
            <span className="me-text">
              <span className="me-name">{me.username}</span>
              <span className="me-mail">{me.email}</span>
            </span>
          </div>
          <button className="icon-btn" onClick={logout} title="Log out" aria-label="Log out">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 12H3m0 0l3-3m-3 3l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </footer>
      </aside>

      {/* ---------- Chat ---------- */}
      <section className="chat">
        {!activeConv ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <h2>Your messages</h2>
            <p>Select a conversation, or start a new one.</p>
            <button className="btn-primary narrow" onClick={() => setNewChatOpen(true)}>Send a message</button>
          </div>
        ) : (
          <>
            <header className="chat-head">
              <button className="icon-btn back" onClick={closeActive} aria-label="Back">
                <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <Avatar
                name={activeConv.type === 'group' ? activeConv.name : activeConv.members.find((m) => m.id !== me.id)?.username || activeConv.name}
                size={42}
                showStatus={activeConv.type === 'direct'}
                online={activeConv.type === 'direct' && activeConv.members.find((m) => m.id !== me.id)?.online}
              />
              <div className="chat-title">
                <h2>{activeConv.name}</h2>
                <span className="presence">
                  {typingHere.length > 0
                    ? `${typingHere.join(', ')} ${typingHere.length === 1 ? 'is' : 'are'} typing…`
                    : subtitle}
                </span>
              </div>
              <button className="icon-btn" onClick={() => setPanelOpen(true)} title="Details" aria-label="Details">
                <svg viewBox="0 0 24 24" width="19" height="19"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>
              </button>
            </header>

            <div className="messages" ref={scrollRef}>
              {messages.length === 0 && (
                <div className="empty">
                  {activeConv.type === 'group'
                    ? `You created ${activeConv.name}. Say hello!`
                    : `This is the beginning of your conversation with ${activeConv.name}.`}
                </div>
              )}
              {messages.map((m) => {
                const key = dayKey(m.createdAt);
                let sep = null;
                if (!renderedDays.has(key)) {
                  renderedDays.add(key);
                  sep = <div className="day-sep" key={'sep-' + key}>{fmtDay(m.createdAt)}</div>;
                }
                const out = m.senderId === me.id;
                const showSeen = out && m.id === lastOutgoingId && m.seen;
                return (
                  <div key={m.id}>
                    {sep}
                    <div className={'row ' + (out ? 'out' : 'in')}>
                      {!m.deleted && (
                        <button
                          className="msg-menu"
                          title="Message options"
                          aria-label="Message options"
                          onClick={() => deleteMessage(m)}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                      <div className="bubble">
                        {!out && activeConv.type === 'group' && !m.deleted && (
                          <span className="author">{m.senderName}</span>
                        )}
                        {m.deleted ? (
                          <span className="body deleted">🚫 This message was deleted</span>
                        ) : (
                          <span className="body">{m.body}</span>
                        )}
                        <span className="meta">
                          {fmtTime(m.createdAt)}
                          {showSeen && <em className="seen"> · Seen</em>}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={onInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={`Message ${activeConv.name}…`}
                maxLength={2000}
              />
              <button className="btn-send" type="submit" disabled={!input.trim()} aria-label="Send">
                <svg viewBox="0 0 24 24" width="20" height="20"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z" fill="currentColor"/></svg>
              </button>
            </form>
          </>
        )}
      </section>

      <NewChatModal open={newChatOpen} onClose={() => setNewChatOpen(false)} onPick={startDirect} />
      <NewGroupModal open={newGroupOpen} onClose={() => setNewGroupOpen(false)} onCreate={createGroup} />
      <GroupPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        conversation={activeConv}
        me={me}
        onChanged={async () => { await loadConversations(); refreshActive(); }}
        onLeft={async () => { setPanelOpen(false); closeActive(); await loadConversations(); }}
        onDeleted={async () => { setPanelOpen(false); closeActive(); await loadConversations(); }}
      />

      <Dialog
        open={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        actions={dialog?.actions}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
