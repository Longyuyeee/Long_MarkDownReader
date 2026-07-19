# LongEdit Table Chart Reference 1.0

状态：已实现  
目标：让 Markdown 与 JSON Canvas 引用可编辑 Table 图表，而不是保存截图或数据副本。

## 1. 引用模型

一个图表引用只包含两个业务字段：

- `source`：`.table.json` 文件路径。
- `view`：源 Table 中 `kind = "chart"` 的稳定视图 ID。

相对路径以承载引用的 Markdown 或 Canvas 文件目录为基准。绝对路径必须仍位于当前知识库；所有读取继续经过 `WorkspaceGuard`。引用不保存行数据、聚合结果、SVG 或位图。

## 2. Markdown 语法

Markdown 使用标准 fenced code block 保存引用，普通编辑器仍可读取和修改：

````markdown
```longedit-chart
{"source":"data/项目.table.json","view":"chart-progress"}
```
````

正文编辑器工具栏的“插入实时 Table 图表”会验证文件和视图后生成该代码块。LongEdit 在文档工作面显示实时图表区域；无效 JSON、源文件丢失或视图删除时显示局部错误，不改写 Markdown。

## 3. JSON Canvas 语法

Canvas 使用标准 `file` 节点，并增加一个可忽略扩展字段：

```json
{
  "id": "node-chart",
  "type": "file",
  "file": "data/项目.table.json",
  "longeditViewId": "chart-progress",
  "x": 120,
  "y": 80,
  "width": 660,
  "height": 430
}
```

不理解扩展字段的软件仍可把它作为普通 JSON Canvas 文件节点处理。LongEdit 要求 `longeditViewId` 是合法稳定 ID，且 `file` 必须以 `.table.json` 结尾。

## 4. 渲染与同步语义

- 渲染时读取源 Table 的最新 `data`、chart 视图配置、筛选和排序，不保存派生快照。
- 柱、线、饼、散点使用与 Table 工作面相同的本地 SVG 渲染器。
- 返回文档/Canvas、窗口重新获得焦点、手动刷新或收到 Table 保存事件时重新读取源文件。
- “编辑源图表”跳转到源 Table；修改并保存后，引用在下一次刷新时同步。
- 引用损坏只影响当前图表卡片，不阻止 Markdown 或 Canvas 其余内容打开和编辑。

## 5. 兼容与限制

- 1.0 不把图表导出为静态图片，也不提供脱离源 Table 的离线快照。
- 重命名或移动源文件后的自动引用重写尚未实现；引用会明确显示源文件不可用。
- Markdown 当前把同一文档内的图表集中显示在可折叠图表工作区；引用代码块仍保留在正文中的原始位置。
- Canvas 图表节点可移动、缩放、复制、连接和分组；复制到另一 Canvas 时沿用现有文件引用重定位规则。
