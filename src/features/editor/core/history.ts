import { cloneDocument, type ZhiJianDocument } from './documentTypes';
import type { DocumentCommand } from './documentCommands';

export interface HistoryEntry {
  before: ZhiJianDocument;
  after: ZhiJianDocument;
  command: DocumentCommand;
  timestamp: number;
  mergeKey?: string;
}

export interface DocumentHistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

export interface PushHistoryOptions {
  mergeKey?: string;
  timestamp?: number;
  mergeWindowMs?: number;
}

export function createHistoryState(): DocumentHistoryState {
  return {
    undoStack: [],
    redoStack: [],
  };
}

export function pushHistory(
  history: DocumentHistoryState,
  entry: Omit<HistoryEntry, 'timestamp'>,
  options: PushHistoryOptions = {},
): DocumentHistoryState {
  const timestamp = options.timestamp ?? Date.now();
  const mergeWindowMs = options.mergeWindowMs ?? 800;
  const mergeKey = options.mergeKey ?? entry.mergeKey;
  const previous = history.undoStack[history.undoStack.length - 1];

  if (
    mergeKey &&
    previous?.mergeKey === mergeKey &&
    timestamp - previous.timestamp <= mergeWindowMs
  ) {
    return {
      undoStack: [
        ...history.undoStack.slice(0, -1),
        {
          before: cloneDocument(previous.before),
          after: cloneDocument(entry.after),
          command: entry.command,
          timestamp,
          mergeKey,
        },
      ],
      redoStack: [],
    };
  }

  return {
    undoStack: [
      ...history.undoStack,
      {
        before: cloneDocument(entry.before),
        after: cloneDocument(entry.after),
        command: entry.command,
        timestamp,
        mergeKey,
      },
    ],
    redoStack: [],
  };
}

export function undoHistory(
  history: DocumentHistoryState,
  currentDocument: ZhiJianDocument,
): { document: ZhiJianDocument; history: DocumentHistoryState; changed: boolean } {
  const entry = history.undoStack[history.undoStack.length - 1];
  if (!entry) return { document: currentDocument, history, changed: false };

  return {
    document: cloneDocument(entry.before),
    history: {
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [
        ...history.redoStack,
        {
          ...entry,
          after: cloneDocument(currentDocument),
        },
      ],
    },
    changed: true,
  };
}

export function redoHistory(
  history: DocumentHistoryState,
  currentDocument: ZhiJianDocument,
): { document: ZhiJianDocument; history: DocumentHistoryState; changed: boolean } {
  const entry = history.redoStack[history.redoStack.length - 1];
  if (!entry) return { document: currentDocument, history, changed: false };

  return {
    document: cloneDocument(entry.after),
    history: {
      undoStack: [
        ...history.undoStack,
        {
          ...entry,
          before: cloneDocument(currentDocument),
        },
      ],
      redoStack: history.redoStack.slice(0, -1),
    },
    changed: true,
  };
}
