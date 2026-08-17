import { useMemo, useState } from 'react';
import { Avatar } from '@humation/react';
import { humation1 } from '@humation/assets-humation-1';
import { createPartPreview, getPartsForSlot } from '@humation/core';
import {
  Avatar as ArcoAvatar,
  Button,
  Card,
  ColorPicker,
  Grid,
  Image,
  Modal,
  Space,
  Tabs,
  Typography,
} from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import type { AvatarState } from './types';

const { Row, Col } = Grid;
const TabPane = Tabs.TabPane;

const slotNames: Record<string, string> = {
  head: '发型', body: '上装', bottom: '下装', item: '配饰', glasses: '眼镜',
};
const colorNames: Record<string, string> = {
  background: '背景', stroke: '线条', hair: '发色', skin: '肤色', clothes: '上装', bottom: '下装',
};
const presetColors = ['#171719', '#4A3728', '#795548', '#F4C9A8', '#FFE4C7', '#FFFFFF', '#5B5BD6', '#6B8E6B', '#E89462', '#F2C94C'];

type Props = {
  visible: boolean;
  value: AvatarState;
  onCancel: () => void;
  onSave: (value: AvatarState) => void;
};

export default function AvatarStudio({ visible, value, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState(value);

  const partGroups = useMemo(
    () => humation1.selectionSlots.map((slot) => ({ ...slot, parts: getPartsForSlot(humation1, slot.id) })),
    [],
  );

  const resetDraft = () => setDraft(value);
  const randomize = () => setDraft({ seed: crypto.randomUUID(), selections: {}, colors: draft.colors });

  return (
    <Modal
      className="avatar-studio-modal"
      title="设计我的头像"
      visible={visible}
      onCancel={() => { resetDraft(); onCancel(); }}
      onOk={() => onSave(draft)}
      okText="保存头像"
      cancelText="取消"
      autoFocus={false}
      focusLock
      style={{ width: 780 }}
    >
      <Row className="avatar-studio" gutter={[28, 24]}>
        <Col xs={24} md={9}>
        <Card className="avatar-preview-panel" bordered={false}>
          <Space direction="vertical" size={16} align="center" style={{ width: '100%' }}>
          <span className="eyebrow">实时预览</span>
          <ArcoAvatar className="avatar-preview-orbit" shape="square" size={224} autoFixFontSize={false}>
            <Avatar
              assets={humation1}
              seed={draft.seed}
              selections={draft.selections}
              colors={draft.colors}
              size={224}
              title="我的 Humation 头像预览"
            />
          </ArcoAvatar>
          <Typography.Text type="secondary">本地生成，不上传照片</Typography.Text>
          <Button icon={<IconRefresh />} onClick={randomize}>换一个灵感</Button>
          </Space>
        </Card>
        </Col>

        <Col xs={24} md={15} className="avatar-controls">
          <Tabs defaultActiveTab="head" type="rounded">
            {partGroups.map(({ id, parts }) => (
              <TabPane key={id} title={slotNames[id] ?? id}>
                <Row className="part-grid" gutter={[10, 10]}>
                  {parts.map((part) => {
                    const selected = draft.selections[id] === (part.name ?? part.id);
                    const preview = createPartPreview(humation1, part, { colors: draft.colors }).toDataUri();
                    return (
                      <Col span={6} key={part.id}>
                      <Card
                        hoverable
                        className={`part-option ${selected ? 'is-selected' : ''}`}
                        onClick={() => setDraft((current) => ({
                          ...current,
                          selections: { ...current.selections, [id]: part.name ?? part.id },
                        }))}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setDraft((current) => ({
                              ...current,
                              selections: { ...current.selections, [id]: part.name ?? part.id },
                            }));
                          }
                        }}
                        aria-label={`选择 ${part.name ?? part.id}`}
                        bodyStyle={{ padding: 0, height: '100%' }}
                      >
                        <Image src={preview} alt="" preview={false} width="100%" height="100%" />
                      </Card>
                      </Col>
                    );
                  })}
                </Row>
              </TabPane>
            ))}
            <TabPane key="colors" title="颜色">
              <Row gutter={[16, 18]} className="color-grid">
                {humation1.colors.map((color) => (
                  <Col span={12} key={color.id}>
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Typography.Text>{colorNames[color.id] ?? color.label}</Typography.Text>
                      <ColorPicker
                        value={`#${(draft.colors[color.id] ?? color.default).replace('#', '')}`}
                        showText
                        showPreset
                        presetColors={presetColors}
                        onChange={(next) => typeof next === 'string' && setDraft((current) => ({
                          ...current,
                          colors: { ...current.colors, [color.id]: next },
                        }))}
                      />
                    </Space>
                  </Col>
                ))}
              </Row>
            </TabPane>
          </Tabs>
        </Col>
      </Row>
    </Modal>
  );
}
