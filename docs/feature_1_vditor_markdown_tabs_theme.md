# 功能 1：Vditor Markdown 文档编辑器（含多标签页与主题联动）

## 1. 主要功能

- `.md` 默认以原方式打开，增加 原方式 与 Vditor 的切换按钮
- Vditor 初始化与编辑/预览单栏切换（`ir` 模式）
- 用标签页支持打开多个文档
- md 编辑器的背景色和文字颜色，随主题变化，例如：主题是深色时，md 文字颜色变浅，背景变深（包括表格的）

## 2. 实现逻辑

### 2.1 打开的 `.md` 文件，当切换为vditor时：
- 主内容区按文件扩展名分流：
  - markdown 文件：`<MarkdownFileEditor />`
  - 非 markdown 文件：`<CodeEditor />`
- 这样保证 `.md` 默认进入 Vditor 管线，而普通代码文件不受影响。

### 2.2 多文档标签页（同时打开多个文件）
- `MainContent` 内部维护 `openFiles` + `activeFileId`：
  - 打开文件时若已存在标签，只切换激活；
  - 新文件追加为新标签；
  - 关闭标签时自动选择相邻标签；
  - 切换标签前检查内容是否未保存，提示用户是否保存。

### 2.3 主题联动（背景色/字体色跟随设置）
- `MarkdownFileEditor` 通过 `useTheme()` 获取 `isDarkMode`。
- 初始化 Vditor 时设置 `theme: isDarkMode ? 'dark' : 'classic'`。
- 主题变化时执行 `vditorInstance.setTheme(...)`。
- 额外用一组 CSS 变量覆盖 Vditor 暗色下的文本、标题、表格、代码块、工具栏颜色。

## 3. 参考关键代码片段（注意：不要直接复制，要理解后重构，尽量用 typescript）

### 3.1 `.md` 文件打开Vditor开关时，使用 MarkdownFileEditor（并支持多标签页）

文件：`src/components/MainContent.jsx`

```jsx
const [openFiles, setOpenFiles] = useState([]);
const [activeFileId, setActiveFileId] = useState(null);

const handleFileOpen = async (filePath, diffInfo = null, projectNameOverride = null) => {
  const projectName = projectNameOverride || selectedProject?.name;
  const fileId = `${projectName}:${filePath}`;
  const nextFile = { id: fileId, name: getFileBaseName(filePath), path: filePath, projectName, diffInfo };

  const existingFileIndex = openFiles.findIndex(f => f.id === fileId);
  if (existingFileIndex !== -1) {
    setActiveFileId(fileId);
    return;
  }

  setOpenFiles(prev => [...prev, nextFile]);
  setActiveFileId(fileId);
};
```

```jsx
{isMarkdownFile(editingFile.name) ? (
  <MarkdownFileEditor file={editingFile} onClose={handleCloseEditor} isActive={true} />
) : (
  <CodeEditor ref={codeEditorRef} file={editingFile} onClose={handleCloseEditor} />
)}
```

### 3.2 Vditor 初始化与主题联动

文件：`src/components/MarkdownFileEditor.jsx`

```jsx
const { isDarkMode } = useTheme();

const instance = new Vditor(vditorRef.current, {
  width: '100%',
  height: '100%',
  mode: VDITOR_MODE.WYSIWYG,
  theme: isDarkMode ? 'dark' : 'classic',
  value: content,
  toolbar: TOOLBAR_CONFIG,
});
```

```jsx
useEffect(() => {
  if (editorMode !== EDITOR_MODE.VDITOR || !vditorInstance) return;
  vditorInstance.setTheme(isDarkMode ? 'dark' : 'classic');
}, [isDarkMode, editorMode, vditorInstance]);
```

### 3.3 暗色主题下的文本/背景

文件：`src/components/MarkdownFileEditor.jsx`

```css
.vditor-container.vditor--dark {
  --toolbar-background-color: #1f2937;
  --textarea-background-color: #1f2937;
  --text-color: #e5e7eb;
  --heading-color: #f3f4f6;
}

.vditor-container.vditor--dark .vditor-content,
.vditor-container.vditor--dark .vditor-ir,
.vditor-container.vditor--dark .vditor-wysiwyg {
  background-color: var(--textarea-background-color);
  color: var(--text-color) !important;
}
```

### 3.4 按需加载 Vditor 资源

文件：`src/lib/vditorLoader.js`

```js
const VDITOR_CSS_URL = 'https://unpkg.com/vditor/dist/index.css';
const VDITOR_JS_URL = 'https://unpkg.com/vditor/dist/index.min.js';

export function loadVditor() {
  if (window.Vditor) return Promise.resolve(window.Vditor);
  // 动态注入 script/link，仅在浏览器端加载
}
```

