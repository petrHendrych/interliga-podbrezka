import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { INSTALL_DISMISSED_KEY, usePwaInstall } from '@/lib/hooks/usePwaInstall';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126';

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

// The shared setup stubs matchMedia to always miss, so each standalone case opts in by hand.
function setDisplayMode(standalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: standalone, media: query } as MediaQueryList),
  );
}

function firePrompt(prompt = vi.fn().mockResolvedValue(undefined)) {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt });
  act(() => { window.dispatchEvent(event); });
  return { event, prompt };
}

beforeEach(() => {
  window.localStorage.clear();
  setUserAgent(ANDROID_UA);
  setDisplayMode(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePwaInstall', () => {
  it('captures beforeinstallprompt and suppresses the browser mini-infobar', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canPrompt).toBe(false);

    const { event } = firePrompt();

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.canPrompt).toBe(true);
  });

  it('prompts with the stored event and forgets it afterwards', async () => {
    const { result } = renderHook(() => usePwaInstall());
    const { prompt } = firePrompt();

    await act(async () => { await result.current.promptInstall(); });

    expect(prompt).toHaveBeenCalledOnce();
    expect(result.current.canPrompt).toBe(false);
  });

  it('reports standalone from the display mode', () => {
    setDisplayMode(true);
    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.isStandalone).toBe(true);
  });

  it('reports standalone from navigator.standalone, which is all iOS sets', () => {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.isStandalone).toBe(true);

    Reflect.deleteProperty(window.navigator, 'standalone');
  });

  it('detects iOS, which never fires beforeinstallprompt', () => {
    setUserAgent(IPHONE_UA);
    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.isIOS).toBe(true);
    expect(result.current.canPrompt).toBe(false);
  });

  it('remembers a dismissal across mounts', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isDismissed).toBe(false);

    act(() => result.current.dismiss());

    expect(result.current.isDismissed).toBe(true);
    expect(window.localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('true');
    expect(renderHook(() => usePwaInstall()).result.current.isDismissed).toBe(true);
  });

  it('goes standalone and drops the prompt once the app is installed', () => {
    const { result } = renderHook(() => usePwaInstall());
    firePrompt();

    act(() => { window.dispatchEvent(new Event('appinstalled')); });

    expect(result.current.isStandalone).toBe(true);
    expect(result.current.canPrompt).toBe(false);
  });
});
