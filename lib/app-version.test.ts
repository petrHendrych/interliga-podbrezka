import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  countDeployments,
  fallbackVersion,
  formatAppVersion,
  majorFromPackageVersion,
  resolveAppVersion,
  type BuildEnv,
  type DeploymentSummary,
} from './app-version';

const VERCEL_ENV: BuildEnv = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_TOKEN: 'token',
  VERCEL_TEAM_ID: 'team_1',
  VERCEL_PROJECT_ID: 'prj_1',
  VERCEL_GIT_COMMIT_SHA: 'abc1234def5678',
};

function deployments(production: number, preview: number): DeploymentSummary[] {
  return [
    ...Array.from({ length: production }, () => ({ target: 'production' })),
    ...Array.from({ length: preview }, () => ({ target: null })),
  ];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function fakeFetch(pages: { deployments: DeploymentSummary[]; next: number | null }[]) {
  let call = 0;
  return vi.fn<typeof fetch>(async () => {
    const page = pages[call];
    call += 1;
    return jsonResponse({ deployments: page.deployments, pagination: { next: page.next } });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('majorFromPackageVersion', () => {
  it.each([
    ['1.0.0', 1],
    ['0.1.0', 0],
    ['12.3.4', 12],
  ])('reads %s as major %i', (version, major) => {
    expect(majorFromPackageVersion(version)).toBe(major);
  });
});

describe('formatAppVersion', () => {
  it('joins major, production and total deployments', () => {
    expect(formatAppVersion(1, 87, 431)).toBe('1.87.431');
  });
});

describe('countDeployments', () => {
  it.each([
    ['production', deployments(3, 5), { production: 4, total: 9 }],
    ['preview', deployments(3, 5), { production: 3, total: 9 }],
    ['production', [], { production: 1, total: 1 }],
    ['preview', [], { production: 0, total: 1 }],
    [undefined, deployments(2, 0), { production: 2, total: 3 }],
  ])('counts the running %s build on top of the ready ones', (env, ready, expected) => {
    expect(countDeployments(ready, env)).toEqual(expected);
  });
});

describe('fallbackVersion', () => {
  it('names the commit when there is one', () => {
    expect(fallbackVersion(1, 'abc1234def5678')).toBe('1.x.x+abc1234');
  });

  it('reads as a dev build without a commit', () => {
    expect(fallbackVersion(1, undefined)).toBe('1.0.0-dev');
  });
});

describe('resolveAppVersion', () => {
  it('reads as a dev build outside Vercel without calling the API', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(resolveAppVersion({}, 1, fetchImpl)).resolves.toBe('1.0.0-dev');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_PROJECT_ID'])(
    'falls back to the commit when %s is missing',
    async (key) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const env = { ...VERCEL_ENV, [key]: undefined };

      await expect(resolveAppVersion(env, 1, fetchImpl)).resolves.toBe('1.x.x+abc1234');
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('counts every page of deployments for a production build', async () => {
    const fetchImpl = fakeFetch([
      { deployments: deployments(2, 3), next: 1700000000000 },
      { deployments: deployments(1, 4), next: null },
    ]);

    await expect(resolveAppVersion(VERCEL_ENV, 1, fetchImpl)).resolves.toBe('1.4.11');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1][0])).toContain('until=1700000000000');
  });

  it('bumps only the total for a preview build', async () => {
    const fetchImpl = fakeFetch([{ deployments: deployments(2, 3), next: null }]);

    await expect(
      resolveAppVersion({ ...VERCEL_ENV, VERCEL_ENV: 'preview' }, 1, fetchImpl),
    ).resolves.toBe('1.2.6');
  });

  it('asks only for ready deployments of the project, authorised by the token', async () => {
    const fetchImpl = fakeFetch([{ deployments: [], next: null }]);

    await resolveAppVersion(VERCEL_ENV, 1, fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0];
    const params = new URL(String(url)).searchParams;
    expect(params.get('projectId')).toBe('prj_1');
    expect(params.get('teamId')).toBe('team_1');
    expect(params.get('state')).toBe('READY');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
  });

  it('falls back to the commit on an error response', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: 'forbidden' }, 403));

    await expect(resolveAppVersion(VERCEL_ENV, 1, fetchImpl)).resolves.toBe('1.x.x+abc1234');
  });

  it('falls back to the commit when the request throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('timeout');
    });

    await expect(resolveAppVersion(VERCEL_ENV, 1, fetchImpl)).resolves.toBe('1.x.x+abc1234');
  });
});
