import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  Avatar as ArcoAvatar,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Grid,
  Input,
  Layout,
  Menu,
  Message,
  Modal,
  PageHeader,
  Popover,
  Radio,
  Select,
  Spin,
  Space,
  Tag,
  Tabs,
  Tooltip,
  Tree,
  Typography,
} from '@arco-design/web-react';
import { Avatar } from '@humation/react';
import { humation1 } from '@humation/assets-humation-1';
import {
  IconClockCircle, IconFile, IconFilter, IconFolder, IconFolderAdd,
  IconMenuFold, IconMenuUnfold, IconMindMapping,
  IconCopy, IconDelete, IconEdit, IconLaunch, IconMore, IconPlus,
  IconStar, IconStarFill, IconToRight,
} from '@arco-design/web-react/icon';
import AvatarStudio from './AvatarStudio';
import type { AvatarState, UserProfile } from './types';
import { TUTORIAL_FOLDER_ID, TUTORIAL_MAP_ID, tutorialLibrary } from './tutorialData';
import {
  deleteServerMap, loadServerJson, loginAccount, logoutAccount, registerAccount, saveServerJson,
  updateAccountPassword, updateAccountProfile,
} from './serverStorage';
import { getNodeContent, type ZhiJianDocument } from './features/editor/core';
import {
  getLocalDocumentStorageKey,
  loadLocalDocument,
  parsePersistedDocument,
} from './features/editor/persistence';

const EditorContainer = lazy(() => import('./features/editor/EditorContainer'));

const STORAGE_USER = 'mindflow-user';
const STORAGE_SESSION = 'mindflow-session';
const STORAGE_LIBRARY = 'mindflow-library';
const { Header, Content, Sider } = Layout;
const { Title, Paragraph, Text } = Typography;
const { Row, Col } = Grid;

const defaultAvatar: AvatarState = {
  seed: 'lin-zhijian',
  selections: {},
  colors: { background: '#F3F0FF', clothes: '#6D5CE7', hair: '#342B38', skin: '#F4C9A8' },
};

const defaultUser: UserProfile = { name: '枝间', email: 'demo@mindflow.cn', avatar: defaultAvatar, defaultViewMode: 'mindmap' };

function readUser(): UserProfile {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_USER) ?? '') as UserProfile;
    if (stored.name === '林知简') {
      const migrated = { ...stored, name: '吴高婷' };
      localStorage.setItem(STORAGE_USER, JSON.stringify(migrated));
      return migrated;
    }
    return stored;
  } catch {
    return defaultUser;
  }
}

function BrandMark() {
  return <Title heading={5} className="brand-mark">枝间</Title>;
}

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    document.title = `${mode === 'login' ? '登录' : '创建账号'} · 枝间`;
  }, [mode]);

  const completeAuth = (token: string, account: { id: string; username: string; phone: string; email: string }) => {
    localStorage.setItem(STORAGE_SESSION, token);
    localStorage.setItem(STORAGE_USER, JSON.stringify({
      id: account.id,
      name: account.username,
      phone: account.phone,
      email: account.email,
      avatar: { ...defaultAvatar, seed: account.username },
    }));
    navigate('/workspace');
  };

  const authErrorMessage = (error: unknown) => {
    const code = error instanceof Error ? error.message : 'SERVER_ERROR';
    const messages: Record<string, string> = {
      USERNAME_EXISTS: '该用户名已被使用',
      PHONE_EXISTS: '该手机号已被注册',
      EMAIL_EXISTS: '该邮箱已被注册',
      INVALID_CREDENTIALS: '账号或密码不正确',
      INVALID_USERNAME: '用户名需为 2–30 位中文、字母、数字、下划线或短横线',
      INVALID_PHONE: '请输入有效的 11 位手机号',
      INVALID_EMAIL: '请输入有效的邮箱地址',
      INVALID_PASSWORD: '密码长度需为 8–28 位',
      SERVER_ERROR: '服务暂时不可用，请稍后重试',
    };
    return messages[code] || messages.SERVER_ERROR;
  };

  const login = async (values: { account: string; password: string }) => {
    setLoading(true);
    try {
      const result = await loginAccount(values.account, values.password);
      completeAuth(result.token, result.user);
      Message.success('欢迎回来');
    } catch (error) {
      Message.error(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const register = async (values: { username: string; phone: string; email: string; password: string }) => {
    setLoading(true);
    try {
      const result = await registerAccount(values.username, values.phone, values.email, values.password);
      completeAuth(result.token, result.user);
      Message.success('账号创建成功');
    } catch (error) {
      Message.error(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const enterDemo = () => {
    localStorage.setItem(STORAGE_SESSION, 'demo');
    localStorage.setItem(STORAGE_USER, JSON.stringify(defaultUser));
    localStorage.removeItem(`${STORAGE_LIBRARY}:demo`);
    navigate('/workspace');
    Message.success('已进入演示账号');
  };
  return (
    <main className="login-page">
      <section className="login-story">
        <BrandMark />
        <Space className="story-copy" direction="vertical" size={20} align="start">
          <Tag color="arcoblue" bordered>让思考自然生长</Tag>
          <Title heading={1}>让想法开出花</Title>
          <Paragraph>从一次灵感，到一张完整的知识地图。枝间帮你安静地整理思路，并随时回到重要的节点。</Paragraph>
        </Space>
        <div className="story-map" aria-hidden="true">
          <span className="map-node node-core">新项目</span>
          <span className="map-node node-a">用户研究</span>
          <span className="map-node node-b">产品策略</span>
          <span className="map-node node-c">灵感记录</span>
          <span className="map-line line-a" /><span className="map-line line-b" /><span className="map-line line-c" />
        </div>
        <div className="story-foot">专注 · 清晰 · 自由生长</div>
      </section>

      <section className="login-panel">
        <div className="mobile-brand"><BrandMark /></div>
        <Card className="login-card" bordered={false}>
          <Space className="login-heading" direction="vertical" size={4} align="start">
            <span className="eyebrow">{mode === 'login' ? '欢迎回来' : '开始使用枝间'}</span>
            <Typography.Title heading={2}>{mode === 'login' ? '登录枝间' : '创建账号'}</Typography.Title>
            <Typography.Paragraph type="secondary">
              {mode === 'login' ? '使用注册邮箱登录。' : '填写以下信息，建立你的知识空间。'}
            </Typography.Paragraph>
          </Space>
          {mode === 'login' ? (
            <Form key="login" layout="vertical" onSubmit={login}>
              <Form.Item label="邮箱" field="account" rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' },
              ]}>
                <Input size="large" placeholder="请输入邮箱" allowClear autoComplete="email" />
              </Form.Item>
              <Form.Item label="密码" field="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password size="large" placeholder="请输入密码" autoComplete="current-password" />
              </Form.Item>
              <Space className="form-assist" size={12}>
                <Checkbox defaultChecked>保持登录</Checkbox>
                <Button type="text" size="small">忘记密码？</Button>
              </Space>
              <Button htmlType="submit" type="primary" size="large" long loading={loading}>登录</Button>
            </Form>
          ) : (
            <Form key="register" layout="vertical" onSubmit={register}>
              <Form.Item label="邮箱" field="email" rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' },
              ]}>
                <Input size="large" placeholder="name@example.com" allowClear autoComplete="email" />
              </Form.Item>
              <Form.Item label="用户名" field="username" rules={[
                { required: true, message: '请输入用户名' },
                { match: /^[\p{L}\p{N}_-]{2,30}$/u, message: '用户名需为 2–30 位中文、字母、数字、下划线或短横线' },
              ]}>
                <Input size="large" placeholder="2–30 个字符" allowClear autoComplete="username" />
              </Form.Item>
              <Form.Item label="手机号" field="phone" rules={[
                { required: true, message: '请输入手机号' },
                { match: /^1[3-9]\d{9}$/, message: '请输入有效的 11 位手机号' },
              ]}>
                <Input size="large" placeholder="请输入手机号" allowClear maxLength={11} autoComplete="tel" />
              </Form.Item>
              <Form.Item label="密码" field="password" rules={[
                { required: true, message: '请输入密码' },
                { minLength: 8, message: '密码至少需要 8 位' },
              ]}>
                <Input.Password size="large" placeholder="至少 8 位" autoComplete="new-password" />
              </Form.Item>
              <Button htmlType="submit" type="primary" size="large" long loading={loading}>创建并登录</Button>
            </Form>
          )}
          {mode === 'login' && <>
            <Divider className="login-divider">或</Divider>
            <Button size="large" long className="guest-button" onClick={enterDemo}>使用演示账号进入</Button>
          </>}
          <Paragraph className="signup-hint">
            {mode === 'login' ? '还没有账号？' : '已有账号？'}{' '}
            <Button type="text" size="small" disabled={loading} onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? '创建账号' : '返回登录'}
            </Button>
          </Paragraph>
        </Card>
        <Text className="legal" type="secondary">登录即代表你同意《服务条款》和《隐私政策》</Text>
      </section>
    </main>
  );
}type AccountSettingsProps = {
  visible: boolean;
  user: UserProfile;
  onClose: () => void;
  onUserChange: (user: UserProfile) => void;
};

function accountErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : 'SERVER_ERROR';
  const messages: Record<string, string> = {
    USERNAME_EXISTS: '该用户名已被使用',
    PHONE_EXISTS: '该手机号已被注册',
    EMAIL_EXISTS: '该邮箱已被注册',
    INVALID_USERNAME: '用户名需为 2–30 位中文、字母、数字、下划线或短横线',
    INVALID_PHONE: '请输入有效的 11 位手机号',
    INVALID_EMAIL: '请输入有效的邮箱地址',
    INVALID_PASSWORD: '新密码长度需为 8–128 位',
    CURRENT_PASSWORD_INCORRECT: '当前密码不正确',
    PASSWORD_UNCHANGED: '新密码不能与当前密码相同',
    UNAUTHORIZED: '登录状态已失效，请退出后重新登录',
    SERVER_ERROR: '服务暂时不可用，请稍后重试',
  };
  return messages[code] || messages.SERVER_ERROR;
}

function AccountSettings({ visible, user, onClose, onUserChange }: AccountSettingsProps) {
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const saveProfile = async (values: { username: string; phone: string; email: string }) => {
    setProfileLoading(true);
    try {
      const result = await updateAccountProfile(values.username, values.phone, values.email);
      const next = { ...user, id: result.user.id, name: result.user.username, phone: result.user.phone, email: result.user.email };
      localStorage.setItem(STORAGE_USER, JSON.stringify(next));
      onUserChange(next);
      Message.success('账户资料已更新');
    } catch (error) {
      Message.error(accountErrorMessage(error));
    } finally {
      setProfileLoading(false);
    }
  };

  const savePassword = async (values: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      Message.error('两次输入的新密码不一致');
      return;
    }
    setPasswordLoading(true);
    try {
      await updateAccountPassword(values.currentPassword, values.newPassword);
      Message.success('密码已更新，下次登录请使用新密码');
      onClose();
    } catch (error) {
      Message.error(accountErrorMessage(error));
    } finally {
      setPasswordLoading(false);
    }
  };

  const saveDefaultViewMode = (defaultViewMode: 'mindmap' | 'outline') => {
    const next = { ...user, defaultViewMode };
    localStorage.setItem(STORAGE_USER, JSON.stringify(next));
    onUserChange(next);
    Message.success('默认显示方式已保存');
  };

  return (
    <Modal
      className="account-settings-modal"
      title="账户设置"
      visible={visible}
      onCancel={onClose}
      footer={null}
      unmountOnExit
    >
      <Tabs defaultActiveTab="profile">
        <Tabs.TabPane key="profile" title="个人资料">
          <Form
            key={`${user.name}-${user.phone}-${user.email}`}
            layout="vertical"
            initialValues={{ username: user.name, phone: user.phone || '', email: user.email }}
            onSubmit={saveProfile}
          >
            <Form.Item label="用户名" field="username" rules={[
              { required: true, message: '请输入用户名' },
              { match: /^[\p{L}\p{N}_-]{2,30}$/u, message: '请输入 2–30 位中文、字母、数字、下划线或短横线' },
            ]}>
              <Input size="large" allowClear autoComplete="username" />
            </Form.Item>
            <Form.Item label="手机号" field="phone" rules={[
              { required: true, message: '请输入手机号' },
              { match: /^1[3-9]\d{9}$/, message: '请输入有效的 11 位手机号' },
            ]}>
              <Input size="large" allowClear maxLength={11} autoComplete="tel" />
            </Form.Item>
            <Form.Item label="邮箱" field="email" rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}>
              <Input size="large" allowClear autoComplete="email" />
            </Form.Item>
            <div className="account-settings-actions">
              <Button onClick={onClose}>取消</Button>
              <Button type="primary" htmlType="submit" loading={profileLoading}>保存修改</Button>
            </div>
          </Form>
        </Tabs.TabPane>
        <Tabs.TabPane key="password" title="修改密码">
          <Form layout="vertical" onSubmit={savePassword}>
            <Form.Item label="当前密码" field="currentPassword" rules={[{ required: true, message: '请输入当前密码' }]}>
              <Input.Password size="large" autoComplete="current-password" placeholder="请输入当前密码" />
            </Form.Item>
            <Form.Item label="新密码" field="newPassword" rules={[
              { required: true, message: '请输入新密码' },
              { minLength: 8, message: '新密码至少需要 8 位' },
            ]}>
              <Input.Password size="large" autoComplete="new-password" placeholder="至少 8 位" />
            </Form.Item>
            <Form.Item label="确认新密码" field="confirmPassword" rules={[{ required: true, message: '请再次输入新密码' }]}>
              <Input.Password size="large" autoComplete="new-password" placeholder="再次输入新密码" />
            </Form.Item>
            <div className="account-settings-actions">
              <Button onClick={onClose}>取消</Button>
              <Button type="primary" htmlType="submit" loading={passwordLoading}>更新密码</Button>
            </div>
          </Form>
        </Tabs.TabPane>
        <Tabs.TabPane key="preferences" title="个性化设置">
          <div className="account-preferences">
            <div>
              <strong>默认显示方式</strong>
              <p>新建导图时默认打开的编辑方式。</p>
            </div>
            <Radio.Group value={user.defaultViewMode ?? 'mindmap'} onChange={(value) => saveDefaultViewMode(value as 'mindmap' | 'outline')}>
              <Radio value="mindmap">导图</Radio>
              <Radio value="outline">大纲</Radio>
            </Radio.Group>
          </div>
        </Tabs.TabPane>
      </Tabs>
    </Modal>
  );
}

