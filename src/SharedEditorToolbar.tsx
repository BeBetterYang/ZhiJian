import { useState, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import { Button, ColorPicker, Divider, Popover, Space, Tooltip, Upload } from '@arco-design/web-react';
import {
  IconApps,
  IconBgColors,
  IconBold,
  IconCheckSquare,
  IconDelete,
  IconFileImage,
  IconFontColors,
  IconInfoCircle,
  IconItalic,
  IconPalette,
  IconPen,
  IconStrikethrough,
  IconUnderline,
} from '@arco-design/web-react/icon';

export type EditorFormat = 'bold' | 'italic' | 'underline' | 'strike';
export type EditorFormatState = Partial<Record<EditorFormat, boolean>>;
export type EditorTool = 'image' | 'todo' | 'annotation' | 'description' | 'table';
export type EditorToolState = Partial<Record<EditorTool, boolean>>;
export type ToolbarPlacement = 'above' | 'below';

const presetTextColors = ['#ED1C24', '#F2B01E', '#45B649', '#22A39F', '#5473AB', '#7E6DA8', '#E6E6E6', '#303236'];
const presetBackgroundColors = ['#B9B91D', '#BA7072', '#858A91', '#86AD6D', '#6BA4B8', '#A36FB2', '#6BB593', 'transparent'];

type ColorMenuKey = 'text' | 'background';

type Props = {
  placement: ToolbarPlacement;
  style: CSSProperties;
  activeFormats?: EditorFormatState;
  activeTools?: EditorToolState;
  textColor?: string;
  backgroundColor?: string;
  textColorActive?: boolean;
  backgroundColorActive?: boolean;
  onFormat: (format: EditorFormat) => void;
  onTextColor: (color: string) => void;
  onBackgroundColor: (color: string) => void;
  onImage?: (file: File) => boolean | Promise<boolean>;
  onTodo?: () => void;
  onDescription?: () => void;
  onAnnotation?: () => void;
  onTable?: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  extraActions?: ReactNode;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
};

type ColorMenuProps = {
  menu: ColorMenuKey;
  label: string;
  value: string;
  active: boolean;
  colors: string[];
  icon: ReactNode;
  open: boolean;
  customPickerOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCustomPickerVisibleChange: (visible: boolean) => void;
  onChange: (color: string) => void;
};

function ColorMenu({
  menu,
  label,
  value,
  active,
  colors,
  icon,
  open,
  customPickerOpen,
  onOpen,
  onClose,
  onCustomPickerVisibleChange,
  onChange,
}: ColorMenuProps) {
  return (
    <Popover
      trigger="click"
      position="top"
      triggerProps={{ popupStyle: { zIndex: 12000, padding: 0, background: '#303136', border: '1px solid #45464c' } }}
      popupVisible={open}
      onVisibleChange={(visible) => {
        if (visible) onOpen();
        else if (!customPickerOpen) onClose();
      }}
      content={
        <div className="toolbar-color-menu" onMouseDown={(event) => event.preventDefault()}>
          <div className="toolbar-color-presets">
            {colors.map((color) => (
              <Button
                key={color}
                aria-label={`${label} ${color}`}
                aria-pressed={value.toLowerCase() === color.toLowerCase()}
                className={`toolbar-color-swatch${value.toLowerCase() === color.toLowerCase() ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(color);
                  onClose();
                }}
              >
                <span className="toolbar-color-swatch-dot" style={{ backgroundColor: color }} />
              </Button>
            ))}
          </div>
          <ColorPicker
            size="mini"
            showText={false}
            value={value}
            triggerProps={{ popupStyle: { zIndex: 12001 } }}
            popupVisible={customPickerOpen}
            onVisibleChange={onCustomPickerVisibleChange}
            onChange={(color) => typeof color === 'string' && onChange(color)}
            triggerElement={(
              <Button
                type="text"
                className="toolbar-custom-color-trigger"
                aria-label="打开调色板"
                title="更多颜色"
                icon={<IconPalette />}
              />
            )}
          />
        </div>
      }
    >
      <Button
        type="text"
        size="large"
        className={`toolbar-color-button is-${menu}-color${active ? ' is-active' : ''}`}
        aria-label={label}
        aria-pressed={active}
        title={label}
        style={{ '--toolbar-current-color': value } as CSSProperties}
        icon={icon}
      />
    </Popover>
  );
}

export default function SharedEditorToolbar({
  placement,
  style,
  activeFormats = {},
  activeTools = {},
  textColor = '#1D2129',
  backgroundColor = '#FFFFFF',
  textColorActive = false,
  backgroundColorActive = false,
  onFormat,
  onTextColor,
  onBackgroundColor,
  onImage,
  onTodo,
  onDescription,
  onAnnotation,
  onTable,
  onDelete,
  deleteDisabled = false,
  extraActions,
  onMouseDown,
}: Props) {
  const [openColorMenu, setOpenColorMenu] = useState<ColorMenuKey | null>(null);
  const [openCustomPicker, setOpenCustomPicker] = useState<ColorMenuKey | null>(null);

  const closeColorMenus = () => {
    setOpenColorMenu(null);
    setOpenCustomPicker(null);
  };
  const openMenu = (menu: ColorMenuKey) => {
    setOpenColorMenu(menu);
    setOpenCustomPicker(null);
  };
  const closeMenu = (menu: ColorMenuKey) => {
    setOpenColorMenu((current) => current === menu ? null : current);
    setOpenCustomPicker((current) => current === menu ? null : current);
  };
  const runAction = (action: () => void) => {
    closeColorMenus();
    action();
  };

  return (
    <div
      className={`editor-floating-toolbar is-${placement}`}
      style={style}
      onMouseDown={(event) => {
        event.stopPropagation();
        onMouseDown?.(event);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (onMouseDown) event.preventDefault();
      }}
    >
      <Space size={0} wrap={false}>
        <Tooltip content="加粗"><Button type="text" size="large" aria-label="加粗" aria-pressed={Boolean(activeFormats.bold)} className={activeFormats.bold ? 'is-active' : undefined} icon={<IconBold />} onClick={() => runAction(() => onFormat('bold'))} /></Tooltip>
        <Tooltip content="斜体"><Button type="text" size="large" aria-label="斜体" aria-pressed={Boolean(activeFormats.italic)} className={activeFormats.italic ? 'is-active' : undefined} icon={<IconItalic />} onClick={() => runAction(() => onFormat('italic'))} /></Tooltip>
        <Tooltip content="下划线"><Button type="text" size="large" aria-label="下划线" aria-pressed={Boolean(activeFormats.underline)} className={activeFormats.underline ? 'is-active' : undefined} icon={<IconUnderline />} onClick={() => runAction(() => onFormat('underline'))} /></Tooltip>
        <Tooltip content="删除线"><Button type="text" size="large" aria-label="删除线" aria-pressed={Boolean(activeFormats.strike)} className={activeFormats.strike ? 'is-active' : undefined} icon={<IconStrikethrough />} onClick={() => runAction(() => onFormat('strike'))} /></Tooltip>
        <ColorMenu
          menu="text"
          label="文字颜色"
          value={textColor}
          active={textColorActive}
          colors={presetTextColors}
          icon={<IconFontColors />}
          open={openColorMenu === 'text'}
          customPickerOpen={openCustomPicker === 'text'}
          onOpen={() => openMenu('text')}
          onClose={() => closeMenu('text')}
          onCustomPickerVisibleChange={(visible) => {
            setOpenCustomPicker(visible ? 'text' : null);
            if (!visible) closeMenu('text');
          }}
          onChange={onTextColor}
        />
        <ColorMenu
          menu="background"
          label="背景颜色"
          value={backgroundColor}
          active={backgroundColorActive}
          colors={presetBackgroundColors}
          icon={<IconBgColors />}
          open={openColorMenu === 'background'}
          customPickerOpen={openCustomPicker === 'background'}
          onOpen={() => openMenu('background')}
          onClose={() => closeMenu('background')}
          onCustomPickerVisibleChange={(visible) => {
            setOpenCustomPicker(visible ? 'background' : null);
            if (!visible) closeMenu('background');
          }}
          onChange={onBackgroundColor}
        />
        <Divider type="vertical" />
        {onImage && <Upload accept="image/*" multiple showUploadList={false} beforeUpload={onImage}><Button type="text" size="large" aria-label="图片" aria-pressed={Boolean(activeTools.image)} className={activeTools.image ? 'is-active' : undefined} title="图片" icon={<IconFileImage />} /></Upload>}
        {onTodo && <Button type="text" size="large" aria-label="待办" aria-pressed={Boolean(activeTools.todo)} className={activeTools.todo ? 'is-active' : undefined} title="待办" icon={<IconCheckSquare />} onClick={() => runAction(onTodo)} />}
        {extraActions}
        {onAnnotation && <Button type="text" size="large" aria-label="批注" aria-pressed={Boolean(activeTools.annotation)} className={activeTools.annotation ? 'is-active' : undefined} title="批注" icon={<IconPen />} onClick={() => runAction(onAnnotation)} />}
        {onDescription && <Button type="text" size="large" aria-label="节点描述" aria-pressed={Boolean(activeTools.description)} className={activeTools.description ? 'is-active' : undefined} title="节点描述" icon={<IconInfoCircle />} onClick={() => runAction(onDescription)} />}
        {onTable && <Button type="text" size="large" aria-label="表格" aria-pressed={Boolean(activeTools.table)} className={activeTools.table ? 'is-active' : undefined} title="表格" icon={<IconApps />} onClick={() => runAction(onTable)} />}
        {onDelete && <><Divider type="vertical" /><Button type="text" status="danger" size="large" aria-label="删除" title="删除" disabled={deleteDisabled} icon={<IconDelete />} onClick={() => runAction(onDelete)} /></>}
      </Space>
    </div>
  );
}
