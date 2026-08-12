import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SEASONS_CONFIG } from '@/lib/season-config';
import { SeasonLeagueFilter } from '@/components/dashboard/SeasonLeagueFilter';

const push = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/sk/player/123',
  useSearchParams: () => searchParams,
}));

const labels = {
  seasonLabel: 'Sezóna',
  allLeagues: 'Všetko',
  interliga: 'Interliga',
  pohar: 'Pohár',
  turnaje: 'Turnaje',
};

function renderFilter(selectedLeagueKey = 'all') {
  return render(
    <SeasonLeagueFilter
      seasons={SEASONS_CONFIG}
      selectedSeasonId={12}
      selectedLeagueKey={selectedLeagueKey}
      labels={labels}
    />,
  );
}

beforeEach(() => {
  push.mockClear();
  searchParams = new URLSearchParams();
});

describe('league tabs', () => {
  it('writes the league to the query string', () => {
    renderFilter();
    fireEvent.click(screen.getByRole('button', { name: labels.interliga }));

    expect(push).toHaveBeenCalledWith('/sk/player/123?league=interliga&season=12');
  });

  it('groups every manual competition behind the tournaments tab', () => {
    renderFilter();
    fireEvent.click(screen.getByRole('button', { name: labels.turnaje }));

    expect(push).toHaveBeenCalledWith(expect.stringContaining('league=turnaje'));
  });

  it('keeps the season already in the URL instead of overwriting it', () => {
    searchParams = new URLSearchParams('season=13');
    renderFilter();
    fireEvent.click(screen.getByRole('button', { name: labels.pohar }));

    expect(push).toHaveBeenCalledWith('/sk/player/123?season=13&league=pohar');
  });

  it('preserves unrelated query parameters', () => {
    searchParams = new URLSearchParams('tab=stats');
    renderFilter();
    fireEvent.click(screen.getByRole('button', { name: labels.interliga }));

    expect(push).toHaveBeenCalledWith(expect.stringContaining('tab=stats'));
  });

  it('marks the selected league as the active tab', () => {
    renderFilter('interliga');
    const active = screen.getByRole('button', { name: labels.interliga });
    const inactive = screen.getByRole('button', { name: labels.pohar });

    expect(active.className).toContain('bg-primary');
    expect(inactive.className).not.toContain('bg-primary');
  });
});

describe('season select', () => {
  it('shows the selected season, not the default one', () => {
    renderFilter();
    const selected = SEASONS_CONFIG.find((s) => s.id === 12)!;

    expect(screen.getByText(selected.name)).toBeInTheDocument();
  });
});
