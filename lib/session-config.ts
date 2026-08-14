export const SESSION_COOKIE_NAME = 'session';

// An installed PWA has its own cookie jar, so every expiry means signing in again inside the
// app. A month, refreshed past the halfway mark, keeps an active user signed in without
// letting an abandoned session live forever.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_REFRESH_AFTER_SECONDS = SESSION_MAX_AGE_SECONDS / 2;
