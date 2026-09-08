import { SW_CLEAR_CACHES } from './messages';

// Signing out has to leave nothing behind on a shared phone. `signOut` is a server action and
// cannot reach the worker, so the message is posted from the client before it runs.
export function clearServiceWorkerCaches() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: SW_CLEAR_CACHES });
}
