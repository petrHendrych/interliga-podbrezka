import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { INSTALL_DISMISSED_KEY } from '@/lib/hooks/usePwaInstall';
import sk from '@/locales/sk.json';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126';

const t = sk.pwa;

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

// The shared setup stubs matchMedia to always miss, so each standalone case opts in by hand.
function setDisplayMode(standalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: standalone, media: query } as MediaQueryList),
  );
}

function fireInstallPrompt() {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
  });
  act(() => { window.dispatchEvent(event); });
}

beforeEach(() => {
  window.localStorage.clear();
  setUserAgent(ANDROID_UA);
  setDisplayMode(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstallPrompt', () => {
  it('renders nothing in a browser that cannot install', () => {
    const { container } = render(<InstallPrompt translations={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the app is already installed', () => {
    setDisplayMode(true);
    const { container } = render(<InstallPrompt translations={t} />);
    fireInstallPrompt();

    expect(container).toBeEmptyDOMElement();
  });

  it('offers the install button once Chrome fires the prompt event', () => {
    render(<InstallPrompt translations={t} />);
    fireInstallPrompt();

    expect(screen.getByText(t.installTitle)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.installButton })).toBeInTheDocument();
  });

  it('shows the Add to Home Screen steps on iOS instead of a button', () => {
    setUserAgent(IPHONE_UA);
    render(<InstallPrompt translations={t} />);

    expect(screen.getByText(t.iosInstructionsTitle)).toBeInTheDocument();
    expect(screen.getByText(t.iosInstructionsStep1)).toBeInTheDocument();
    expect(screen.getByText(t.iosInstructionsStep2)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.installButton })).not.toBeInTheDocument();
  });

  it('stays hidden once it has been dismissed', () => {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    setUserAgent(IPHONE_UA);
    const { container } = render(<InstallPrompt translations={t} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('disappears when dismissed and remembers it', () => {
    setUserAgent(IPHONE_UA);
    render(<InstallPrompt translations={t} />);

    act(() => { screen.getByRole('button', { name: t.dismiss }).click(); });

    expect(screen.queryByText(t.iosInstructionsTitle)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('true');
  });
});
