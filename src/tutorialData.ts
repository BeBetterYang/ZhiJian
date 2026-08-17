export const TUTORIAL_FOLDER_ID = 'getting-started';
export const TUTORIAL_MAP_ID = 'zhijian-guide';

export const tutorialLibrary = {
  folders: [{ id: TUTORIAL_FOLDER_ID, title: '新手教程', parentId: null }],
  maps: [{ id: TUTORIAL_MAP_ID, title: '枝间功能教程', folderId: TUTORIAL_FOLDER_ID, time: '刚刚', starred: true }],
};

const node = (text: string, children: unknown[] = [], data: Record<string, unknown> = {}) => ({
  data: { text, richText: true, expand: true, ...data },
  children,
});

export const tutorialMindMapData = {
  data: {
    text: '<p>枝间功能教程</p>',
    richText: true,
    expand: true,
    _layout: 'mindMap',
    _theme: 'pure',
    _backgroundColor: '#f8f7fc',
    _showNodeBorder: false,
    _nodeBorderShape: 'square',
    _lineStyle: 'rounded',
    note: '欢迎使用枝间。这张导图会带你快速认识核心功能，你可以放心编辑和试验。',
  },
  children: [
    node('<p><strong>1. 从这里开始</strong></p>', [
      node('<p>单击选择节点，再单击或双击编辑标题</p>', [], {
        _annotationEnabled: true,
        _annotation: '试试修改这段文字<br>Enter 完成，Shift + Enter 换行',
      }),
      node('<p>拖动节点可以调整位置或移动到其他节点下</p>'),
      node('<p>右键节点可新增、复制、删除和折叠主题</p>'),
    ]),
    node('<p><strong>2. 导图与大纲</strong></p>', [
      node('<p>顶部可在“导图”和“大纲”之间切换</p>'),
      node('<p>两种视图共享同一份内容，编辑会自动同步</p>'),
      node('<p>支持导入、导出 Markdown、JSON、PNG 和 SVG</p>'),
    ]),
    node('<p><strong>3. 样式与布局</strong></p>', [
      node('<p>可切换思维导图、逻辑图、组织架构图等布局</p>'),
      node('<p><span style="color:#165dff">文字颜色</span>、<span style="background-color:#fff3e8">文字背景</span>与字体样式都可调整</p>'),
      node('<p>主题、背景、边框和连接线均可自定义</p>'),
    ]),
    node('<p><strong>4. 任务与信息</strong></p>', [
      node('<p>这是一个待办节点</p>', [], {
        _todo: true,
        _todoChecked: false,
        _todoOriginalColor: '',
        _todoOriginalTextDecoration: 'none',
      }),
      node('<p>节点可以添加批注</p>', [], {
        _annotationEnabled: true,
        _annotation: '批注显示在标题下方，适合补充记忆点和解释。',
      }),
      node('<p>节点可以添加描述</p>', [], {
        note: '描述适合记录更长的背景、来源或结论。标题右侧的信息图标可以直接打开描述。',
      }),
      node('<p>可用概要归纳多个节点，也能连接不同节点</p>'),
    ]),
    node('<p><strong>5. 表格与图片</strong></p>', [
      node('<p>节点中可以插入可编辑表格</p>', [], {
        _table: {
          rows: 3,
          columns: 2,
          cells: [
            ['功能', '用途'],
            ['表格', '整理结构化信息'],
            ['图片', '补充视觉资料'],
          ],
        },
      }),
      node('<p>一个节点可上传多张图片并自动换行预览</p>'),
      node('<p>选中表格文字后，也可使用文字工具栏</p>'),
    ]),
    node('<p><strong>6. 整理你的空间</strong></p>', [
      node('<p>左侧可新建文件夹和导图，并拖动整理分类</p>'),
      node('<p>常用导图可以添加星标</p>', [], { _todo: true, _todoChecked: true, color: '#86909c', textDecoration: 'line-through' }),
      node('<p>内容会自动保存到服务器，下次登录继续编辑</p>'),
    ]),
  ],
  smmVersion: '0.14.0-fix.3',
};
