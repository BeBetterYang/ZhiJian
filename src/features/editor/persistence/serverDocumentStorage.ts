import type { ZhiJianDocument } from '../core';
import { loadServerJson, saveServerJson } from '../../../serverStorage';
import { parsePersistedDocument, toPersistedDocument } from './documentPersistence';

export function getServerDocumentPath(documentId: string): string {
  return `/api/maps/${encodeURIComponent(documentId)}`;
}

export async function saveServerDocument(documentId: string, document: ZhiJianDocument): Promise<void> {
  await saveServerJson(getServerDocumentPath(documentId), toPersistedDocument(document));
}

export async function loadServerDocument(documentId: string): Promise<ZhiJianDocument | null> {
  const value = await loadServerJson<unknown>(getServerDocumentPath(documentId));
  return parsePersistedDocument(value);
}
