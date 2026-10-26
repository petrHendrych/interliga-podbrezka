import { describe, expect, it } from 'vitest';
import {
  buildReleaseViews,
  CHANGELOG_DIALOG_LIMIT,
  dialogReleaseViews,
  releaseAudience,
  unreleasedEntryIds,
  unseenReleases,
} from './release-logic';
import type { ChangelogEntry, ReleaseRecord } from './types';

function entry(
  id: string,
  type: ChangelogEntry['type'] = 'feature',
  audience: ChangelogEntry['audience'] = 'all',
): ChangelogEntry {
  return {
    id,
    type,
    audience,
    text: {
      sk: `${id} sk`, cs: `${id} cs`, hu: `${id} hu`, sr: `${id} sr`,
    },
  };
}

function release(id: number, entryIds: string[], releasedAt = `2026-10-${10 + id}T12:00:00Z`): ReleaseRecord {
  return {
    id, version: `1.${id}.0`, entryIds, releasedAt: new Date(releasedAt),
  };
}

const PLAYER = { lang: 'sk', isAdmin: false } as const;
const ADMIN = { lang: 'sk', isAdmin: true } as const;

describe('unreleasedEntryIds', () => {
  const entries = [entry('a'), entry('b'), entry('c')];

  it.each([
    ['nothing released yet', [], ['a', 'b', 'c']],
    ['some released', ['b'], ['a', 'c']],
    ['everything released', ['a', 'b', 'c'], []],
    ['an old id no longer in the code', ['gone', 'a'], ['b', 'c']],
  ])('%s', (_label, released, expected) => {
    expect(unreleasedEntryIds(entries, new Set(released))).toEqual(expected);
  });
});

describe('releaseAudience', () => {
  it.each([
    ['only player items', [entry('a'), entry('b')], 'all'],
    ['only admin items', [entry('a', 'fix', 'admin')], 'admin'],
    ['a mix, so players hear about it too', [entry('a', 'fix', 'admin'), entry('b')], 'all'],
    ['nothing new', [], null],
  ])('%s', (_label, entries, expected) => {
    expect(releaseAudience(entries)).toBe(expected);
  });
});

describe('buildReleaseViews', () => {
  const entries = [
    entry('fix-1', 'fix'),
    entry('feat-1', 'feature'),
    entry('impr-1', 'improvement'),
    entry('feat-admin', 'feature', 'admin'),
  ];

  it('groups items as feature, improvement, fix whatever the stored order', () => {
    const [view] = buildReleaseViews([release(1, ['fix-1', 'impr-1', 'feat-1'])], entries, PLAYER);

    expect(view.groups).toEqual([
      { type: 'feature', items: ['feat-1 sk'] },
      { type: 'improvement', items: ['impr-1 sk'] },
      { type: 'fix', items: ['fix-1 sk'] },
    ]);
  });

  it('drops groups with nothing in them', () => {
    const [view] = buildReleaseViews([release(1, ['fix-1'])], entries, PLAYER);
    expect(view.groups.map((group) => group.type)).toEqual(['fix']);
  });

  it('hides admin items from players and shows them to admins', () => {
    const releases = [release(1, ['feat-1', 'feat-admin'])];

    expect(buildReleaseViews(releases, entries, PLAYER)[0].groups[0].items).toEqual(['feat-1 sk']);
    expect(buildReleaseViews(releases, entries, ADMIN)[0].groups[0].items)
      .toEqual(['feat-1 sk', 'feat-admin sk']);
  });

  it('drops ids the running code does not know (a rollback)', () => {
    const [view] = buildReleaseViews([release(1, ['feat-1', 'rolled-back'])], entries, PLAYER);
    expect(view.groups).toEqual([{ type: 'feature', items: ['feat-1 sk'] }]);
  });

  it('drops a release with nothing left to show', () => {
    expect(buildReleaseViews([release(1, ['feat-admin'])], entries, PLAYER)).toEqual([]);
    expect(buildReleaseViews([release(2, ['rolled-back'])], entries, ADMIN)).toEqual([]);
  });

  it.each(['sk', 'cs', 'hu', 'sr'] as const)('uses the %s text', (lang) => {
    const [view] = buildReleaseViews([release(1, ['feat-1'])], entries, { lang, isAdmin: false });
    expect(view.groups[0].items).toEqual([`feat-1 ${lang}`]);
  });

  it('carries the version and an ISO date across to the client', () => {
    const [view] = buildReleaseViews([release(3, ['feat-1'])], entries, PLAYER);
    expect(view).toMatchObject({ id: 3, version: '1.3.0', releasedAt: '2026-10-13T12:00:00.000Z' });
  });
});

describe('unseenReleases', () => {
  const releases = [release(1, []), release(2, []), release(3, [])];
  const longAgo = new Date('2020-01-01T00:00:00Z');

  it.each([
    ['never seen anything', null, [3, 2, 1]],
    ['seen up to the middle one', 2, [3]],
    ['seen the latest', 3, []],
  ])('%s', (_label, lastSeenId, expected) => {
    const ids = unseenReleases(releases, { lastSeenId, userCreatedAt: longAgo }).map((r) => r.id);
    expect(ids).toEqual(expected);
  });

  it.each([
    ['created before the release', '2026-10-13T11:59:59Z', [3]],
    ['created at the same instant', '2026-10-13T12:00:00Z', []],
    ['created after the release', '2026-10-13T12:00:01Z', []],
  ])('a user %s sees it only when it is news to them', (_label, createdAt, expected) => {
    const ids = unseenReleases([release(3, [])], {
      lastSeenId: null,
      userCreatedAt: new Date(createdAt),
    }).map((r) => r.id);
    expect(ids).toEqual(expected);
  });
});

describe('dialogReleaseViews', () => {
  const entries = [entry('feat-1'), entry('feat-admin', 'feature', 'admin')];
  const reader = {
    ...PLAYER, lastSeenId: null, userCreatedAt: new Date('2020-01-01T00:00:00Z'),
  };

  it(`shows at most ${CHANGELOG_DIALOG_LIMIT} releases, newest first`, () => {
    const releases = Array.from({ length: 7 }, (_, i) => release(i + 1, ['feat-1']));
    const ids = dialogReleaseViews(releases, entries, reader).map((view) => view.id);
    expect(ids).toEqual([7, 6, 5, 4, 3]);
  });

  it('does not let admin-only releases take a player slot', () => {
    const releases = [
      ...Array.from({ length: 5 }, (_, i) => release(i + 1, ['feat-1'])),
      release(6, ['feat-admin']),
    ];
    const ids = dialogReleaseViews(releases, entries, reader).map((view) => view.id);
    expect(ids).toEqual([5, 4, 3, 2, 1]);
  });
});
