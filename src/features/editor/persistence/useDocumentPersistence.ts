import { useEffect, useRef } from 'react';
import type { DocumentStore, ZhiJianDocument } from '../core';
import { useDocumentStore } from '../hooks/useDocumentStore';
import { saveLocalDocument } from './localDocumentStorage';
import { saveServerDocument } from './serverDocumentStorage';

export interface UseDocumentPersistenceOptions {
  store: DocumentStore;
  documentId: string;
  debounceMs?: number;
  saveServer?: boolean;
}

export function useDocumentPersistence({
  store,
  documentId,
  debounceMs = 700,
  saveServer = true,
}: UseDocumentPersistenceOptions): void {
  const snapshot = useDocumentStore(store);
  const saveVersionRef = useRef(0);

  useEffect(() => {
    if (!snapshot.dirty) return;
    const documentToSave = snapshot.document as ZhiJianDocument;
    const saveVersion = saveVersionRef.current + 1;
    saveVersionRef.current = saveVersion;
    const timer = window.setTimeout(() => {
      try {
        saveLocalDocument(documentId, documentToSave);
      } catch {
        // Keep dirty=true when local save fails.
        return;
      }

      const markSavedIfCurrent = () => {
        if (
          saveVersionRef.current === saveVersion
          && store.getSnapshot().document === documentToSave
        ) {
          store.markSaved();
        }
      };

      if (!saveServer) {
        markSavedIfCurrent();
        return;
      }

      void saveServerDocument(documentId, documentToSave)
        .then(markSavedIfCurrent)
        .catch(() => {
          // Keep dirty=true on server failure.
        });
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [debounceMs, documentId, saveServer, snapshot.dirty, snapshot.document, store]);
}
