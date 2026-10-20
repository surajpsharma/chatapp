'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';

/* Pick a person to start a 1:1 conversation with. */
export default function NewChatModal({ open, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setResults([]); // no recommendations until the user searches
  }, [open]);

  async function load(term) {
    setBusy(true);
    try {
      const res = await fetch(`/api/users?q=${encodeURIComponent(term)}`, {
        credentials: 'same-origin',
      });
      if (res.ok) setResults((await res.json()).users);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  function onChange(e) {
    const v = e.target.value;
    setQ(v);
    clearTimeout(timer.current);
    const term = v.trim();
    if (!term) {
      setResults([]);
      setBusy(false);
      return;
    }
    timer.current = setTimeout(() => load(term), 200);
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New message">
        <header className="modal-head">
          <h3>New message</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-search">
          <input
            autoFocus
            value={q}
            onChange={onChange}
            placeholder="Search people by name…"
            aria-label="Search people"
          />
        </div>
        <div className="modal-list">
          {results.length === 0 && (
            <div className="empty-note">
              {!q.trim()
                ? 'Search for someone by name to start a chat.'
                : busy
                ? 'Searching…'
                : `No one found for “${q.trim()}”.`}
            </div>
          )}
          {results.map((u) => (
            <button key={u.id} className="person" onClick={() => onPick(u)}>
              <Avatar name={u.username} size={42} showStatus online={u.online} />
              <span className="p-main">
                <span className="p-name">{u.username}</span>
                <span className="p-sub">{u.online ? 'online' : 'offline'}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
