'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';

/* Group details: members, rename, add/remove people, leave. */
export default function GroupPanel({ open, onClose, conversation, me, onChanged, onLeft, onDeleted }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    if (open && conversation) {
      setName(conversation.name || '');
      setAdding(false);
      setQ('');
      setResults([]);
      setError('');
    }
  }, [open, conversation]);

  async function call(action, payload = {}) {
    setError('');
    const res = await fetch(`/api/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
      return null;
    }
    return data;
  }

  async function loadPeople(term) {
    const res = await fetch(`/api/users?q=${encodeURIComponent(term)}`, { credentials: 'same-origin' });
    if (res.ok) setResults((await res.json()).users);
  }

  function onSearch(e) {
    const v = e.target.value;
    setQ(v);
    clearTimeout(timer.current);
    const term = v.trim();
    if (!term) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => loadPeople(term), 200);
  }

  if (!open || !conversation) return null;

  const isGroup = conversation.type === 'group';
  const isAdmin = (conversation.adminIds || []).includes(String(me.id));
  const memberIds = new Set(conversation.memberIds || []);

  async function rename() {
    const data = await call('rename', { name });
    if (data) onChanged();
  }
  async function add(userId) {
    const data = await call('add', { memberIds: [userId] });
    if (data) {
      setQ('');
      setResults([]);
      setAdding(false);
      onChanged();
    }
  }
  async function remove(userId) {
    const data = await call('remove', { memberId: userId });
    if (data) onChanged();
  }
  async function leave() {
    const data = await call('leave');
    if (data) onLeft();
  }
  async function deleteGroup() {
    const res = await fetch(`/api/conversations/${conversation.id}?for=everyone`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (res.ok) onDeleted();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Could not delete the group.');
    }
  }

  return (
    <>
      <div className="scrim show" onClick={onClose} />
      <aside className="group-panel" role="dialog" aria-label="Group details">
        <header className="panel-head">
          <h3>{isGroup ? 'Group details' : 'Details'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="panel-body">
          <div className="panel-hero">
            <Avatar name={conversation.name} size={72} />
            <div className="panel-hero-text">
              <strong>{conversation.name}</strong>
              <span>{conversation.members.length} {conversation.members.length === 1 ? 'member' : 'members'}</span>
            </div>
          </div>

          {isGroup && isAdmin && (
            <label className="field">
              <span>Group name</span>
              <div className="row-input">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                <button className="btn-ghost" onClick={rename} disabled={!name.trim() || name === conversation.name}>
                  Save
                </button>
              </div>
            </label>
          )}

          {error && <p className="error">{error}</p>}

          <div className="panel-section-head">
            <span>Members</span>
            {isGroup && isAdmin && (
              <button className="btn-ghost sm" onClick={() => setAdding((a) => !a)}>
                {adding ? 'Cancel' : '+ Add'}
              </button>
            )}
          </div>

          {adding && (
            <div className="add-box">
              <input
                autoFocus
                value={q}
                onChange={onSearch}
                placeholder="Search people to add…"
                aria-label="Search people to add"
              />
              <div className="add-results">
                {results
                  .filter((u) => !memberIds.has(u.id))
                  .map((u) => (
                    <button key={u.id} className="person" onClick={() => add(u.id)}>
                      <Avatar name={u.username} size={36} />
                      <span className="p-main"><span className="p-name">{u.username}</span></span>
                      <span className="check">+</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          <ul className="member-list">
            {conversation.members.map((m) => (
              <li key={m.id} className="member">
                <Avatar name={m.username} size={40} showStatus online={m.online} />
                <span className="m-main">
                  <span className="m-name">
                    {m.username}
                    {String(m.id) === String(me.id) && <em className="you">you</em>}
                  </span>
                  {conversation.adminIds.includes(m.id) && <span className="badge">admin</span>}
                </span>
                {isGroup && isAdmin && String(m.id) !== String(me.id) && (
                  <button className="btn-ghost sm danger" onClick={() => remove(m.id)}>Remove</button>
                )}
              </li>
            ))}
          </ul>

          {isGroup && isAdmin && (
            <button className="btn-danger" onClick={deleteGroup}>Delete group for everyone</button>
          )}
          {isGroup && (
            <button className="btn-danger outline" onClick={leave}>Leave group</button>
          )}
        </div>
      </aside>
    </>
  );
}
