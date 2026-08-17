import { cloneDocument, type ZhiJianDocument } from './documentTypes';
import type { DocumentCommand } from './documentCommands';

export const DEFAULT_HISTORY_MAX_ENTRIES = 100;

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
  maxEntries: number;
}

export interface PushHistoryOptions {
  mergeKey?: string;
  timestamp?: number;
  mergeWindowMs?: number;
  maxEntries?: number;
}

function limitEntries<T>(entries: T[], maxEntries: number): T[] {
  if (entries.length <= maxEntries) return entries;
  return entries.slice(entries.length - maxEntries);
}

export function createHistoryState(maxEntries = DEFAULT_HISTORY_MAX_ENTRIES): DocumentHistoryState {
  return {
    undoStack: [],
    redoStack: [],
    maxEntries,
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
  const maxEntries = options.maxEntries ?? history.maxEntries ?? DEFAULT_HISTORY_MAX_ENTRIES;
  const previous = history.undoStack[history.undoStack.length - 1];

  if (
    mergeKey &&
    previous?.mergeKey === mergeKey &&
    timestamp - previous.timestamp <= mergeWindowMs
  ) {
    const undoStack = [
      ...history.undoStack.slice(0, -1),
      {
        before: previous.before,
        after: cloneDocument(entry.after),
        command: entry.command,
        timestamp,
        mergeKey,
      },
    ];

    return {
      undoStack: limitEntries(undoStack, maxEntries),
      redoStack: [],
      maxEntries,
    };
  }

  const undoStack = [
    ...history.undoStack,
    {
      before: cloneDocument(entry.before),
      after: cloneDocument(entry.after),
      command: entry.command,
      timestamp,
      mergeKey,
    },
  ];

  return {
    undoStack: limitEntries(undoStack, maxEntries),
    redoStack: [],
    maxEntries,
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
      redoStack: limitEntries([
        ...history.redoStack,
        {
          ...entry,
          after: currentDocument,
        },
      ], history.maxEntries),
      maxEntries: history.maxEntries,
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
      undoStack: limitEntries([
        ...history.undoStack,
        {
          ...entry,
          before: currentDocument,
        },
      ], history.maxEntries),
      redoStack: history.redoStack.slice(0, -1),
      maxEntries: history.maxEntries,
    },
    changed: true,
  };
}
