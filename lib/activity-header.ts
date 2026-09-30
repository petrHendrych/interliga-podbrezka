// Server components cannot see the request URL, so proxy forwards it under this header for
// logPageView(). Kept apart from activity-log.ts so proxy never imports next/headers.
export const ACTIVITY_PATH_HEADER = 'x-activity-path';