type LibraryFolder = { id: string; title: string; parentId?: string | null };
type LibraryMap = { id: string; title: string; folderId: string; time: string; starred?: boolean; defaultViewMode?: 'mindmap' | 'outline' };
type LibraryData = { folders: LibraryFolder[]; maps: LibraryMap[] };
type RenameTarget = { kind: 'folder' | 'map'; id: string; title: string };
type MapSearchHit = { path: string; text: string; nodeText: string };
type MapSearchResult = { kind: 'map'; mapId: string; title: string; folderId: string; hits: MapSearchHit[] };
type FolderSearchResult = { kind: 'folder'; folderId: string; title: string };
type SearchResult = FolderSearchResult | MapSearchResult;

const defaultLibrary: LibraryData = tutorialLibrary;

function normalizeLibrary(data: LibraryData): LibraryData {
  const folderIds = new Set(data.folders.map((folder) => folder.id));
  const folders = data.folders.map((folder) => ({
    ...folder,
    parentId: folder.parentId && folderIds.has(folder.parentId) && folder.parentId !== folder.id
      ? folder.parentId
      : null,
  }));
  const byId = Object.fromEntries(folders.map((folder) => [folder.id, folder]));
  folders.forEach((folder) => {
    const visited = new Set([folder.id]);
    let parentId = folder.parentId;
    let depth = 1;
    while (parentId) {
      if (visited.has(parentId) || depth >= 3) {
        folder.parentId = null;
        break;
      }
      visited.add(parentId);
      parentId = byId[parentId]?.parentId ?? null;
      depth += 1;
    }
  });
  const fallbackFolderId = folders[0]?.id ?? '';
  return {
    folders,
    maps: data.maps.map((map) => ({
      ...map,
      folderId: folderIds.has(map.folderId) ? map.folderId : fallbackFolderId,
    })),
  };
}

function libraryStorageKey(user: UserProfile) {
  return `${STORAGE_LIBRARY}:${user.id || 'demo'}`;
}

