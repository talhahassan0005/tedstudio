'use client';

import { useEffect } from 'react';

import { restoreEditorState, startEditorPersistence } from '@/lib/editor-persistence';

/**
 * Mounts once in the root layout: restores the previous editor session from
 * IndexedDB, then keeps mirroring changes back. Renders nothing.
 */
export function PersistenceProvider() {
  useEffect(() => {
    let stop: (() => void) | undefined;

    void restoreEditorState().then(() => {
      // Subscribe only after restore, so the initial empty state does not
      // overwrite what we are about to load.
      stop = startEditorPersistence();
    });

    return () => stop?.();
  }, []);

  return null;
}
