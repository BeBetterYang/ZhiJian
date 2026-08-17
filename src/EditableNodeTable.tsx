import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { IconDelete, IconMore, IconPlus } from '@arco-design/web-react/icon';

export type EditableTableData = {
  rows: number;
  columns: number;
  cells: string[][];
};

type CellPosition = {
  row: number;
  column: number;
  left: number;
  top: number;
};

type Props = {
  value: EditableTableData;
  onChange: (value: EditableTableData) => void;
  onDelete?: () => void;
  onInput?: () => void;
  onTextSelection?: (element: HTMLElement, row: number, column: number) => void;
  useFloatingEditor?: boolean;
  floatingBackground?: string;
  requireActivation?: boolean;
  canEditOnClick?: () => boolean;
  className?: string;
};

type EditableCellProps = {
  html: string;
  row: number;
  column: number;
  header: boolean;
  menuOpen: boolean;
  onActivate: (element: HTMLTableCellElement, row: number, column: number) => void;
  onLeaveInnerCell: () => void;
  onCommit: (element: HTMLTableCellElement, row: number, column: number) => void;
  onInput?: () => void;
  onTextSelection?: (element: HTMLElement, row: number, column: number) => void;
  useFloatingEditor: boolean;
  floatingBackground: string;
  requireActivation: boolean;
  canEditOnClick?: () => boolean;
};

type FloatingCellState = {
  top: number;
  left: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  color: string;
  font: string;
  lineHeight: string;
  padding: string;
};

function EditableCell({
  html,
  row,
  column,
  header,
  menuOpen,
  onActivate,
  onLeaveInnerCell,
  onCommit,
  onInput,
  onTextSelection,
  useFloatingEditor,
  floatingBackground,
  requireActivation,
  canEditOnClick,
}: EditableCellProps) {
  const ref = useRef<HTMLTableCellElement | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const editingHtmlRef = useRef(html);
  const composingRef = useRef(false);
  const [floatingEditor, setFloatingEditor] = useState<FloatingCellState | null>(null);
  const [isEditing, setIsEditing] = useState(!requireActivation);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || document.activeElement === element || element.innerHTML === html) return;
    element.innerHTML = html;
  }, [html]);

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

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    const nativeEvent = event.nativeEvent;
    const isComposing = composingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229;
    if (event.key === 'Enter' && !isComposing) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  const openFloatingEditor = (element: HTMLTableCellElement) => {
    if (!useFloatingEditor || floatingEditor) return;
    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);
    editingHtmlRef.current = element.innerHTML;
    setFloatingEditor({
      top: rect.top,
      left: rect.left,
      minWidth: rect.width,
      minHeight: rect.height,
      maxWidth: Number.isFinite(Number.parseFloat(computed.maxWidth))
        ? Number.parseFloat(computed.maxWidth)
        : 500,
      color: computed.color,
      font: computed.font,
      lineHeight: computed.lineHeight,
      padding: computed.padding,
    });
  };
  const closeFloatingEditor = (htmlValue: string) => {
    editingHtmlRef.current = htmlValue;
    const cell = ref.current;
    if (!cell) return;
    cell.innerHTML = htmlValue;
    setFloatingEditor(null);
    setIsEditing(!requireActivation);
    onCommit(cell, row, column);
  };
  const beginEdit = (element: HTMLTableCellElement, force = false) => {
    if (requireActivation && !force && !canEditOnClick?.()) return;
    setIsEditing(true);
    window.requestAnimationFrame(() => element.focus({ preventScroll: true }));
  };

  const Cell = header ? 'th' : 'td';
  return (
    <Cell
      ref={ref}
      scope={header ? 'col' : undefined}
      className={requireActivation && !isEditing ? 'is-readonly' : undefined}
      contentEditable={!requireActivation || isEditing}
      suppressContentEditableWarning
      tabIndex={!requireActivation || isEditing ? 0 : -1}
      aria-label={`第 ${row + 1} 行，第 ${column + 1} 列`}
      style={floatingEditor ? { visibility: 'hidden' } : undefined}
      onMouseEnter={(event) => {
        if (header || column === 0) onActivate(event.currentTarget, row, column);
        else if (!menuOpen) onLeaveInnerCell();
      }}
      onFocus={(event) => {
        if (requireActivation && !isEditing) return;
        onActivate(event.currentTarget, row, column);
        openFloatingEditor(event.currentTarget);
      }}
      onMouseDown={(event) => { if (isEditing) event.stopPropagation(); }}
      onClick={(event) => {
        event.stopPropagation();
        if (!isEditing) beginEdit(event.currentTarget);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (!isEditing) beginEdit(event.currentTarget, true);
      }}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; }}
      onKeyDown={handleKeyDown}
      onInput={onInput}
      onPointerUp={(event) => onTextSelection?.(event.currentTarget, row, column)}
      onKeyUp={(event) => onTextSelection?.(event.currentTarget, row, column)}
      onPaste={(event) => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
      }}
      onBlur={(event) => {
        if (useFloatingEditor) return;
        const nextTarget = event.relatedTarget as Element | null;
        if (nextTarget?.closest('.editor-floating-toolbar, .toolbar-color-menu, .arco-trigger-popup, .arco-color-picker')) return;
        setIsEditing(!requireActivation);
        onCommit(event.currentTarget, row, column);
      }}
    >
      {floatingEditor && createPortal(
        <div
          ref={floatingRef}
          className="editable-table-floating-editor mind-map-floating-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={`第 ${row + 1} 行，第 ${column + 1} 列`}
          style={{
            position: 'fixed',
            top: floatingEditor.top,
            left: floatingEditor.left,
            zIndex: 3000,
            boxSizing: 'border-box',
            width: 'max-content',
            minWidth: floatingEditor.minWidth,
            maxWidth: floatingEditor.maxWidth,
            minHeight: floatingEditor.minHeight,
            padding: floatingEditor.padding,
            border: '1px solid rgb(var(--primary-6))',
            outline: 'none',
            background: floatingBackground,
            boxShadow: '0 8px 24px rgba(0, 0, 0, .14)',
            color: floatingEditor.color,
            font: floatingEditor.font,
            lineHeight: floatingEditor.lineHeight,
            textAlign: 'left',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={handleKeyDown}
          onPointerUp={(event) => onTextSelection?.(event.currentTarget, row, column)}
          onKeyUp={(event) => onTextSelection?.(event.currentTarget, row, column)}
          onPaste={(event) => {
            event.preventDefault();
            document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
          }}
          onBlur={(event) => closeFloatingEditor(event.currentTarget.innerHTML)}
        />,
        document.body,
      )}
    </Cell>
  );
}

