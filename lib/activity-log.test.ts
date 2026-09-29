import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
const session = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('next/headers', () => ({ headers: async () => requestHeaders.current }));
vi.mock('./session', () => ({ getSession: async () => session.current }));

const { formatActivity } = await import('./activity-log');
const { ACTIVITY_PATH_HEADER } = await import('./activity-header');

const user = { id: '17', name: 'Ján Novák', role: 'player' };

describe('formatActivity', () => {
  it('prefixes every line so the Vercel log search can find it', () => {
    expect(formatActivity('sign-out', null)).toBe('[activity] sign-out');
  });

  it('puts the detail right after the event', () => {
    expect(formatActivity('sign-in', 'password')).toBe('[activity] sign-in password');
  });

  it('writes fields as key=value and skips empty ones', () => {
    expect(formatActivity('admin', 'createWithdrawal', {
      id: 4, amount: 12.5, category: '', note: null, extra: undefined,
    })).toBe('[activity] admin createWithdrawal id=4 amount=12.5');
  });

  it('appends the user last, since a name may contain spaces', () => {
    expect(formatActivity('admin', 'approveUser', { userId: 'u5' }, user))
      .toBe('[activity] admin approveUser userId=u5 user=Ján Novák id=17 role=player');
  });
});

describe('logPageView', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  let logPageView: typeof import('./activity-log').logPageView;

  function visit(path: string, visitor: typeof user = user) {
    requestHeaders.current = new Headers({ [ACTIVITY_PATH_HEADER]: path });
    session.current = { user: visitor };
    return logPageView();
  }

  beforeEach(async () => {
    // A fresh module per test, so the remembered views of one test never mute the next.
    vi.resetModules();
    ({ logPageView } = await import('./activity-log'));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T18:00:00Z'));
    requestHeaders.current = new Headers({ [ACTIVITY_PATH_HEADER]: '/sk/player/42?season=13' });
    session.current = { user };
  });

  afterEach(() => {
    log.mockClear();
    vi.useRealTimers();
  });

  it('logs the visited path with the signed-in user', async () => {
    await logPageView();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      '[activity] view /sk/player/42?season=13 user=Ján Novák id=17 role=player',
    );
  });

  it('stays silent without a session', async () => {
    session.current = null;
    await logPageView();
    expect(log).not.toHaveBeenCalled();
  });

  it('stays silent when the proxy forwarded no path', async () => {
    requestHeaders.current = new Headers();
    await logPageView();
    expect(log).not.toHaveBeenCalled();
  });

  it('does not count the re-render inside a server action as a visit', async () => {
    requestHeaders.current.set('next-action', 'abc123');
    await logPageView();
    expect(log).not.toHaveBeenCalled();
  });

  it('counts refreshes of the same page as one visit', async () => {
    // useLiveDataRefresh re-renders the page on every focus, pull-to-refresh on every swipe.
    await visit('/sk');
    vi.advanceTimersByTime(5_000);
    await visit('/sk');
    vi.advanceTimersByTime(60_000);
    await visit('/sk');
    expect(log).toHaveBeenCalledOnce();
  });

  it('logs every change of page, including a return to an earlier one', async () => {
    await visit('/sk');
    await visit('/sk/player/42');
    await visit('/sk');
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('treats a different filter as a different page', async () => {
    await visit('/sk?season=13');
    await visit('/sk?season=12');
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('logs the same page again once it has been left alone for 10 minutes', async () => {
    await visit('/sk');
    vi.advanceTimersByTime(9 * 60_000 + 59_000);
    await visit('/sk');
    expect(log).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(10 * 60_000);
    await visit('/sk');
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('keeps the window open while the page keeps being refreshed', async () => {
    await visit('/sk');
    for (let refresh = 0; refresh < 6; refresh += 1) {
      vi.advanceTimersByTime(5 * 60_000);
      // eslint-disable-next-line no-await-in-loop
      await visit('/sk');
    }
    expect(log).toHaveBeenCalledOnce();
  });

  it('remembers each user separately', async () => {
    await visit('/sk');
    await visit('/sk', { id: '18', name: 'Eva Malá', role: 'trainer' });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('does not let a skipped server-action render reset the page', async () => {
    await visit('/sk');
    requestHeaders.current.set('next-action', 'abc123');
    await logPageView();
    await visit('/sk');
    expect(log).toHaveBeenCalledOnce();
  });
});
