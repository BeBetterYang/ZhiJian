import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type KeyboardEvent } from 'react';
import {
  getNodeContent,
  isTableNode,
  type ZhiJianNode,
} from '../core';
import './nodeContentEditor.css';

export interface NodeContentEditorProps {
  node: ZhiJianNode;
  focused: boolean;
  autoFocus?: 'content' | 'description';
  autoFocusOffset?: number;

  // Content mutations
  onContentChange: (content: string) => void;
  onDescriptionChange: (description: string | undefined) => void;

  // Tree operation triggers (all blocked during IME)
  onEnter: (caretOffset: number) => void;
  onShiftEnter: () => void;
  onBackspaceAtContentStart: () => void;
  onBackspaceAtDescriptionStart: () => void;
  onTab: () => void;
  onShiftTab: () => void;

  // Todo
  onTodoToggle?: () => void;
}

export interface NodeContentEditorHandle {
  focus(field: 'content' | 'description', offset?: number): void;
  getSelection(): { field: 'content' | 'description'; offset: number } | null;
}

function stripNewlines(text: string): string {
  return text.replace(/[\r\n]+/g, '');
}

function getCaretOffset(element: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!element.contains(range.startContainer)) return null;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(element);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
}

function setCaretOffset(element: HTMLElement, offset: number): void {
  const range = document.createRange();
  const sel = window.getSelection();
  let currentOffset = 0;
  let targetNode: Node | null = null;
  let targetOffset = 0;

  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (currentOffset + length >= offset) {
        targetNode = node;
        targetOffset = offset - currentOffset;
        return true;
      }
      currentOffset += length;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true;
      }
    }
    return false;
  }

  walk(element);

  if (targetNode) {
    range.setStart(targetNode, targetOffset);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
  } else {
    // Fallback: place at end
    range.selectNodeContents(element);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}

