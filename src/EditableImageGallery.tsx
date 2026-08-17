import { useState, type CSSProperties } from 'react';
import { Button, Image, Tooltip } from '@arco-design/web-react';
import { IconDelete } from '@arco-design/web-react/icon';

export type EditableImageData = {
  url: string;
  title?: string;
  width?: number;
  height?: number;
};

type Props = {
  images: EditableImageData[];
  width: number;
  height: number;
  className: string;
  style?: CSSProperties;
  itemClassName?: string;
  onRemove: (index: number) => void;
};

export default function EditableImageGallery({ images, width, height, className, style, itemClassName, onRemove }: Props) {
  const [visibleTooltipIndex, setVisibleTooltipIndex] = useState<number | null>(null);

  return (
    <Image.PreviewGroup infinite>
      <div className={className} style={style}>
        {images.map((image, index) => (
          <div className={`editable-node-image${itemClassName ? ` ${itemClassName}` : ''}`} key={`${image.url.slice(-32)}-${index}`}>
            <Image
              src={image.url}
              alt={image.title || `节点图片 ${index + 1}`}
              width={width}
              height={height}
              style={{ objectFit: 'cover' }}
            />
            <Tooltip
              content="删除图片"
              popupVisible={visibleTooltipIndex === index}
              onVisibleChange={(visible) => setVisibleTooltipIndex(visible ? index : null)}
            >
              <Button
                className="editable-node-image-delete"
                type="text"
                status="danger"
                size="mini"
                aria-label={`删除图片 ${index + 1}`}
                icon={<IconDelete />}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setVisibleTooltipIndex(null);
                  onRemove(index);
                }}
              />
            </Tooltip>
          </div>
        ))}
      </div>
    </Image.PreviewGroup>
  );
}
