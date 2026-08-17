export type LegacyMindMapNode = {
  data: Record<string, unknown> & { text?: string; richText?: boolean; expand?: boolean };
  children?: LegacyMindMapNode[];
  smmVersion?: string;
};
