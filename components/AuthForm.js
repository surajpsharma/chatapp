'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* Shared sign-in / sign-up form. */
export default function AuthForm({ mode }) {
  const router = useRouter();
  const isLogin = mode === 'login';

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const url = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = isLogin
        ? { identifier: identifier.trim(), password }
        : { username: username.trim(), email: email.trim(), password };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      router.replace('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-glow" />
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">C</span>
          <div>
            <h1>Chat</h1>
            <p className="brand-sub">{isLogin ? 'Sign in to continue' : 'Create your account'}</p>
          </div>
        </div>

        <form onSubmit={submit}>
          {!isLogin && (
            <label className="field">
              <span>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. suraj_01"
                autoComplete="username"
                required
              />
            </label>
          )}

          {isLogin ? (
            <label className="field">
              <span>Email or username</span>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                required
              />
            </label>
          ) : (
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
          )}

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {error && <p className="error" role="alert">{error}</p>}

          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          {isLogin ? (
            <>New here? <Link href="/register">Create an account</Link></>
          ) : (
            <>Already have an account? <Link href="/login">Sign in</Link></>
          )}
        </p>
      </div>
    </main>
  );
}
