import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees and reset the DOM between tests.
afterEach(() => {
  cleanup();
});

// jsdom does not implement scrollIntoView; the MessageList auto-scroll calls it.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
