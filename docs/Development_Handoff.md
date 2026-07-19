# Long Markdown Reader 开发交接

更新日期：2026-07-20
交接基线：`v0.6.9` 之后的专业知识工作区改造

## 1. 新电脑快速恢复

### 环境要求

- Windows 10/11 x64
- Git 与 GitHub CLI（`gh auth login`）
- Node.js 与 npm；安装依赖时使用 `npm ci`
- Rust stable、Cargo，以及 Tauri 2 在 Windows 上需要的 WebView2 与 MSVC 构建工具

### 拉取与验证

```powershell
git clone https://github.com/Longyuyeee/Long_MarkDownReader.git
cd Long_MarkDownReader
git fetch --all --prune
git switch codex/professional-workspace-foundation
npm ci
npm run ci:check
npm run tauri -- build --debug --no-bundle
```

桌面端调试运行：

```powershell
npm run tauri -- dev
```

Debug 构建输出位于 `src-tauri/target/debug/tauri-app.exe`，该目录属于本机构建产物，不进入 Git。

## 2. 当前产品能力

- Markdown 编辑、双向链接、反向链接、标签、历史版本和 Git 同步。
- 全局/局部知识图谱、图谱健康检查、关系筛选、链接修复与图谱到 Canvas 转换。
- JSON Canvas 可视化编辑，以及 Markdown、文件、Mermaid、表格图表等节点。
- Mermaid Diagram Studio，支持结构化编辑、预览与 SVG/PNG 导出。
- CSV/TSV 和开放 `.table.json` 表格编辑、图表、仪表盘、Markdown/Canvas 嵌入。
- XLSX 多工作表只读预览，可将工作表转换为开放表格；暂不承诺原位完整 XLSX 编辑。
- PDF 分段读取、阅读、标注、OCR sidecar、全文索引和图谱关系。
- API Key 使用 Windows 系统凭据存储；旧配置中的明文 Key 会一次性迁移并清除。

## 3. 后端结构

- `src-tauri/src/lib.rs`：仅保留 Tauri 应用装配、托盘/窗口事件、URI 协议与命令注册。
- `src-tauri/src/commands/`：按 AI、Canvas、配置、图表、文件、Git、图谱、历史、索引、PDF、搜索、系统、表格和工作簿拆分的 IPC 命令。
- `src-tauri/src/formats/`：Canvas、Diagram、Markdown、PDF 标注/OCR、开放表格格式适配与验证。
- `src-tauri/src/services/`：系统凭据、数据迁移、PDF 索引、可靠写入和 `WorkspaceGuard`。

FR-BASE-004 已验收：按项目既有统计口径，`lib.rs` 从 2,257 行降至 314 行，Rust 业务测试随模块放置。

## 4. 关键设计文档

- `docs/Product_Requirements_and_Development_Roadmap.md`：需求状态、验收标准和实施批次，是后续开发的主路线图。
- `docs/Professional_Knowledge_Workspace_Design.md`：产品定位、整体架构与专业管理系统设计。
- `docs/Open_Table_Format_Spec.md`：开放表格文件格式。
- `docs/Table_Chart_Reference_Spec.md`：图表引用和嵌入规范。
- `docs/XLSX_Compatibility_Boundary.md`：XLSX 能力边界。
- `docs/Credential_Storage_Security.md`：凭据安全模型和迁移方式。
- `docs/Mermaid_Diagram_Workspace.md`：Diagram Studio 行为与兼容边界。

## 5. 验证基线

最后一次完整验证结果：

- `npm run ci:check`：通过。
- Rust：79 项测试通过，0 失败。
- 100 MiB PDF 范围读取基准：约 72 ms，仅读取约 256 KiB。
- `npm audit --omit=dev`：0 个漏洞。
- `npm run tauri -- build --debug --no-bundle`：通过。

Vite 仍会提示少数 Mermaid/UI 分包压缩后超过 500 KiB；这是性能优化项，不是构建失败。

## 6. 下一阶段顺序

1. 完成 FR-BASE-001：审计所有接收文件路径的 Tauri 命令，让知识库内文件访问统一经过 `WorkspaceGuard`，补齐路径穿越、绝对路径越界和符号链接越界测试。
2. 完成 FR-BASE-002：继续统一 Markdown、Canvas、配置和其他写入路径的可靠写入/恢复策略。
3. 完善 FR-BASE-005：在 CI 中增加关键保存流程 E2E 和 fixture 门禁。
4. 开始图谱体验增强：以当前笔记为中心的局部图谱常驻入口、邻接关系面板、图谱/大纲/Canvas 双向转换，以及真正可编辑的树形思维导图布局。

开始新功能前先更新路线图中的需求状态与验收条件；每个阶段至少执行 `npm run ci:check`，涉及桌面端注册或 Rust 命令变更时再执行完整 Tauri 构建。

## 7. 已知边界与注意事项

- 当前重点是本地优先和开放文件格式，不引入私有数据库作为唯一事实源。
- XLSX 当前为专业预览与导入能力，不应宣传为 Excel 等价编辑器。
- PDF 标注和 OCR 使用 sidecar 文件，不直接重写原 PDF。
- 图谱支持 Markdown、PDF 和表格节点，但“思维导图”仍需独立交互模型，不能仅把力导向图改成树形布局。
- 不要提交 `.claude/settings.local.json`、系统凭据、知识库内容、`dist/` 或 `src-tauri/target/`。
