/**
 * firebaseAuth.js — Anonymous Guest Identity Adapter for Hackathon
 * Provides seamless guest identity with persistent localStorage ID.
 * Zero sign-in friction, no redirects, no popups.
 */

const GUEST_ID_KEY = 'arka_anonymous_uid';

export function getOrCreateGuestId() {
  try {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = `guest_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  } catch {
    return 'guest_hackathon_user';
  }
}

const guestUser = {
  uid: getOrCreateGuestId(),
  email: 'builder@hackathon.local',
  displayName: 'Builder',
  photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=hackathon',
  emailVerified: true,
  getIdToken: () => Promise.resolve('hackathon_token'),
  metadata: { creationTime: new Date().toISOString() }
};

export const auth = {
  get currentUser() {
    return guestUser;
  }
};

export function isAuthInitialized() {
  return true;
}

export function onAuthStateChanged(authInstance, callback) {
  const cb = typeof authInstance === 'function' ? authInstance : callback;
  if (typeof cb === 'function') {
    // Deliver asynchronously to mimic clean auth resolution
    setTimeout(() => {
      try {
        cb(guestUser);
      } catch (e) {
        console.error('Auth listener error:', e);
      }
    }, 0);
  }
  return () => {};
}

export async function signInWithGoogle() {
  return { user: guestUser };
}

export async function signOut() {
  return Promise.resolve();
}

export async function updateLastVisit() {
  return Promise.resolve();
}

export async function syncUserProfile() {
  return Promise.resolve();
}

export function mapFirebaseUser(user) {
  return user || guestUser;
}
