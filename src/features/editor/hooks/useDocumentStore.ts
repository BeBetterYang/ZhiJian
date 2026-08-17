import { useSyncExternalStore } from 'react';
import type { DocumentStore, DocumentStoreSnapshot } from '../core';

export function useDocumentStore(store: DocumentStore): DocumentStoreSnapshot {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}
