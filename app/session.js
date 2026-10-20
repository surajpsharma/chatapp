import { cookies } from 'next/headers';
import auth from '@/lib/auth';
import store from '@/lib/store';

/* Read the signed session cookie and return the user document, or null. */
export async function currentUser() {
  const token = cookies().get(auth.COOKIE)?.value;
  if (!token) return null;
  const payload = auth.verifyToken(token);
  if (!payload) return null;
  return (await store.findUserById(payload.uid)) || null;
}
