import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom implements none of these, and base-ui's popups call all of them.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

const resizeObserverStub = function ResizeObserverStub(this: ResizeObserver) {
  this.observe = () => {};
  this.unobserve = () => {};
  this.disconnect = () => {};
} as unknown as typeof ResizeObserver;

globalThis.ResizeObserver ??= resizeObserverStub;

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

afterEach(() => {
  cleanup();
});
