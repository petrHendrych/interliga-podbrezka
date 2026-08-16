/**
 * `applicationServerKey` must be raw bytes, but VAPID keys travel as base64url. Browsers
 * reject the padded/base64 form outright, so the padding and the two swapped characters
 * have to be restored by hand.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // `applicationServerKey` needs a plain ArrayBuffer view, not the SharedArrayBuffer union.
  const output = new Uint8Array(new ArrayBuffer(raw.length));

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}
