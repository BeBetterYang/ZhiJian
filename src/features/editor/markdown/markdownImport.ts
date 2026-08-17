import { parseMarkdown } from './parser';
import type { MarkdownImportResult, ParseMarkdownOptions } from './markdownTypes';

export function importMarkdown(markdown: string, options?: ParseMarkdownOptions): MarkdownImportResult {
  return {
    document: parseMarkdown(markdown, options),
  };
}
