# 功能 2：上传文件并让 AI 识别引用

## 1. 主要功能

- 新建项目时，自动在项目目录下创建文件夹`upload_files`
- 上传文件并让AI识别引用
- 粘贴/拖拽文件落盘到`upload_files`目录下，并插入引用

## 2. 实现逻辑

### 2.1 前端发送链路：先上传，再拼接 `@引用`

- 在 `ChatInterface` 中维护附件列表 `attachedFiles`。
- 用户提交消息时：
  1. 循环调用 `api.uploadFiles(projectName, file)`；
  2. 服务端返回 `reference`（统一为 `@...`）；
  3. 将全部引用拼接到用户消息末尾（换行追加）；
  4. 同步进 `fileMentions`，供会话上下文使用。
- 结果：AI 实际收到的 prompt 已包含 `@upload_files/x.ext` ，可直接识别引用目标。

### 2.2 后端上传链路：去重复用 + 规范命名 + 返回引用

- 新增路由：`POST /api/projects/:projectName/files/upload`。
- 核心流程：
  1. `multer` 收临时文件；
  2. 解析项目真实目录；
  3. 读取该项目 uploads 目录名（`getProjectUploadsDirectoryByPath`）；
  4. 全工作区扫描同名文件，按 `size + sha256` 判定是否同文件；
  5. 命中则直接返回已存在文件的 `@upload_files/x.ext`；
  6. 未命中则按 `N.ext` 编号落到 uploads 目录，返回 `@upload_files/N.ext`。

### 2.3 工程配套：上传目录初始化

- 路由：`POST /api/projects/:projectName/files/init`
- 前端 Sidebar 提供 Initialize Uploads 按钮，保证项目具备稳定上传目录。

## 3. 参考关键代码片段（注意：不要直接复制，要理解后重构，尽量用 typescript）

### 3.1 提交时上传并注入引用

文件：`src/components/ChatInterface.jsx`

```jsx
const uploadedReferences = [];
if (attachedFiles.length > 0) {
  for (const file of attachedFiles) {
    const response = await api.uploadFiles(selectedProject.name, file);
    const result = await response.json();
    const reference = result.reference.startsWith('@') ? result.reference : `@${result.reference}`;
    uploadedReferences.push(reference);
  }
}

if (uploadedReferences.length > 0) {
  setFileMentions(prev => Array.from(new Set([...prev, ...uploadedReferences])));
  const referencesText = uploadedReferences.join(' ');
  messageContent = messageContent.trim()
    ? `${messageContent}\n${referencesText}`
    : referencesText;
}
```

### 3.2 上传 API 封装

文件：`src/utils/api.js`

```js
uploadFiles: (projectName, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return authenticatedFetch(`/api/projects/${encodeURIComponent(projectName)}/files/upload`, {
    method: 'POST',
    body: formData,
    headers: {},
  });
},
```

### 3.3 服务端去重复用与引用返回

文件：`server/routes/projects.js`

```js
const existingWorkspaceFile = await findMatchingWorkspaceFile(
  projectDir,
  req.file.originalname,
  req.file.size,
  tempPath
);

if (existingWorkspaceFile) {
  const relativePath = path.relative(projectDir, existingWorkspaceFile).split(path.sep).join('/');
  const reference = `@${relativePath}`;
  return res.json({ success: true, reference, reusedExisting: true });
}
```

```js
const nextNum = maxNum + 1;
const ext = path.extname(req.file.originalname);
const newFilename = `${nextNum}${ext}`;
const reference = `@${uploadsDirName}/${newFilename}`;
res.json({ success: true, reference, filename: newFilename });
```

### 3.4 按项目路径获取 uploads 目录（避免路径别名错配）

文件：`server/projects.js`

```js
async function getProjectUploadsDirectoryByPath(projectPath) {
  const config = await loadProjectConfig();
  const normalizedTargetPath = normalizePathForLookup(projectPath);

  for (const value of Object.values(config)) {
    if (normalizePathForLookup(value.originalPath) === normalizedTargetPath) {
      return value.uploadsDirectory || 'upload_files';
    }
  }
  return 'upload_files';
}
```

