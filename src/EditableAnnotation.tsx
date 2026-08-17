import { useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type FormEvent, type KeyboardEvent, type SyntheticEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  onFocus?: () => void;
  onInput?: (value: string) => void;
  onResize?: () => void;
  onDeleteEmpty?: () => void;
  useFloatingEditor?: boolean;
  floatingBackground?: string;
  requireActivation?: boolean;
  canEditOnClick?: () => boolean;
};

type FloatingEditorState = {
  top: number;
  left: number;
  minWidth: number;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
};

function measureAnnotationTextWidth(element: HTMLDivElement) {
  const measure = element.cloneNode(true) as HTMLDivElement;
  Object.assign(measure.style, {
    position: 'fixed',
    top: '0',
    left: '-10000px',
    width: 'max-content',
    minWidth: '0',
    maxWidth: 'none',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  document.body.appendChild(measure);
  const width = Math.ceil(measure.getBoundingClientRect().width);
  measure.remove();
  return Math.max(1, width);
}

function focusAtEnd(element: HTMLDivElement | null) {
  if (!element) return;
  element.focus();
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function isEditableContentEmpty(element: HTMLElement) {
  return (element.textContent ?? '')
    .replaceAll('\u00a0', '')
    .replaceAll('\u200b', '')
    .replaceAll('\u200c', '')
    .replaceAll('\u200d', '')
    .replaceAll('\ufeff', '')
    .trim() === '';
}

export default function EditableAnnotation({
  value,
  onChange,
  className = '',
  style,
  autoFocus,
  onFocus,
  onInput,
  onResize,
  onDeleteEmpty,
  useFloatingEditor = false,
  floatingBackground = '#fff',
  requireActivation = false,
  canEditOnClick,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const editingHtmlRef = useRef(value);
  const composingRef = useRef(false);
  const deletingRef = useRef(false);
  const [floatingEditor, setFloatingEditor] = useState<FloatingEditorState | null>(null);
  const [isEditing, setIsEditing] = useState(!requireActivation || Boolean(autoFocus));

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !onResize) return;
    let width = element.offsetWidth;
    let height = element.offsetHeight;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.offsetWidth;
      const nextHeight = element.offsetHeight;
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      onResize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onResize]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || document.activeElement === element || element.innerHTML === value) return;
    element.innerHTML = value;
  }, [value]);

  useLayoutEffect(() => {
    if (!autoFocus) return;
    window.requestAnimationFrame(() => focusAtEnd(ref.current));
  }, [autoFocus]);

  useLayoutEffect(() => {
    const element = floatingRef.current;
    if (!floatingEditor || !element) return;
    element.innerHTML = editingHtmlRef.current;
    element.focus({ preventScroll: true });
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [floatingEditor]);

  const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();
  const createFloatingEditorState = (element: HTMLDivElement): FloatingEditorState => {
    const wrapper = element.parentElement ?? element;
    const rect = wrapper.getBoundingClientRect();
    const computed = window.getComputedStyle(element);
    const textWidth = measureAnnotationTextWidth(element);
    editingHtmlRef.current = element.innerHTML;
    return {
      top: rect.top,
      left: rect.left,
      minWidth: Math.max(36, textWidth + 8),
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      color: computed.color,
    };
  };
  const beginEdit = (force = false) => {
    if (requireActivation && !force && !canEditOnClick?.()) return;
    const element = ref.current;
    if (!element) return;
    deletingRef.current = false;
    onFocus?.();
    if (useFloatingEditor) {
      flushSync(() => {
        setIsEditing(true);
        setFloatingEditor(createFloatingEditorState(element));
      });
      return;
    }
    flushSync(() => setIsEditing(true));
    focusAtEnd(element);
  };
  const deleteEmptyAnnotation = (element: HTMLDivElement) => {
    if (!onDeleteEmpty || !isEditableContentEmpty(element)) return false;
    deletingRef.current = true;
    editingHtmlRef.current = '';
    if (ref.current) ref.current.innerHTML = '';
    flushSync(() => {
      setFloatingEditor(null);
      setIsEditing(!requireActivation);
    });
    onDeleteEmpty();
    return true;
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const nativeEvent = event.nativeEvent;
    const isComposing = composingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229;
    if (event.key === 'Backspace' && !isComposing && deleteEmptyAnnotation(event.currentTarget)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  const handleBeforeInput = (event: FormEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    if (nativeEvent.inputType !== 'deleteContentBackward' || composingRef.current || nativeEvent.isComposing) return;
    if (deleteEmptyAnnotation(event.currentTarget)) event.preventDefault();
  };
  const openFloatingEditor = (event: FocusEvent<HTMLDivElement>) => {
    onFocus?.();
    if (!useFloatingEditor || floatingEditor) return;
    setFloatingEditor(createFloatingEditorState(event.currentTarget));
  };
  const handleFloatingInput = (html: string) => {
    editingHtmlRef.current = html;
  };
  const closeFloatingEditor = (html: string) => {
    if (deletingRef.current) return;
    editingHtmlRef.current = html;
    if (ref.current) ref.current.innerHTML = html;
    setFloatingEditor(null);
    setIsEditing(!requireActivation);
    onChange(html);
  };

  return (
    <div className={`editable-annotation ${className}`.trim()} style={style}>
      <div
        ref={ref}
        className={`editable-annotation-content${requireActivation && !isEditing ? ' is-readonly' : ''}`}
        contentEditable={!requireActivation || isEditing}
        suppressContentEditableWarning
        role="textbox"
        aria-label="节点批注"
        aria-multiline="true"
        onFocus={openFloatingEditor}
        style={floatingEditor ? { visibility: 'hidden' } : undefined}
        tabIndex={!requireActivation || isEditing ? 0 : -1}
        onMouseDown={(event) => { if (isEditing) stopPropagation(event); }}
        onClick={(event) => {
          event.stopPropagation();
          if (!isEditing) beginEdit();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (!isEditing) beginEdit(true);
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => { composingRef.current = false; }}
        onKeyDown={handleKeyDown}
        onBeforeInput={handleBeforeInput}
        onInput={(event) => onInput?.(event.currentTarget.innerHTML)}
        onBlur={(event) => {
          if (deletingRef.current) return;
          if (!useFloatingEditor) {
            setIsEditing(!requireActivation);
            onChange(event.currentTarget.innerHTML);
          }
        }}
        dangerouslySetInnerHTML={{ __html: value }}
      />
      {floatingEditor && createPortal(
        <div
          ref={floatingRef}
          className="editable-annotation-floating-editor mind-map-floating-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="节点批注"
          aria-multiline="true"
          style={{
            position: 'fixed',
            top: floatingEditor.top,
            left: floatingEditor.left,
            zIndex: 3000,
            width: 'max-content',
            minWidth: floatingEditor.minWidth,
            maxWidth: 500,
            minHeight: '1.5em',
            paddingLeft: 7,
            borderLeft: '1px solid #71867b',
            outline: 'none',
            background: floatingBackground,
            boxShadow: '0 8px 24px rgba(0, 0, 0, .14)',
            color: floatingEditor.color,
            fontFamily: floatingEditor.fontFamily,
            fontSize: floatingEditor.fontSize,
            fontWeight: floatingEditor.fontWeight,
            lineHeight: floatingEditor.lineHeight,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
          onMouseDown={stopPropagation}
          onClick={stopPropagation}
          onDoubleClick={stopPropagation}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={handleKeyDown}
          onBeforeInput={handleBeforeInput}
          onInput={(event) => handleFloatingInput(event.currentTarget.innerHTML)}
          onBlur={(event) => closeFloatingEditor(event.currentTarget.innerHTML)}
        />,
        document.body,
      )}
    </div>
  );
}
