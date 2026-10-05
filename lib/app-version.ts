// Imported by next.config.ts through a relative path, so it must stay free of `@/` aliases.

const DEPLOYMENTS_URL = 'https://api.vercel.com/v7/deployments';
const REQUIRED_VARS = ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_PROJECT_ID'] as const;
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10_000;

export type DeploymentSummary = { target: string | null };

export type BuildEnv = Record<string, string | undefined>;

type DeploymentsPage = {
  deployments: DeploymentSummary[];
  pagination: { next: number | null };
};

export function majorFromPackageVersion(version: string): number {
  return Number.parseInt(version.split('.')[0], 10);
}

export function formatAppVersion(major: number, production: number, total: number): string {
  return `${major}.${production}.${total}`;
}

// The running build is still BUILDING, so the API's READY list never contains it.
export function countDeployments(
  ready: DeploymentSummary[],
  currentEnv: string | undefined,
): { production: number; total: number } {
  const readyProduction = ready.filter((d) => d.target === 'production').length;
  return {
    production: readyProduction + (currentEnv === 'production' ? 1 : 0),
    total: ready.length + 1,
  };
}

export function fallbackVersion(major: number, sha: string | undefined): string {
  return sha ? `${major}.x.x+${sha.slice(0, 7)}` : `${major}.0.0-dev`;
}

async function apiErrorReason(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ? `${response.status}: ${body.error.message}` : `${response.status}`;
  } catch {
    return `${response.status}`;
  }
}

async function fetchReadyDeployments(
  token: string,
  teamId: string,
  projectId: string,
  fetchImpl: typeof fetch,
): Promise<DeploymentSummary[]> {
  const all: DeploymentSummary[] = [];
  let until: number | null = null;

  do {
    const url = new URL(DEPLOYMENTS_URL);
    url.searchParams.set('projectId', projectId);
    url.searchParams.set('teamId', teamId);
    url.searchParams.set('state', 'READY');
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (until !== null) url.searchParams.set('until', String(until));

    // eslint-disable-next-line no-await-in-loop
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // eslint-disable-next-line no-await-in-loop
      throw new Error(`Vercel API responded ${await apiErrorReason(response)}`);
    }

    // eslint-disable-next-line no-await-in-loop
    const page = (await response.json()) as DeploymentsPage;
    all.push(...page.deployments.map(({ target }) => ({ target })));
    until = page.pagination.next;
  } while (until !== null);

  return all;
}

export async function resolveAppVersion(
  env: BuildEnv,
  major: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!env.VERCEL) return `${major}.0.0-dev`;
  // next build loads the config again in each build worker; reusing the main process's
  // result keeps one version per build and one round of API calls.
  if (env.APP_VERSION) return env.APP_VERSION;

  const {
    VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID, VERCEL_GIT_COMMIT_SHA,
  } = env;
  if (!VERCEL_TOKEN || !VERCEL_TEAM_ID || !VERCEL_PROJECT_ID) {
    const missing = REQUIRED_VARS.filter((name) => !env[name]);
    // eslint-disable-next-line no-console
    console.warn(`Could not count Vercel deployments for the app version: ${missing.join(', ')} not set`);
    return fallbackVersion(major, VERCEL_GIT_COMMIT_SHA);
  }

  try {
    const ready = await fetchReadyDeployments(
      VERCEL_TOKEN,
      VERCEL_TEAM_ID,
      VERCEL_PROJECT_ID,
      fetchImpl,
    );
    const { production, total } = countDeployments(ready, env.VERCEL_ENV);
    return formatAppVersion(major, production, total);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Could not count Vercel deployments for the app version:', error);
    return fallbackVersion(major, VERCEL_GIT_COMMIT_SHA);
  }
}
