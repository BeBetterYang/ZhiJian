import { cloneDocument, type ZhiJianDocument } from './documentTypes';
import type { DocumentCommand } from './documentCommands';
import { reduceDocument } from './documentReducer';
import {
  createHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
  type DocumentHistoryState,
  type PushHistoryOptions,
} from './history';
import { assertValidDocument } from './treeValidation';

export interface ExecuteCommandOptions extends PushHistoryOptions {
  recordHistory?: boolean;
}

export interface ReplaceDocumentOptions extends PushHistoryOptions {
  recordHistory?: boolean;
  dirty?: boolean;
  resetHistory?: boolean;
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface DocumentStoreSnapshot {
  document: DeepReadonly<ZhiJianDocument>;
  history: DeepReadonly<DocumentHistoryState>;
  dirty: boolean;
}

type Listener = () => void;

export class DocumentStore {
  #document: ZhiJianDocument;
  #history: DocumentHistoryState;
  #dirty = false;
  #snapshot: DocumentStoreSnapshot;
  #listeners = new Set<Listener>();

  constructor(document: ZhiJianDocument, history = createHistoryState()) {
    assertValidDocument(document);
    this.#document = cloneDocument(document);
    this.#history = history;
    this.#snapshot = this.#createSnapshot();
  }

  getSnapshot(): DocumentStoreSnapshot {
    return this.#snapshot;
  }

  getDocument(): ZhiJianDocument {
    return cloneDocument(this.#document);
  }

  execute(command: DocumentCommand, options: ExecuteCommandOptions = {}): ZhiJianDocument {
    const before = this.#document;
    const after = reduceDocument(this.#document, command);
    this.#document = after;
    this.#dirty = true;

    if (options.recordHistory !== false) {
      const mergeKey = options.mergeKey ?? (command.type === 'updateContent' ? command.mergeKey : undefined);
      this.#history = pushHistory(this.#history, { before, after, command, mergeKey }, options);
    }

    this.#refreshSnapshot();
    this.#emit();
    return this.#document;
  }

  executeTransaction(commands: DocumentCommand[], options: ExecuteCommandOptions = {}): ZhiJianDocument {
    if (commands.length === 0) return this.#document;
    const before = this.#document;
    let after = this.#document;
    for (const command of commands) {
      after = reduceDocument(after, command);
    }
    this.#document = after;
    this.#dirty = true;

    if (options.recordHistory !== false) {
      this.#history = pushHistory(this.#history, {
        before,
        after,
        command: { type: 'transaction', commands },
        mergeKey: options.mergeKey,
      }, options);
    }

    this.#refreshSnapshot();
    this.#emit();
    return this.#document;
  }

  replaceDocument(document: ZhiJianDocument, options: ReplaceDocumentOptions = {}): ZhiJianDocument {
    assertValidDocument(document);
    const before = this.#document;
    const after = cloneDocument(document);
    this.#document = after;
    this.#dirty = options.dirty ?? true;

    if (options.resetHistory) {
      this.#history = createHistoryState();
    } else if (options.recordHistory !== false) {
      this.#history = pushHistory(this.#history, {
        before,
        after,
        command: { type: 'transaction', commands: [] },
        mergeKey: options.mergeKey,
      }, options);
    }

    this.#refreshSnapshot();
    this.#emit();
    return this.#document;
  }

  undo(): boolean {
    const result = undoHistory(this.#history, this.#document);
    if (!result.changed) return false;
    this.#document = result.document;
    this.#history = result.history;
    this.#dirty = true;
    this.#refreshSnapshot();
    this.#emit();
    return true;
  }

  redo(): boolean {
    const result = redoHistory(this.#history, this.#document);
    if (!result.changed) return false;
    this.#document = result.document;
    this.#history = result.history;
    this.#dirty = true;
    this.#refreshSnapshot();
    this.#emit();
    return true;
  }

  markSaved(): void {
    if (!this.#dirty) return;
    this.#dirty = false;
    this.#refreshSnapshot();
    this.#emit();
  }

  resetHistory(): void {
    this.#history = createHistoryState();
    this.#refreshSnapshot();
    this.#emit();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #createSnapshot(): DocumentStoreSnapshot {
    return {
      document: this.#document,
      history: this.#history,
      dirty: this.#dirty,
    };
  }

  #refreshSnapshot(): void {
    this.#snapshot = this.#createSnapshot();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

export function createDocumentStore(document: ZhiJianDocument): DocumentStore {
  return new DocumentStore(document);
}
