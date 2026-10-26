import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { ChangelogDialog } from '@/components/changelog/ChangelogDialog';
import type { ReleaseView } from '@/lib/changelog/types';
import sk from '@/locales/sk.json';

const actions = vi.hoisted(() => ({
  markChangelogSeen: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/lib/changelog-actions', () => actions);

const t = sk.changelog;

const RELEASES: ReleaseView[] = [
  {
    id: 8,
    version: '1.42.180',
    releasedAt: '2026-10-26T10:00:00.000Z',
    groups: [
      { type: 'feature', items: ['Graf pokút na stránke hráča.'] },
      { type: 'fix', items: ['Pohár už neukazuje Svetový pohár.'] },
    ],
  },
  {
    id: 7,
    version: '1.41.170',
    releasedAt: '2026-10-12T10:00:00.000Z',
    groups: [{ type: 'improvement', items: ['Rýchlejšie načítanie.'] }],
  },
];

afterEach(() => {
  vi.clearAllMocks();
});

describe('ChangelogDialog', () => {
  it('opens by itself with every release, its headings and bullets', () => {
    render(<ChangelogDialog releases={RELEASES} lang="sk" translations={t} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(t.title)).toBeInTheDocument();
    expect(screen.getByText('Verzia 1.42.180 · 26. 10. 2026')).toBeInTheDocument();
    expect(screen.getByText('Verzia 1.41.170 · 12. 10. 2026')).toBeInTheDocument();
    expect(screen.getByText('Novinky')).toBeInTheDocument();
    expect(screen.getByText('Vylepšenia')).toBeInTheDocument();
    expect(screen.getByText('Opravy')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('marks the newest release seen and closes on the confirm button', async () => {
    render(<ChangelogDialog releases={RELEASES} lang="sk" translations={t} />);

    fireEvent.click(screen.getByRole('button', { name: t.confirm }));

    expect(actions.markChangelogSeen).toHaveBeenCalledWith(8);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('marks it seen on Escape too', async () => {
    render(<ChangelogDialog releases={RELEASES} lang="sk" translations={t} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(actions.markChangelogSeen).toHaveBeenCalledWith(8);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('still closes when saving fails, so the user is never trapped', async () => {
    actions.markChangelogSeen.mockResolvedValueOnce({ success: false, error: 'genericError' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ChangelogDialog releases={RELEASES} lang="sk" translations={t} />);

    fireEvent.click(screen.getByRole('button', { name: t.confirm }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