export const NodeContentEditor = forwardRef<NodeContentEditorHandle, NodeContentEditorProps>(
  (props, ref) => {
    const {
      node,
      focused,
      autoFocus,
      autoFocusOffset,
      onContentChange,
      onDescriptionChange,
      onEnter,
      onShiftEnter,
      onBackspaceAtContentStart,
      onBackspaceAtDescriptionStart,
      onTab,
      onShiftTab,
      onTodoToggle,
    } = props;

    const contentRef = useRef<HTMLDivElement>(null);
    const descriptionRef = useRef<HTMLTextAreaElement>(null);
    const isComposingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      focus(field, offset) {
        if (field === 'content' && contentRef.current) {
          contentRef.current.focus();
          if (offset !== undefined) {
            setCaretOffset(contentRef.current, offset);
          }
        } else if (field === 'description' && descriptionRef.current) {
          descriptionRef.current.focus();
          if (offset !== undefined) {
            descriptionRef.current.setSelectionRange(offset, offset);
          }
        }
      },
      getSelection() {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return null;
        const node = sel.anchorNode;
        if (contentRef.current?.contains(node)) {
          const offset = getCaretOffset(contentRef.current);
          return offset !== null ? { field: 'content', offset } : null;
        }
        if (descriptionRef.current === document.activeElement) {
          return {
            field: 'description',
            offset: descriptionRef.current?.selectionStart ?? 0,
          };
        }
        return null;
      },
    }));

    // Auto-focus on mount
    useImperativeHandle(
      ref,
      () => ({
        focus(field, offset) {
          if (field === 'content' && contentRef.current) {
            contentRef.current.focus();
            if (offset !== undefined) {
              setCaretOffset(contentRef.current, offset);
            }
          } else if (field === 'description' && descriptionRef.current) {
            descriptionRef.current.focus();
            if (offset !== undefined) {
              descriptionRef.current.setSelectionRange(offset, offset);
            }
          }
        },
        getSelection() {
          const sel = window.getSelection();
          if (!sel?.rangeCount) return null;
          const node = sel.anchorNode;
          if (contentRef.current?.contains(node)) {
            const offset = getCaretOffset(contentRef.current);
            return offset !== null ? { field: 'content', offset } : null;
          }
          if (descriptionRef.current === document.activeElement) {
            return {
              field: 'description',
              offset: descriptionRef.current?.selectionStart ?? 0,
            };
          }
          return null;
        },
      }),
      []
    );

    // Auto-focus effect
    useEffect(() => {
      if (focused && autoFocus === 'content' && contentRef.current) {
        contentRef.current.focus();
        if (autoFocusOffset !== undefined) {
          setCaretOffset(contentRef.current, autoFocusOffset);
        }
      } else if (focused && autoFocus === 'description' && descriptionRef.current) {
        descriptionRef.current.focus();
        if (autoFocusOffset !== undefined) {
          descriptionRef.current.setSelectionRange(autoFocusOffset, autoFocusOffset);
        }
      }
    }, [focused, autoFocus, autoFocusOffset]);

    const handleContentKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (isComposingRef.current) return;

        if (event.key === 'Enter') {
          event.preventDefault();
          if (event.shiftKey) {
            onShiftEnter();
          } else {
            const offset = getCaretOffset(contentRef.current!);
            if (offset !== null) {
              onEnter(offset);
            }
          }
          return;
        }

        if (event.key === 'Backspace') {
          const offset = getCaretOffset(contentRef.current!);
          if (offset === 0) {
            event.preventDefault();
            onBackspaceAtContentStart();
          }
          return;
        }

        if (event.key === 'Tab') {
          event.preventDefault();
          if (event.shiftKey) {
            onShiftTab();
          } else {
            onTab();
          }
          return;
        }
      },
      [onEnter, onShiftEnter, onBackspaceAtContentStart, onTab, onShiftTab]
    );

    const handleContentInput = useCallback(() => {
      if (!contentRef.current) return;
      const text = contentRef.current.textContent ?? '';
      const cleaned = stripNewlines(text);
      if (text !== cleaned) {
        // CR/LF detected - strip and restore caret
        const offset = getCaretOffset(contentRef.current);
        contentRef.current.textContent = cleaned;
        if (offset !== null) {
          setCaretOffset(contentRef.current, Math.min(offset, cleaned.length));
        }
      }
      onContentChange(cleaned);
    }, [onContentChange]);

    const handleContentBeforeInput = useCallback((event: React.CompositionEvent<HTMLDivElement>) => {
      // Strip newlines from paste/input
      const input = (event as unknown as InputEvent).data;
      if (typeof input === 'string' && /[\r\n]/.test(input)) {
        event.preventDefault();
        document.execCommand('insertText', false, stripNewlines(input));
      }
    }, []);

    const handleContentPaste = useCallback((event: React.ClipboardEvent) => {
      event.preventDefault();
      const text = event.clipboardData.getData('text/plain');
      const cleaned = stripNewlines(text);
      document.execCommand('insertText', false, cleaned);
    }, []);

    const handleDescriptionKeyDown = useCallback(
      (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (isComposingRef.current) return;

        if (event.key === 'Backspace') {
          const textarea = descriptionRef.current;
          if (textarea && textarea.selectionStart === 0 && textarea.value.trim() === '') {
            event.preventDefault();
            onBackspaceAtDescriptionStart();
          }
          return;
        }

        if (event.key === 'Tab') {
          event.preventDefault();
          if (event.shiftKey) {
            onShiftTab();
          } else {
            onTab();
          }
          return;
        }
      },
      [onBackspaceAtDescriptionStart, onTab, onShiftTab]
    );

    const handleDescriptionChange = useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        onDescriptionChange(event.target.value);
      },
      [onDescriptionChange]
    );

    const handleCompositionStart = useCallback(() => {
      isComposingRef.current = true;
    }, []);

    const handleCompositionEnd = useCallback(() => {
      isComposingRef.current = false;
    }, []);

    if (isTableNode(node)) {
      return (
        <div className="zj-node-content-editor zj-node-table">
          <table className="zj-table">
            <tbody>
              {node.table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const content = getNodeContent(node);
    const { blockType, todo, description, images, style, clozes } = node;

    const contentClasses = ['zj-node-content', `zj-content-${blockType}`];
    if (todo?.checked) contentClasses.push('is-done');

    // Cloze masking
    const displayContent =
      clozes && clozes.length > 0
        ? content
            .split('')
            .map((char, index) =>
              clozes.some((range) => index >= range.start && index < range.end) ? '_' : char
            )
            .join('')
        : content;

    return (
      <div className="zj-node-content-editor">
        {todo && (
          <input
            type="checkbox"
            className="zj-node-todo"
            checked={todo.checked}
            onChange={onTodoToggle}
          />
        )}
        <div
          ref={contentRef}
          className={contentClasses.join(' ')}
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          onKeyDown={handleContentKeyDown}
          onInput={handleContentInput}
          onBeforeInput={handleContentBeforeInput as unknown as React.FormEventHandler<HTMLDivElement>}
          onPaste={handleContentPaste}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          style={style}
        >
          {displayContent}
        </div>
        {description !== undefined && (
          <textarea
            ref={descriptionRef}
            className="zj-node-description"
            value={description}
            onChange={handleDescriptionChange}
            onKeyDown={handleDescriptionKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder="描述 (Description)"
          />
        )}
        {images && images.length > 0 && (
          <div className="zj-node-images">
            {images.map((image) => (
              <img key={image.id} src={image.url} alt={image.alt ?? ''} />
            ))}
          </div>
        )}
      </div>
    );
  }
);

NodeContentEditor.displayName = 'NodeContentEditor';
