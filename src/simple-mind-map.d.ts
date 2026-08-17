declare module 'simple-mind-map' {
  export default class MindMap {
    static usePlugin(plugin: unknown, options?: Record<string, unknown>): typeof MindMap;
    constructor(options: Record<string, unknown>);
    renderer: { activeNodeList: MindMapNode[] };
    view: { fit(): void; enlarge(): void; narrow(): void };
    associativeLine?: { createLineFromActiveNode(): void };
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
    execCommand(command: string, ...args: unknown[]): void;
    getData(withConfig?: boolean): unknown;
    setData(data: unknown): void;
    setFullData(data: unknown): void;
    setLayout(layout: string): void;
    setThemeConfig(config: Record<string, unknown>): void;
    export(type: string, isDownload?: boolean, name?: string, ...args: unknown[]): Promise<unknown>;
    render(callback?: () => void): void;
    resize(): void;
    destroy(): void;
  }

  export interface MindMapNode {
    isRoot?: boolean;
    mindMap: MindMap;
    getData(key?: string): unknown;
    setData(data: Record<string, unknown>): void;
  }
}

declare module 'simple-mind-map/src/plugins/*.js' {
  const plugin: unknown;
  export default plugin;
}

declare module 'simple-mind-map/src/parse/markdown.js' {
  const markdown: {
    transformToMarkdown(data: unknown): string;
    transformMarkdownTo(content: string): Promise<unknown>;
  };
  export default markdown;
}
