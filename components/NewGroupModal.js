'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';

/* Create a group: pick a name and some members. */
export default function NewGroupModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setQ('');
    setSelected([]);
    setError('');
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

  function toggle(u) {
    setSelected((s) => (s.some((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]));
  }

  function submit() {
    if (!name.trim()) {
      setError('Give the group a name.');
      return;
    }
    if (selected.length === 0) {
      setError('Pick at least one person.');
      return;
    }
    onCreate(name.trim(), selected.map((u) => u.id));
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New group">
        <header className="modal-head">
          <h3>New group</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Group name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekend plans"
              maxLength={60}
            />
          </label>

          {selected.length > 0 && (
            <div className="chips">
              {selected.map((u) => (
                <button key={u.id} className="chip" onClick={() => toggle(u)} title="Remove">
                  <Avatar name={u.username} size={20} />
                  {u.username}
                  <span className="chip-x">✕</span>
                </button>
              ))}
            </div>
          )}

          <div className="modal-search">
            <input
              value={q}
              onChange={onChange}
              placeholder="Add people…"
              aria-label="Search people to add"
            />
          </div>

          <div className="modal-list short">
            {results.length === 0 && (
              <div className="empty-note">
                {!q.trim() ? 'Search a name to add people.' : busy ? 'Searching…' : 'No one found.'}
              </div>
            )}
            {results.map((u) => {
              const on = selected.some((x) => x.id === u.id);
              return (
                <button key={u.id} className={'person' + (on ? ' selected' : '')} onClick={() => toggle(u)}>
                  <Avatar name={u.username} size={40} showStatus online={u.online} />
                  <span className="p-main">
                    <span className="p-name">{u.username}</span>
                    <span className="p-sub">{u.online ? 'online' : 'offline'}</span>
                  </span>
                  <span className={'check' + (on ? ' on' : '')}>{on ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>

          {error && <p className="error">{error}</p>}

          <button className="btn-primary" onClick={submit} disabled={busy}>
            Create group{selected.length ? ` (${selected.length + 1})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
