import {
  cloneDocument,
  type ZhiJianDocument,
} from '../core';
import { validateDocument } from '../core/treeValidation';

export interface PersistedZhiJianDocument {
  schemaVersion: 1;
  document: ZhiJianDocument;
}

export function toPersistedDocument(document: ZhiJianDocument): PersistedZhiJianDocument {
  return {
    schemaVersion: 1,
    document: cloneDocument(document),
  };
}

export function parsePersistedDocument(value: unknown): ZhiJianDocument | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PersistedZhiJianDocument>;
  if (candidate.schemaVersion !== 1 || !candidate.document) return null;
  const result = validateDocument(candidate.document);
  return result.valid ? cloneDocument(candidate.document) : null;
}
