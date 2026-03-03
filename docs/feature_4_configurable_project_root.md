# 功能 5：项目根目录改为可在页面配置

## 1. 主要功能

- 项目根目录改为可在页面配置
- 解除 `WORKSPACES_ROOT` 仅限 home 的约束

## 2. 实现逻辑

### 2.1 页面配置入口（Settings -> Workspace）
- 前端在设置页增加 `Workspace` 选项卡，放在 "智能体" button 左侧(.flex-1 > .border-b > .flex > .px-4)：
  - 可编辑输入框：`workspacesRoot`
  - 点击"保存设置"按钮可保存设置
  - 当前生效路径展示：`resolvedWorkspacesRoot`
- 用户不用改 `.env`，可直接在 UI 修改项目根目录。

### 2.2 后端配置持久化

- 后端新增服务器级配置文件。
- 通过 `server/config.js` 统一读写并缓存配置：
  - `getServerSettings()`
  - `updateServerSettings(updates)`
  - `getWorkspacesRoot()`
- `getWorkspacesRoot()` 优先级：
  1. UI 保存的 `settings.workspacesRoot`
  2. 环境变量 `process.env.WORKSPACES_ROOT`（兼容旧方式）
  3. `os.homedir()` 默认值

### 2.3 配置 API

- `GET /api/settings/config`：返回当前配置和 `resolvedWorkspacesRoot`
- `POST /api/settings/config`：更新 `workspacesRoot`（空值重置为默认）

### 2.4 真正生效点（项目创建路径校验）

- `server/routes/projects.js` 使用 `getWorkspacesRoot()` 动态解析允许根目录。
- `validateWorkspacePath()` 中对目标路径做 realpath 后，必须落在允许根目录（支持多根，按系统分隔符拆分）。
- 这保证“页面改配置”会直接影响项目创建/导入时的合法路径范围。

## 3. 参考关键代码片段（注意：不要直接复制，要理解后重构，尽量用 typescript）

### 3.1 Settings 页面读取/保存根目录

文件：`src/components/Settings.jsx`

```jsx
const loadServerConfig = async () => {
  const response = await authenticatedFetch('/api/settings/config');
  const data = await response.json();
  setWorkspacesRoot(data.config.workspacesRoot || '');
  setResolvedWorkspacesRoot(data.config.resolvedWorkspacesRoot || '');
};

const saveWorkspacesRoot = async () => {
  const response = await authenticatedFetch('/api/settings/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspacesRoot })
  });
};
```

```jsx
<Input
  value={workspacesRoot}
  onChange={(e) => setWorkspacesRoot(e.target.value)}
  placeholder={t('account.workspaces.rootPlaceholder') || 'e.g. ~/Projects or D:\\Projects'}
/>
<Button onClick={saveWorkspacesRoot} disabled={workspacesRootLoading}>
  {workspacesRootLoading ? 'Saving...' : (t('common.save') || 'Save')}
</Button>
```

### 3.2 配置文件存储与优先级解析

文件：`server/config.js`

```js
const CONFIG_DIR = path.join(os.homedir(), '.claude');
const CONFIG_FILE = path.join(CONFIG_DIR, 'server-settings.json');

const DEFAULTS = {
  workspacesRoot: null
};
```

```js
export function getWorkspacesRoot() {
  const settings = getServerSettings();
  if (settings.workspacesRoot) return settings.workspacesRoot;
  if (process.env.WORKSPACES_ROOT) return process.env.WORKSPACES_ROOT;
  return os.homedir();
}
```

### 3.3 Settings 配置 API

文件：`server/routes/settings.js`

```js
router.get('/config', async (req, res) => {
  res.json({
    config: {
      ...getServerSettings(),
      resolvedWorkspacesRoot: getWorkspacesRoot()
    }
  });
});
```

```js
router.post('/config', async (req, res) => {
  const { workspacesRoot } = req.body;
  const updates = {};
  if (workspacesRoot !== undefined) {
    updates.workspacesRoot = workspacesRoot === null || workspacesRoot.trim() === ''
      ? null
      : workspacesRoot.trim();
  }
  updateServerSettings(updates);
  res.json({ success: true, config: { ...getServerSettings(), resolvedWorkspacesRoot: getWorkspacesRoot() } });
});
```

### 3.4 项目路径校验读取动态根目录

文件：`server/routes/projects.js`

```js
function parseWorkspaceRoots() {
  const rawRoots = getWorkspacesRoot();
  const parts = rawRoots.split(path.delimiter).map(p => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [os.homedir()];
}
```

```js
const workspaceRoots = parseWorkspaceRoots();
const resolvedWorkspaceRoots = await Promise.all(workspaceRoots.map(resolvePathAllowingNonexistent));
const isAllowed = resolvedWorkspaceRoots.some(root => isSamePathOrWithin(realPath, root));
if (!isAllowed) {
  return {
    valid: false,
    error: `Workspace path must be within the allowed workspace root: ${workspaceRoots.join(path.delimiter)}`
  };
}
```

