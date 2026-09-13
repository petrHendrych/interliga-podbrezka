import {
  describe, expect, it, vi,
} from 'vitest';
import { render, screen } from '@testing-library/react';
import { PullToRefresh, PullToRefreshIndicator } from '@/components/pwa/PullToRefresh';
import sk from '@/locales/sk.json';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const t = sk.pwa;

describe('PullToRefreshIndicator', () => {
  it('follows the finger without animating while dragging', () => {
    const { container } = render(
      <PullToRefreshIndicator distance={32} progress={0.5} isDragging isRefreshing={false} />,
    );
    const badge = container.firstElementChild as HTMLElement;

    expect(badge.style.transform).toContain('translate3d(0, 32px');
    expect(badge.className).not.toContain('transition-');
  });

  it('animates back once the finger is gone', () => {
    const { container } = render(
      <PullToRefreshIndicator
        distance={32}
        progress={0.5}
        isDragging={false}
        isRefreshing={false}
      />,
    );

    expect((container.firstElementChild as HTMLElement).className).toContain('transition-');
  });

  it('spins instead of tracking the pull while refreshing', () => {
    const { container } = render(
      <PullToRefreshIndicator distance={72} progress={1} isDragging={false} isRefreshing />,
    );
    // An svg carries no accessible role, so there is nothing else to query it by.
    const icon = container.querySelector('svg') as SVGElement;

    expect(icon.getAttribute('class')).toContain('animate-spin');
    expect(icon.getAttribute('style')).toBeNull();
  });

  it('never eats a tap meant for the page behind it', () => {
    const { container } = render(
      <PullToRefreshIndicator distance={32} progress={0.5} isDragging isRefreshing={false} />,
    );

    expect((container.firstElementChild as HTMLElement).className).toContain('pointer-events-none');
  });
});

describe('PullToRefresh', () => {
  it('mounts a silent live region and no badge when idle', () => {
    const { container } = render(<PullToRefresh translations={{ refreshing: t.pullRefreshing }} />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(container.querySelector('svg')).toBeNull();
  });
});
