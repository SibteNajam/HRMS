'use client';

import { useRef } from 'react';
import { Provider } from 'react-redux';
import { initListeners, makeStore, type AppStore } from './index';

/**
 * A fresh store per request on the server, a single store in the browser.
 *
 * Creating the store at module scope would leak one user's cache into another
 * user's request during SSR.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = makeStore();
    initListeners(storeRef.current);
  }

  return <Provider store={storeRef.current}>{children}</Provider>;
}
