# 功能 3：Skills 选择器（不同 AI 助手读取不同目录）

## 1. 主要功能

- 增加 skills 选择器（前后端主实现）
- 包含项目级 skill 和 全局级 skill

## 2. 实现逻辑

### 2.1 后端目录分流：按 provider 决定配置根目录

- 新增接口：`GET /api/skills?projectPath=...&provider=...`
- 分流规则：
  - `codex`：`~/.agents/skills` + `~/.codex/skills` + `<projectPath>/.codex/skills`
  - `claude`：`~/.agents/skills` + `~/.claude/skills` + `<projectPath>/.claude/skills`
- 只读取一层目录名，过滤隐藏目录。
- 读取 `SKILL.md` frontmatter（`chinese` 字段）作为显示名。
- 合并后按名称排序返回：`{ skills: [{ name, value, source }] }`。

### 2.2 前端加载与注入

- `ChatInterface` 在 provider 或 project 变化时请求 `/api/skills`。
- 用户在下拉框选择 skill 后：
  - `claude`：输入前缀注入 `/skill-name `
  - `codex`：输入前缀注入 `$skill-name `
  - 下拉框显示所选的skill的chinese值
- 注入前会移除已有的开头 skill 前缀，避免重复叠加。
- UI 位置：聊天输入框(.relative > .relative > .relative > .chat-input-placeholder) 上方

## 3. 参考关键代码片段（注意：不要直接复制，要理解后重构，尽量用 typescript）

### 3.1 Skills 路由挂载

文件：`server/index.js`

```js
import skillsRoutes from './routes/skills.js';
app.use('/api/skills', authenticateToken, skillsRoutes);
```

### 3.2 后端按 provider 选择技能目录

文件：`server/routes/skills.js`

```js
const configDir = (provider === 'claude')
  ? '.claude'
  : '.codex';

const commonGlobalSkillsDir = path.join(os.homedir(), '.agents', 'skills');
await readSkillDirs(commonGlobalSkillsDir, 'global');

const globalSkillsDir = path.join(os.homedir(), configDir, 'skills');
await readSkillDirs(globalSkillsDir, 'global');

if (projectPath) {
  const projectSkillsDir = path.join(projectPath, configDir, 'skills');
  await readSkillDirs(projectSkillsDir, 'project');
}
```

```js
const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
const parsed = matter(content);
if (parsed.data && parsed.data.chinese) {
  displayName = parsed.data.chinese;
}
skillsMap.set(entry.name, { name: displayName, value: entry.name, source });
```

### 3.3 前端拉取 skills + 前缀注入规则

文件：`src/components/ChatInterface.jsx`

```jsx
const skillProviders = ['codex', 'claude'];
if (!skillProviders.includes(provider)) {
  setSkills([]);
  return;
}

const response = await authenticatedFetch(
  `/api/skills?projectPath=${encodeURIComponent(projectPath)}&provider=${encodeURIComponent(provider)}`
);
```

```jsx
const isClaudeProvider = provider === 'claude';
const skillMention = isClaudeProvider ? `/${selectedSkill} ` : `$${selectedSkill} `;
setInput(prev => {
  const cleaned = prev.replace(/^[/$]\S+\s*/, '');
  return skillMention + cleaned;
});
```

### 3.4 前端 Skills 选择器渲染

文件：`src/components/ChatInterface.jsx`

```jsx
{['codex', 'claude'].includes(provider) && skills.length > 0 && (
  <select id="skill-select" value="" onChange={(e) => setSelectedSkill(e.target.value)}>
    <option value="">Select a skill...</option>
    {skills.map((skill) => (
      <option key={skill.value || skill.name} value={skill.value || skill.name}>
        {skill.name}{skill.source === 'global' ? ' (global)' : ' (project)'}
      </option>
    ))}
  </select>
)}
```

