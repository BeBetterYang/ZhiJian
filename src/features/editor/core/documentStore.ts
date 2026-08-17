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

export interface DocumentStoreSnapshot {
  document: ZhiJianDocument;
  history: DocumentHistoryState;
  dirty: boolean;
}

type Listener = (snapshot: DocumentStoreSnapshot) => void;

export class DocumentStore {
  #document: ZhiJianDocument;
  #history: DocumentHistoryState;
  #dirty = false;
  #listeners = new Set<Listener>();

  constructor(document: ZhiJianDocument, history = createHistoryState()) {
    assertValidDocument(document);
    this.#document = cloneDocument(document);
    this.#history = history;
  }

  getSnapshot(): DocumentStoreSnapshot {
    return {
      document: cloneDocument(this.#document),
      history: {
        undoStack: [...this.#history.undoStack],
        redoStack: [...this.#history.redoStack],
      },
      dirty: this.#dirty,
    };
  }

  getDocument(): ZhiJianDocument {
    return cloneDocument(this.#document);
  }

  execute(command: DocumentCommand, options: ExecuteCommandOptions = {}): ZhiJianDocument {
    const before = cloneDocument(this.#document);
    const after = reduceDocument(this.#document, command);
    this.#document = after;
    this.#dirty = true;

    if (options.recordHistory !== false) {
      const mergeKey = options.mergeKey ?? (command.type === 'updateContent' ? command.mergeKey : undefined);
      this.#history = pushHistory(this.#history, { before, after, command, mergeKey }, options);
    } else {
      this.#history = createHistoryState();
    }

    this.#emit();
    return this.getDocument();
  }

  undo(): boolean {
    const result = undoHistory(this.#history, this.#document);
    if (!result.changed) return false;
    this.#document = result.document;
    this.#history = result.history;
    this.#dirty = true;
    this.#emit();
    return true;
  }

  redo(): boolean {
    const result = redoHistory(this.#history, this.#document);
    if (!result.changed) return false;
    this.#document = result.document;
    this.#history = result.history;
    this.#dirty = true;
    this.#emit();
    return true;
  }

  markSaved(): void {
    this.#dirty = false;
    this.#emit();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}

export function createDocumentStore(document: ZhiJianDocument): DocumentStore {
  return new DocumentStore(document);
}