function readLibrary(user: UserProfile): LibraryData {
  try {
    const stored = JSON.parse(localStorage.getItem(libraryStorageKey(user)) ?? '') as LibraryData;
    return normalizeLibrary(stored?.folders && stored?.maps ? stored : defaultLibrary);
  } catch {
    return normalizeLibrary(defaultLibrary);
  }
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getTreeEventKey(node: unknown) {
  const candidate = node as { key?: unknown; props?: { _key?: unknown; eventKey?: unknown; dataRef?: { key?: unknown } } } | null;
  return String(candidate?.props?.dataRef?.key ?? candidate?.props?._key ?? candidate?.props?.eventKey ?? candidate?.key ?? '');
}

function reorderAround<T extends { id: string }>(items: T[], draggedId: string, targetId: string, after: boolean) {
  const dragged = items.find((item) => item.id === draggedId);
  if (!dragged) return items;
  const remaining = items.filter((item) => item.id !== draggedId);
  const targetIndex = remaining.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return items;
  remaining.splice(targetIndex + (after ? 1 : 0), 0, dragged);
  return remaining;
}

function getSearchText(value: unknown) {
  return String(value ?? '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSearchExcerpt(text: string, query: string) {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return text.slice(0, 108);
  const start = Math.max(0, index - 34);
  const end = Math.min(text.length, index + query.length + 72);
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
}

function collectDocumentSearchHits(document: ZhiJianDocument, query: string, nodeId = document.rootId, paths: string[] = [], hits: MapSearchHit[] = []) {
  const node = document.nodes[nodeId];
  if (!node) return hits;
  const textParts: unknown[] = [getNodeContent(node), node.kind === 'content' ? node.description : undefined];
  if (node.kind === 'table') node.table.rows.forEach((row) => row.forEach((cell) => textParts.push(cell)));
  const text = textParts.map(getSearchText).filter(Boolean).join(' ');
  const nodeText = getSearchText(getNodeContent(node));
  if (nodeId !== document.rootId && text.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
    hits.push({ path: paths.join(' > '), text: getSearchExcerpt(text, query), nodeText });
  }
  node.children.forEach((childId) => {
    const child = document.nodes[childId];
    collectDocumentSearchHits(document, query, childId, [...paths, (child ? getSearchText(getNodeContent(child)) : '') || childId], hits);
  });
  return hits;
}

function SearchHighlight({ text, query }: { text: string; query: string }) {
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return <>{parts.map((part, index) => (
    part.toLocaleLowerCase() === query.toLocaleLowerCase()
      ? <span key={index} className="global-search-match">{part}</span>
      : part
  ))}</>;
}

function LegacyEditorRedirect() {
  const { mapId } = useParams();
  return <Navigate to={`/workspace/${mapId ?? 'untitled'}`} replace />;
}

function WorkspacePage() {
  const navigate = useNavigate();
  const { mapId } = useParams();
  const [user, setUser] = useState(readUser);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchFolderIds, setSearchFolderIds] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [expandedSearchMaps, setExpandedSearchMaps] = useState<Set<string>>(new Set());
  const [searchFocus, setSearchFocus] = useState<{ mapId: string; nodeText: string } | null>(null);
  const [selected, setSelected] = useState(TUTORIAL_MAP_ID);
  const [library, setLibrary] = useState(() => readLibrary(user));
  const [expandedKeys, setExpandedKeys] = useState<string[]>(() => library.folders.map((folder) => folder.id));
  const initialLibraryRef = useRef(library);
  const [libraryHydrated, setLibraryHydrated] = useState(false);
  const [view, setView] = useState<'recent' | 'starred'>('recent');
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [targetParentFolderId, setTargetParentFolderId] = useState('');
  const [createMapModalOpen, setCreateMapModalOpen] = useState(false);
  const [mapName, setMapName] = useState('');
  const [targetFolderId, setTargetFolderId] = useState(TUTORIAL_FOLDER_ID);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<LibraryMap | null>(null);
  const [moveFolderId, setMoveFolderId] = useState('');
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [editorToolbarTarget, setEditorToolbarTarget] = useState<HTMLDivElement | null>(null);
  const captureEditorToolbar = useCallback((node: HTMLDivElement | null) => {
    setEditorToolbarTarget(node);
  }, []);
  const syncEditorTitle = useCallback((nextTitle: string) => {
    if (!mapId) return;
    setLibrary((current) => ({
      ...current,
      maps: current.maps.map((map) => map.id === mapId && map.title !== nextTitle
        ? { ...map, title: nextTitle, time: '刚刚' }
        : map),
    }));
  }, [mapId]);

  useEffect(() => { if (!localStorage.getItem(STORAGE_SESSION)) navigate('/login'); }, [navigate]);
  useEffect(() => {
    const openGlobalSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchPanelOpen(true);
      }
    };
    window.addEventListener('keydown', openGlobalSearch);
    return () => window.removeEventListener('keydown', openGlobalSearch);
  }, []);
  useEffect(() => {
    let active = true;
    loadServerJson<LibraryData>('/api/library').then((stored) => {
      if (!active) return;
      if (stored?.folders && stored?.maps) setLibrary(normalizeLibrary(stored));
      else void saveServerJson('/api/library', initialLibraryRef.current).catch(() => undefined);
      setLibraryHydrated(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    localStorage.setItem(libraryStorageKey(user), JSON.stringify(library));
    if (!libraryHydrated) return;
    const timer = window.setTimeout(() => {
      void saveServerJson('/api/library', library).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [library, libraryHydrated, user]);

  const activeMap = library.maps.find((item) => item.id === mapId);
  const activeFolder = activeMap ? library.folders.find((folder) => folder.id === activeMap.folderId) : undefined;

  useEffect(() => {
    document.title = mapId
      ? `${activeMap?.title ?? '未命名导图'} · 枝间`
      : `${view === 'starred' ? '星标导图' : '最近打开'} · 枝间`;
  }, [activeMap?.title, mapId, view]);

  const selectedTreeKey = mapId && activeMap ? activeMap.id : selected;
  const folderById = useMemo(() => Object.fromEntries(library.folders.map((folder) => [folder.id, folder.title])), [library.folders]);
  const folderDepth = useCallback((folderId: string) => {
    const byId = Object.fromEntries(library.folders.map((folder) => [folder.id, folder]));
    let depth = 1;
    let parentId = byId[folderId]?.parentId;
    const visited = new Set([folderId]);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      depth += 1;
      parentId = byId[parentId]?.parentId;
    }
    return depth;
  }, [library.folders]);
  const folderOptions = useMemo(() => library.folders.map((folder) => ({
    label: `${'　'.repeat(folderDepth(folder.id) - 1)}${folder.title}`,
    value: folder.id,
  })), [folderDepth, library.folders]);
  const treeData = useMemo(() => {
    const buildFolder = (folder: LibraryFolder): Record<string, unknown> => ({
      key: folder.id,
      title: folder.title,
      icon: <IconFolder />,
      nodeType: 'folder',
      children: [
        ...library.folders.filter((child) => child.parentId === folder.id).map(buildFolder),
        ...library.maps.filter((map) => map.folderId === folder.id).map((map) => ({
          key: map.id,
          title: map.title,
          icon: map.starred ? <IconStarFill className="file-tree-star-icon" /> : <IconMindMapping />,
          nodeType: 'map',
          isLeaf: true,
        })),
      ],
    });
    return library.folders.filter((folder) => !folder.parentId).map(buildFolder);
  }, [library]);

  useEffect(() => {
    const query = search.trim();
    if (!query) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      const folderResults: FolderSearchResult[] = library.folders
        .filter((folder) => (searchFolderIds.length === 0 || searchFolderIds.includes(folder.id))
          && folder.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .map((folder) => ({ kind: 'folder', folderId: folder.id, title: folder.title }));
      void Promise.all(library.maps
        .filter((map) => searchFolderIds.length === 0 || searchFolderIds.includes(map.folderId))
        .map(async (map) => {
          let content: ZhiJianDocument | null = null;
          try {
            const stored = loadLocalDocument(map.id);
            const serverValue = stored ? null : await loadServerJson<unknown>(`/api/maps/${encodeURIComponent(map.id)}`);
            content = stored ?? parsePersistedDocument(serverValue);
          } catch {
            content = await loadServerJson<unknown>(`/api/maps/${encodeURIComponent(map.id)}`)
              .then(parsePersistedDocument)
              .catch(() => null);
          }
          const hits = content ? collectDocumentSearchHits(content, query) : [];
          if (map.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
            hits.unshift({ path: '文件标题', text: `标题匹配：${map.title}`, nodeText: map.title });
          }
          if (hits.length === 0) return null;
          return { kind: 'map', mapId: map.id, title: map.title, folderId: map.folderId, hits } satisfies MapSearchResult;
        }))
        .then((results) => {
          if (!cancelled) setSearchResults([
            ...folderResults,
            ...results.filter((item): item is MapSearchResult => Boolean(item)),
          ]);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [library.folders, library.maps, search, searchFolderIds]);
  const visibleMaps = useMemo(() => library.maps.filter((map) => view === 'recent' || map.starred), [library.maps, view]);

  const addFolder = () => {
    const title = folderName.trim();
    if (!title) {
      Message.warning('请输入分类名称');
      return;
    }
    if (library.folders.some((folder) => folder.title === title)) {
      Message.warning('分类名称已存在');
      return;
    }
    if (targetParentFolderId && folderDepth(targetParentFolderId) >= 3) {
      Message.warning('文件夹最多支持 3 级');
      return;
    }
    const folder = { id: createId('folder'), title, parentId: targetParentFolderId || null };
    setLibrary((current) => ({ ...current, folders: [...current.folders, folder] }));
    if (folder.parentId) setExpandedKeys((current) => Array.from(new Set([...current, folder.parentId!])));
    setTargetFolderId(folder.id);
    setFolderName('');
    setTargetParentFolderId('');
    setFolderModalOpen(false);
    Message.success('分类已添加');
  };

  const openFolderModal = (parentId = '') => {
    setFolderName('');
    setTargetParentFolderId(parentId);
    setFolderModalOpen(true);
  };

  const addMap = () => {
    const title = mapName.trim();
    if (!title) {
      Message.warning('请输入导图名称');
      return;
    }
    if (!targetFolderId) {
      Message.warning('请先创建一个分类');
      return;
    }
    const map: LibraryMap = { id: createId('map'), title, folderId: targetFolderId || library.folders[0]?.id, time: '刚刚', defaultViewMode: user.defaultViewMode ?? 'mindmap' };
    setLibrary((current) => ({ ...current, maps: [map, ...current.maps] }));
    setExpandedKeys((current) => Array.from(new Set([...current, map.folderId])));
    setMapName('');
    setCreateMapModalOpen(false);
    navigate(`/workspace/${map.id}`);
    Message.success('导图已创建');
  };

  const toggleStar = (id: string) => setLibrary((current) => ({
    ...current,
    maps: current.maps.map((map) => map.id === id ? { ...map, starred: !map.starred } : map),
  }));

  const openRename = (target: RenameTarget) => {
    setRenameTarget(target);
    setRenameValue(target.title);
  };

  const renameItem = () => {
    const title = renameValue.trim();
    if (!renameTarget || !title) {
      Message.warning('请输入名称');
      return;
    }
    setLibrary((current) => renameTarget.kind === 'map'
      ? { ...current, maps: current.maps.map((map) => map.id === renameTarget.id ? { ...map, title } : map) }
      : { ...current, folders: current.folders.map((folder) => folder.id === renameTarget.id ? { ...folder, title } : folder) });
    setRenameTarget(null);
    Message.success('名称已更新');
  };

  const moveMap = () => {
    if (!moveTarget || !moveFolderId) return;
    setLibrary((current) => ({
      ...current,
      maps: current.maps.map((map) => map.id === moveTarget.id ? { ...map, folderId: moveFolderId, time: '刚刚' } : map),
    }));
    setMoveTarget(null);
    Message.success('导图已移动');
  };

  const isFolderDescendantOf = (folderId: string, possibleAncestorId: string) => {
    const byId = Object.fromEntries(library.folders.map((folder) => [folder.id, folder]));
    let currentId: string | null | undefined = folderId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      if (currentId === possibleAncestorId) return true;
      visited.add(currentId);
      currentId = byId[currentId]?.parentId;
    }
    return false;
  };

  const folderSubtreeHeight = (folderId: string): number => {
    const children = library.folders.filter((folder) => folder.parentId === folderId);
    return 1 + Math.max(0, ...children.map((folder) => folderSubtreeHeight(folder.id)));
  };

  const canDropTreeNode = (dragKey: string, dropKey: string, dropPosition: number) => {
    if (!dragKey || !dropKey || dragKey === dropKey) return false;
    const dragFolder = library.folders.find((folder) => folder.id === dragKey);
    const dropFolder = library.folders.find((folder) => folder.id === dropKey);
    const dragMap = library.maps.find((map) => map.id === dragKey);
    const dropMap = library.maps.find((map) => map.id === dropKey);
    if (dragMap) return Boolean((dropFolder && dropPosition === 0) || (dropMap && dropPosition !== 0));
    if (!dragFolder || !dropFolder || isFolderDescendantOf(dropFolder.id, dragFolder.id)) return false;
    const nextDepth = dropPosition === 0 ? folderDepth(dropFolder.id) + 1 : folderDepth(dropFolder.id);
    return nextDepth + folderSubtreeHeight(dragFolder.id) - 1 <= 3;
  };

  const handleTreeDrop = (dragKey: string, dropKey: string, dropPosition: number) => {
    if (!canDropTreeNode(dragKey, dropKey, dropPosition)) {
      Message.warning('不能移动到该位置，文件夹最多支持 3 级');
      return;
    }
    const dragMap = library.maps.find((map) => map.id === dragKey);
    const dropMap = library.maps.find((map) => map.id === dropKey);
    const dropFolder = library.folders.find((folder) => folder.id === dropKey);
    if (dragMap) {
      if (dropFolder) setExpandedKeys((keys) => Array.from(new Set([...keys, dropFolder.id])));
      setLibrary((current) => {
        if (dropFolder) {
          const remaining = current.maps.filter((map) => map.id !== dragMap.id);
          return { ...current, maps: [...remaining, { ...dragMap, folderId: dropFolder.id, time: '刚刚' }] };
        }
        if (!dropMap) return current;
        const movedMaps = current.maps.map((map) => map.id === dragMap.id
          ? { ...map, folderId: dropMap.folderId, time: '刚刚' }
          : map);
        return { ...current, maps: reorderAround(movedMaps, dragMap.id, dropMap.id, dropPosition > 0) };
      });
      return;
    }
    const dragFolder = library.folders.find((folder) => folder.id === dragKey);
    if (!dragFolder || !dropFolder) return;
    if (dropPosition === 0) setExpandedKeys((keys) => Array.from(new Set([...keys, dropFolder.id])));
    setLibrary((current) => {
      const nextParentId = dropPosition === 0 ? dropFolder.id : (dropFolder.parentId ?? null);
      const movedFolders = current.folders.map((folder) => folder.id === dragFolder.id
        ? { ...folder, parentId: nextParentId }
        : folder);
      return {
        ...current,
        folders: dropPosition === 0
          ? [...movedFolders.filter((folder) => folder.id !== dragFolder.id), { ...dragFolder, parentId: nextParentId }]
          : reorderAround(movedFolders, dragFolder.id, dropFolder.id, dropPosition > 0),
      };
    });
  };

  const duplicateMap = async (map: LibraryMap) => {
    const copy: LibraryMap = {
      ...map,
      id: createId('map'),
      title: `${map.title} 副本`,
      time: '刚刚',
      starred: false,
    };
    const source = await loadServerJson<unknown>(`/api/maps/${encodeURIComponent(map.id)}`);
    const localSource = localStorage.getItem(getLocalDocumentStorageKey(map.id));
    const copySource = source ?? (localSource ? JSON.parse(localSource) as unknown : null);
    if (copySource) await saveServerJson(`/api/maps/${encodeURIComponent(copy.id)}`, copySource).catch(() => undefined);
    if (localSource) localStorage.setItem(getLocalDocumentStorageKey(copy.id), localSource);
    setLibrary((current) => ({ ...current, maps: [copy, ...current.maps] }));
    Message.success('导图已复制');
  };

  const deleteMap = (map: LibraryMap) => Modal.confirm({
    title: '删除导图',
    content: `确定删除“${map.title}”吗？删除后无法恢复。`,
    okButtonProps: { status: 'danger' },
    okText: '删除',
    cancelText: '取消',
    onOk: () => {
      setLibrary((current) => ({ ...current, maps: current.maps.filter((item) => item.id !== map.id) }));
      localStorage.removeItem(getLocalDocumentStorageKey(map.id));
      void deleteServerMap(map.id).catch(() => Message.warning('服务器文件删除失败，已删除本地记录'));
      if (mapId === map.id) navigate('/workspace');
      Message.success('导图已删除');
    },
  });

  const deleteFolder = (folder: LibraryFolder) => {
    const folderIds = new Set([folder.id]);
    let added = true;
    while (added) {
      added = false;
      library.folders.forEach((item) => {
        if (item.parentId && folderIds.has(item.parentId) && !folderIds.has(item.id)) {
          folderIds.add(item.id);
          added = true;
        }
      });
    }
    const maps = library.maps.filter((map) => folderIds.has(map.folderId));
    Modal.confirm({
      title: '删除文件夹',
      content: maps.length
        ? `“${folder.title}”中有 ${maps.length} 个导图，删除文件夹会一并删除这些导图，且无法恢复。`
        : `确定删除空文件夹“${folder.title}”吗？`,
      okButtonProps: { status: 'danger' },
      okText: '删除',
      cancelText: '取消',
      onOk: async () => {
        setLibrary((current) => ({
          folders: current.folders.filter((item) => !folderIds.has(item.id)),
          maps: current.maps.filter((item) => !folderIds.has(item.folderId)),
        }));
        maps.forEach((map) => localStorage.removeItem(getLocalDocumentStorageKey(map.id)));
        await Promise.all(maps.map((map) => deleteServerMap(map.id).catch(() => undefined)));
        if (mapId && maps.some((map) => map.id === mapId)) navigate('/workspace');
        Message.success('文件夹已删除');
      },
    });
  };

  const mapActionsMenu = (map: LibraryMap) => (
    <Menu className="tree-actions-menu" onClickMenuItem={(key) => {
      if (key === 'open') window.open(`/workspace/${map.id}`, '_blank', 'noopener,noreferrer');
      if (key === 'rename') openRename({ kind: 'map', id: map.id, title: map.title });
      if (key === 'move') { setMoveTarget(map); setMoveFolderId(map.folderId); }
      if (key === 'copy') void duplicateMap(map);
      if (key === 'star') toggleStar(map.id);
      if (key === 'delete') deleteMap(map);
    }}>
      <Menu.Item key="open"><IconLaunch />在新标签页打开</Menu.Item>
      <Menu.Item key="rename"><IconEdit />重命名</Menu.Item>
      <Menu.Item key="move"><IconToRight />移动到</Menu.Item>
      <Menu.Item key="copy"><IconCopy />复制</Menu.Item>
      <Divider className="tree-menu-divider" />
      <Menu.Item key="star">{map.starred ? <IconStarFill /> : <IconStar />}{map.starred ? '取消星标' : '添加星标'}</Menu.Item>
      <Divider className="tree-menu-divider" />
      <Menu.Item key="delete" className="tree-menu-danger"><IconDelete />删除</Menu.Item>
    </Menu>
  );

  const folderActionsMenu = (folder: LibraryFolder) => (
    <Menu className="tree-actions-menu" onClickMenuItem={(key) => {
      if (key === 'new') { setTargetFolderId(folder.id); setCreateMapModalOpen(true); }
      if (key === 'new-folder') openFolderModal(folder.id);
      if (key === 'rename') openRename({ kind: 'folder', id: folder.id, title: folder.title });
      if (key === 'delete') deleteFolder(folder);
    }}>
      <Menu.Item key="new"><IconPlus />新建导图</Menu.Item>
      {folderDepth(folder.id) < 3 && <Menu.Item key="new-folder"><IconFolderAdd />新建子文件夹</Menu.Item>}
      <Menu.Item key="rename"><IconEdit />重命名</Menu.Item>
      <Divider className="tree-menu-divider" />
      <Menu.Item key="delete" className="tree-menu-danger"><IconDelete />删除文件夹</Menu.Item>
    </Menu>
  );
  const saveAvatar = (avatar: AvatarState) => {
    const next = { ...user, avatar };
    setUser(next);
    localStorage.setItem(STORAGE_USER, JSON.stringify(next));
    setAvatarOpen(false);
    Message.success('头像已保存');
  };

  const accountMenu = (
    <Menu>
      <Menu.Item key="avatar" onClick={() => setAvatarOpen(true)}>自定义头像</Menu.Item>
      <Menu.Item key="settings" onClick={() => {
        if (localStorage.getItem(STORAGE_SESSION) === 'demo') {
          Message.info('演示账号不支持修改资料，请先创建或登录正式账号');
          return;
        }
        setAccountSettingsOpen(true);
      }}>账户设置</Menu.Item>
      <Menu.Item key="logout" onClick={() => {
        void logoutAccount().finally(() => {
          localStorage.removeItem(STORAGE_USER);
          navigate('/login');
        });
      }}>退出登录</Menu.Item>
    </Menu>
  );

  const createMenu = (
    <Menu onClickMenuItem={(key) => {
      if (key === 'folder') openFolderModal();
      if (key === 'mindmap') setCreateMapModalOpen(true);
    }}>
      <Menu.Item key="folder"><IconFolderAdd />新建文件夹</Menu.Item>
      <Menu.Item key="mindmap"><IconFile />新建导图文件</Menu.Item>
    </Menu>
  );

  return (
    <Layout className="workspace-shell" hasSider>
      <Sider
        className={`workspace-sidebar ${collapsed ? 'is-collapsed' : ''}`}
        width={272}
        collapsedWidth={0}
        collapsed={collapsed}
        collapsible
        trigger={null}
      >
        {!collapsed && <Space className="sidebar-top" size={8}>
          <BrandMark />
          <Tooltip content="收起侧栏">
            <Button
              aria-label="收起侧栏"
              icon={<IconMenuFold />}
              type="text"
              onClick={() => setCollapsed(true)}
            />
          </Tooltip>
        </Space>}

        {!collapsed && <div className="sidebar-primary">
          <Space className="sidebar-create-row" size={8}>
            {!collapsed && (
              <Input.Search
                className="sidebar-search"
                aria-label="搜索导图"
                placeholder="搜索导图…"
                value={search}
                onFocus={() => setSearchPanelOpen(true)}
                onChange={(value) => {
                  setSearch(value);
                  setSearchPanelOpen(true);
                }}
                allowClear
              />
            )}
            <Dropdown droplist={createMenu} position="bl" trigger="click">
              <Button aria-label="新建" title="新建" type="primary" icon={<IconPlus />} />
            </Dropdown>
          </Space>
          <Menu className="quick-nav" collapse={collapsed} selectedKeys={mapId ? [] : [view]} onClickMenuItem={(key) => {
            if (key !== 'recent' && key !== 'starred') return;
            setView(key);
            navigate('/workspace');
          }}>
            <Menu.Item key="recent" renderItemInTooltip={() => '最近打开'}><IconClockCircle />最近打开</Menu.Item>
            <Menu.Item key="starred" renderItemInTooltip={() => '星标导图'}><IconStar />星标导图</Menu.Item>
          </Menu>
        </div>}

        {!collapsed && (
          <div className="library-panel">
            <Space className="section-label" size={8}>
              <span>我的空间</span>
              <Tooltip content="新建分类"><Button aria-label="新建分类" icon={<IconFolderAdd />} type="text" onClick={() => openFolderModal()} /></Tooltip>
            </Space>
            <Tree
              className="file-tree"
              treeData={treeData}
              draggable
              expandedKeys={expandedKeys}
              onExpand={setExpandedKeys}
              allowDrop={({ dragNode, dropNode, dropPosition }) => canDropTreeNode(
                getTreeEventKey(dragNode),
                getTreeEventKey(dropNode),
                dropPosition,
              )}
              onDrop={({ dragNode, dropNode, dropPosition }) => handleTreeDrop(
                getTreeEventKey(dragNode),
                getTreeEventKey(dropNode),
                dropPosition,
              )}
              selectedKeys={[selectedTreeKey]}
              onSelect={(keys) => {
                if (!keys[0]) return;
                const key = String(keys[0]);
                setSelected(key);
                if (library.maps.some((map) => map.id === key)) navigate(`/workspace/${key}`);
              }}
              blockNode
              showLine={false}
              renderExtra={(node) => {
                const key = String(node._key ?? node.dataRef?.key ?? '');
                const map = library.maps.find((item) => item.id === key);
                const folder = library.folders.find((item) => item.id === key);
                if (!map && !folder) return null;
                return (
                  <Dropdown
                    droplist={map ? mapActionsMenu(map) : folderActionsMenu(folder!)}
                    position="br"
                    trigger="click"
                  >
                    <Button
                      className="tree-more-button"
                      type="text"
                      size="mini"
                      aria-label={`${map ? map.title : folder!.title}的更多操作`}
                      icon={<IconMore />}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Dropdown>
                );
              }}
            />
          </div>
        )}

        {!collapsed && <div className="sidebar-account">
          <Dropdown droplist={accountMenu} position="tr" trigger="click">
            <Button type="text" size="large" long className="account-trigger">
              <ArcoAvatar className="mini-humation" shape="square" size={28} autoFixFontSize={false}>
                <Avatar assets={humation1} seed={user.avatar.seed} selections={user.avatar.selections} colors={user.avatar.colors} size={28} />
              </ArcoAvatar>
              <Text className="account-name" bold>{user.name}</Text>
            </Button>
          </Dropdown>
        </div>}
      </Sider>

      <Layout className={`workspace-main ${collapsed ? 'sidebar-is-hidden' : ''} ${mapId ? 'is-editor-open' : ''}`}>
        <Header className="workspace-header">
          {collapsed && (
            <Tooltip content="展开侧栏" position="right">
              <Button
                className="sidebar-expand-trigger"
                aria-label="展开侧栏"
                icon={<IconMenuUnfold />}
                onClick={() => setCollapsed(false)}
              />
            </Tooltip>
          )}
          <Breadcrumb className="breadcrumb">
            {mapId && <Breadcrumb.Item key="folder">{activeFolder?.title ?? '未分类'}</Breadcrumb.Item>}
            <Breadcrumb.Item key="current">{activeMap?.title ?? (mapId ? '未命名导图' : view === 'starred' ? '星标导图' : '最近打开')}</Breadcrumb.Item>
          </Breadcrumb>
          {mapId && <div ref={captureEditorToolbar} className="workspace-editor-actions" />}
        </Header>

        {mapId ? (
          <Content className="workspace-editor-content">
            <Suspense fallback={<div className="editor-loading"><Spin size={32} tip="正在加载导图编辑器…" /></div>}>
              <EditorContainer
                key={mapId}
                mapId={mapId}
                title={activeMap?.title ?? '未命名导图'}
                toolbarTarget={editorToolbarTarget}
                defaultViewMode={activeMap?.defaultViewMode ?? user.defaultViewMode ?? 'mindmap'}
                focusNodeText={searchFocus?.mapId === mapId ? searchFocus.nodeText : undefined}
                onTitleChange={syncEditorTitle}
              />
            </Suspense>
          </Content>
        ) : (
          <Content className="workspace-content">
            <section className="recent-section">
            <PageHeader className="section-heading" backIcon={false} title={view === 'starred' ? '星标导图' : '最近打开'} />
            {visibleMaps.length > 0 ? (
              <Row className="recent-grid" gutter={[18, 24]}>
                {visibleMaps.map((map) => (
                  <Col key={map.id} xs={12} sm={8} md={6} lg={4} xl={3}>
                  <Card
                    className="file-tile"
                    bordered={false}
                    role="link"
                    tabIndex={0}
                    aria-label={`${map.title}，${folderById[map.folderId] ?? '未分类'}，修改于${map.time}`}
                    onClick={() => navigate(`/workspace/${map.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/workspace/${map.id}`);
                      }
                    }}
                  >
                    <Space className="file-tile-content" direction="vertical" size={18} align="center">
                      <ArcoAvatar className="file-tile-icon" shape="square" size={48}>
                        <IconFile />
                      </ArcoAvatar>
                      <Text className="file-tile-name" ellipsis={{ rows: 2, showTooltip: true }}>{map.title}</Text>
                    </Space>
                  </Card>
                  </Col>
                ))}
              </Row>
            ) : (
              <Empty description="没有找到匹配的导图" />
            )}
            </section>
          </Content>
        )}
      </Layout>

      <Drawer
        className="global-search-drawer"
        title="搜索"
        placement="left"
        width={440}
        visible={searchPanelOpen}
        onCancel={() => setSearchPanelOpen(false)}
        footer={null}
      >
        <div className="global-search-field">
          <Input.Search
            aria-label="全局搜索"
            placeholder="搜索文件名和文件内容"
            value={search}
            onChange={setSearch}
            allowClear
            autoFocus
          />
          <Popover
            trigger="click"
            position="br"
            content={(
              <div className="global-search-filter">
                <div className="global-search-filter-title">
                  <span>筛选文件夹</span>
                  {searchFolderIds.length > 0 && <Button type="text" size="mini" onClick={() => setSearchFolderIds([])}>清除</Button>}
                </div>
                <Checkbox.Group value={searchFolderIds} onChange={(values) => setSearchFolderIds(values as string[])}>
                  <Space direction="vertical" size={8}>
                    {library.folders.map((folder) => <Checkbox key={folder.id} value={folder.id}>{folder.title}</Checkbox>)}
                  </Space>
                </Checkbox.Group>
              </div>
            )}
          >
            <Button
              className={`global-search-filter-trigger${searchFolderIds.length > 0 ? ' is-active' : ''}`}
              type="text"
              aria-label="筛选搜索文件夹"
              icon={<IconFilter />}
            />
          </Popover>
        </div>
        {!search.trim() ? (
          <Empty className="global-search-empty" description="输入关键词以搜索全部文件内容" />
        ) : searchLoading ? (
          <div className="global-search-loading"><Spin /></div>
        ) : (
          <div className="global-search-results">
            <div className="global-search-count">共 {searchResults.reduce((total, result) => total + (result.kind === 'folder' ? 1 : result.hits.length), 0)} 条搜索结果</div>
            {searchResults.length === 0 ? <Empty description="没有找到匹配内容" /> : searchResults.map((result) => {
              if (result.kind === 'folder') {
                return (
                  <article
                    key={`folder-${result.folderId}`}
                    className="global-search-result global-search-folder-result"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setExpandedKeys((current) => Array.from(new Set([...current, result.folderId])));
                      setSearchPanelOpen(false);
                      navigate('/workspace');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setExpandedKeys((current) => Array.from(new Set([...current, result.folderId])));
                        setSearchPanelOpen(false);
                        navigate('/workspace');
                      }
                    }}
                  >
                    <IconFolder className="global-search-result-icon" />
                    <div className="global-search-result-body">
                      <h3><SearchHighlight text={result.title} query={search.trim()} /></h3>
                      <p className="global-search-path">文件夹</p>
                    </div>
                  </article>
                );
              }
              const expanded = expandedSearchMaps.has(result.mapId);
              const hits = expanded ? result.hits : result.hits.slice(0, 4);
              return (
                <article
                  key={result.mapId}
                  className="global-search-result"
                >
                  <IconFile className="global-search-result-icon" />
                  <div className="global-search-result-body">
                    <h3><SearchHighlight text={result.title} query={search.trim()} /></h3>
                    <p className="global-search-path">{folderById[result.folderId] ?? '未分类'} › {result.title}</p>
                    <ul className="global-search-hit-list">
                      {hits.map((hit, index) => (
                        <li key={`${hit.path}-${index}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(result.mapId);
                              setSearchFocus({ mapId: result.mapId, nodeText: hit.nodeText });
                              setSearchPanelOpen(false);
                              navigate(`/workspace/${result.mapId}`);
                            }}
                          ><SearchHighlight text={hit.text} query={search.trim()} /></button>
                        </li>
                      ))}
                    </ul>
                    {result.hits.length > 4 && (
                      <Button
                        className="global-search-expand"
                        type="text"
                        size="mini"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedSearchMaps((current) => {
                            const next = new Set(current);
                            if (expanded) next.delete(result.mapId);
                            else next.add(result.mapId);
                            return next;
                          });
                        }}
                      >{expanded ? '收起' : '展开更多'}</Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Drawer>

      <AvatarStudio visible={avatarOpen} value={user.avatar} onCancel={() => setAvatarOpen(false)} onSave={saveAvatar} />
      <AccountSettings
        visible={accountSettingsOpen}
        user={user}
        onClose={() => setAccountSettingsOpen(false)}
        onUserChange={setUser}
      />
      <Modal title="新建文件夹" visible={folderModalOpen} onCancel={() => setFolderModalOpen(false)} onOk={addFolder} okText="创建">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Input value={folderName} onChange={setFolderName} onPressEnter={addFolder} placeholder="输入文件夹名称" maxLength={30} showWordLimit autoFocus />
          <Select
            aria-label="上级文件夹"
            placeholder="根目录"
            allowClear
            value={targetParentFolderId || undefined}
            onChange={(value) => setTargetParentFolderId(value || '')}
            options={folderOptions.filter((option) => folderDepth(option.value) < 3)}
          />
        </Space>
      </Modal>
      <Modal title="新建导图" visible={createMapModalOpen} onCancel={() => setCreateMapModalOpen(false)} onOk={addMap} okText="创建">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Input value={mapName} onChange={setMapName} onPressEnter={addMap} placeholder="输入导图名称" maxLength={50} showWordLimit autoFocus />
          <Select
            aria-label="所属分类"
            placeholder="选择所属分类"
            value={targetFolderId}
            onChange={setTargetFolderId}
            options={folderOptions}
          />
        </Space>
      </Modal>
      <Modal title={renameTarget?.kind === 'folder' ? '重命名文件夹' : '重命名导图'} visible={Boolean(renameTarget)} onCancel={() => setRenameTarget(null)} onOk={renameItem} okText="保存">
        <Input value={renameValue} onChange={setRenameValue} placeholder="输入新名称" maxLength={50} showWordLimit autoFocus />
      </Modal>
      <Modal title="移动导图" visible={Boolean(moveTarget)} onCancel={() => setMoveTarget(null)} onOk={moveMap} okText="移动">
        <Select
          aria-label="移动到文件夹"
          placeholder="选择文件夹"
          value={moveFolderId}
          onChange={setMoveFolderId}
          style={{ width: '100%' }}
          options={folderOptions}
        />
      </Modal>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/workspace" element={<WorkspacePage />} />
      <Route path="/workspace/:mapId" element={<WorkspacePage />} />
      <Route path="/editor/:mapId" element={<LegacyEditorRedirect />} />
      <Route path="*" element={<Navigate to={localStorage.getItem(STORAGE_SESSION) ? '/workspace' : '/login'} replace />} />
    </Routes>
  );
}
