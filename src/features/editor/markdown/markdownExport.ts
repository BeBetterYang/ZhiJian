import type { ZhiJianDocument } from '../core';
import { serializeMarkdown } from './serializer';

export function exportMarkdownDocument(document: ZhiJianDocument): string {
  return serializeMarkdown(document);
}
