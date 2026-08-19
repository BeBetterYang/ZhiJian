import type { ZhiJianDocument } from './features/editor/core';
import { parseMarkdown } from './features/editor/markdown';

export const TUTORIAL_FOLDER_ID = 'getting-started';
export const TUTORIAL_MAP_ID = 'zhijian-guide';

export const tutorialLibrary = {
  folders: [{ id: TUTORIAL_FOLDER_ID, title: '新手教程', parentId: null }],
  maps: [{ id: TUTORIAL_MAP_ID, title: '枝间功能教程', folderId: TUTORIAL_FOLDER_ID, time: '刚刚', starred: true }],
};

const TUTORIAL_MARKDOWN = `# 枝间功能教程

> 欢迎使用枝间！这份教程会带你认识核心功能，随意编辑和试验吧。

## 从这里开始
- 单击一个节点即可编辑正文
- 按 Enter 完成并新建同级节点
- 按 Shift + Enter 为节点添加描述
  > 描述是独立字段，可以写多行，适合记录背景、来源或结论。

## 导图与大纲
- 顶部可以在导图视图和大纲视图之间切换
- 两个视图共享同一份内容，没有同步延迟
- 支持导入 / 导出 Markdown

## 任务清单
- [ ] 这是一个待办事项
- [x] 已完成的待办会显示对勾
- 正文前输入方括号即可创建待办

## 表格
- 节点下方可以插入表格整理结构化信息
  | 功能 | 用途 |
  | --- | --- |
  | 表格 | 整理结构化信息 |
  | 大纲 | 快速梳理层级 |
`;

export function createTutorialDocument(options: { id?: string; now?: number } = {}): ZhiJianDocument {
  return parseMarkdown(TUTORIAL_MARKDOWN, {
    documentId: options.id ?? TUTORIAL_MAP_ID,
    now: options.now,
  });
}