function normalize(cells: string[][]): EditableTableData {
  return {
    rows: cells.length,
    columns: cells[0]?.length ?? 0,
    cells,
  };
}

export default function EditableNodeTable({
  value,
  onChange,
  onDelete,
  onInput,
  onTextSelection,
  useFloatingEditor = false,
  floatingBackground = '#fff',
  requireActivation = false,
  canEditOnClick,
  className = '',
}: Props) {
  const [hoveredCell, setHoveredCell] = useState<CellPosition | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeCellRef = useRef<(CellPosition & { element: HTMLTableCellElement }) | null>(null);

  const setHoveredFromCell = (element: HTMLTableCellElement, row: number, column: number) => {
    const container = containerRef.current;
    if (!container) return;
    const cellRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setHoveredCell({
      row,
      column,
      left: cellRect.left - containerRect.left + cellRect.width / 2,
      top: cellRect.top - containerRect.top + cellRect.height / 2,
    });
  };

  const update = (mutate: (cells: string[][]) => void) => {
    const cells = value.cells.map((row) => [...row]);
    const activeCell = activeCellRef.current;
    if (activeCell?.element.isConnected && cells[activeCell.row]?.[activeCell.column] !== undefined) {
      cells[activeCell.row][activeCell.column] = activeCell.element.innerHTML;
    }
    mutate(cells);
    onChange(normalize(cells));
  };

  const row = hoveredCell?.row ?? 0;
  const column = hoveredCell?.column ?? 0;
  const columnMenu = (
    <Menu onClickMenuItem={(action) => {
      if (action === 'before') update((cells) => cells.forEach((item) => item.splice(column, 0, '')));
      if (action === 'after') update((cells) => cells.forEach((item) => item.splice(column + 1, 0, '')));
      if (action === 'delete') update((cells) => cells.forEach((item) => item.splice(column, 1)));
    }}>
      <Menu.Item key="before"><IconPlus /> 在前面插入列</Menu.Item>
      <Menu.Item key="after"><IconPlus /> 在后面插入列</Menu.Item>
      <Menu.Item key="delete" disabled={value.columns <= 1} className="editable-table-danger-item"><IconDelete /> 删除当前列</Menu.Item>
    </Menu>
  );
  const rowMenu = (
    <Menu onClickMenuItem={(action) => {
      if (action === 'before') update((cells) => cells.splice(row, 0, Array(value.columns).fill('')));
      if (action === 'after') update((cells) => cells.splice(row + 1, 0, Array(value.columns).fill('')));
      if (action === 'delete') update((cells) => cells.splice(row, 1));
    }}>
      <Menu.Item key="before"><IconPlus /> 在上方插入行</Menu.Item>
      <Menu.Item key="after"><IconPlus /> 在下方插入行</Menu.Item>
      <Menu.Item key="delete" disabled={value.rows <= 1} className="editable-table-danger-item"><IconDelete /> 删除当前行</Menu.Item>
    </Menu>
  );

  return (
    <div
      ref={containerRef}
      className={`editable-node-table ${className}`.trim()}
      onMouseLeave={() => {
        if (!menuOpen) setHoveredCell(null);
      }}
    >
      <table>
        <tbody>
          {value.cells.map((cells, rowIndex) => (
            <tr key={rowIndex}>
              {cells.map((cell, columnIndex) => (
                <EditableCell
                  key={columnIndex}
                  html={cell}
                  row={rowIndex}
                  column={columnIndex}
                  header={rowIndex === 0}
                  menuOpen={menuOpen}
                  onActivate={(element, activeRow, activeColumn) => {
                    activeCellRef.current = { row: activeRow, column: activeColumn, left: 0, top: 0, element };
                    if (activeRow === 0 || activeColumn === 0) setHoveredFromCell(element, activeRow, activeColumn);
                    else if (!menuOpen) setHoveredCell(null);
                  }}
                  onLeaveInnerCell={() => setHoveredCell(null)}
                  onCommit={(element, commitRow, commitColumn) => {
                    update((nextCells) => {
                      nextCells[commitRow][commitColumn] = element.innerHTML;
                    });
                  }}
                  onInput={onInput}
                  onTextSelection={onTextSelection}
                  useFloatingEditor={useFloatingEditor}
                  floatingBackground={floatingBackground}
                  requireActivation={requireActivation}
                  canEditOnClick={canEditOnClick}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {onDelete && (
        <Tooltip content="删除表格">
          <Button
            className="editable-table-delete"
            type="text"
            status="danger"
            size="mini"
            aria-label="删除表格"
            icon={<IconDelete />}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          />
        </Tooltip>
      )}

      {hoveredCell && (
        <>
          {row === 0 && <Dropdown trigger="click" droplist={columnMenu} position="bl" onVisibleChange={(visible) => {
            setMenuOpen(visible);
            if (!visible) setHoveredCell(null);
          }}>
            <Button
              className="editable-table-column-menu"
              type="secondary"
              size="mini"
              aria-label={`第 ${column + 1} 列操作`}
              icon={<IconMore />}
              style={{ left: hoveredCell.left }}
            />
          </Dropdown>}
          {column === 0 && <Dropdown trigger="click" droplist={rowMenu} position="bl" onVisibleChange={(visible) => {
            setMenuOpen(visible);
            if (!visible) setHoveredCell(null);
          }}>
            <Button
              className="editable-table-row-menu"
              type="secondary"
              size="mini"
              aria-label={`第 ${row + 1} 行操作`}
              icon={<IconMore />}
              style={{ top: hoveredCell.top }}
            />
          </Dropdown>}
        </>
      )}
    </div>
  );
}
