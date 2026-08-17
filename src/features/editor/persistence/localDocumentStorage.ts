import type { ZhiJianDocument } from '../core';
import { parsePersistedDocument, toPersistedDocument } from './documentPersistence';

const DOCUMENT_STORAGE_PREFIX = 'zhijian-document-v1-';

export function getLocalDocumentStorageKey(documentId: string): string {
  return `${DOCUMENT_STORAGE_PREFIX}${documentId}`;
}

export function saveLocalDocument(documentId: string, document: ZhiJianDocument): void {
  localStorage.setItem(getLocalDocumentStorageKey(documentId), JSON.stringify(toPersistedDocument(document)));
}

export function loadLocalDocument(documentId: string): ZhiJianDocument | null {
  const raw = localStorage.getItem(getLocalDocumentStorageKey(documentId));
  if (!raw) return null;
  try {
    return parsePersistedDocument(JSON.parse(raw));
  } catch {
    return null;
  }
}
