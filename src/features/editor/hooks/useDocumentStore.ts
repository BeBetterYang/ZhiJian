import { useEffect, useState } from 'react';
import type { DocumentStore, DocumentStoreSnapshot } from '../core';

export function useDocumentStore(store: DocumentStore): DocumentStoreSnapshot {
  const [snapshot, setSnapshot] = useState(() => store.getSnapshot());

  useEffect(() => {
    return store.subscribe(setSnapshot);
  }, [store]);

  return snapshot;
}
