import type { ZhiJianDocument } from '../core';

export interface ParseMarkdownOptions {
  documentId?: string;
  rootId?: string;
  now?: number;
}

export interface MarkdownImportResult {
  document: ZhiJianDocument;
}
