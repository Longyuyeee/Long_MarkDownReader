# UX-50B / EA-2A 外部文本、代码与默认应用审计

## 结论

EA-2A 已把外部编辑从 Markdown/TXT 扩展到 17 类受控文本工作区。新增范围只包含已经由 `TextEditor` 完整承载的配置与代码格式，不把“资料库内可编辑”直接等同于“可由系统外部启动”。

## 已完成

- `.env`、INI/CONF/CFG、Properties、EditorConfig、GitIgnore，以及 JavaScript、TypeScript、Python、Rust、Go、Java/Kotlin、C/C++/C#、Shell/PowerShell、SQL、HTML/CSS/Vue 可在用户选择文件或 Windows 启动参数后获得当前进程授权。
- 上述格式统一使用 `TextEditor`：保留编码、BOM 和换行策略，提供语法高亮、撤销/重做、查找替换、外部修改冲突保护，并且只有点击保存才写回源文件。
- 外部文件不持久化为可绕过授权的最近文件；进程重启后必须再次由用户明确选择。
- 格式能力页增加“可外部打开”筛选，并逐格式说明直接编辑、仅导入或不接受外部启动。
- 设置页合并重复的 Markdown 打开方式入口，统一为“格式能力与默认应用”。

## 默认应用边界

- Windows 默认应用必须由用户在系统界面确认；Long编辑只负责打开对应设置，不直接改写默认关联。
- 本阶段没有扩大 Tauri/NSIS 文件关联。安装器仍只登记 `.md` 与 `.markdown` 的 OpenWith 候选。
- 应用支持某种格式，不代表安装后自动接管该格式；用户可以在格式能力页确认能力后再进入 Windows 选择。

## 明确未开放

JSON/JSONC、YAML、XML、TOML 与 SVG 仍使用各自的专用分析和安全保存命令，当前尚未接入外部授权写回，不能通过通用文本命令绕过。图片、视频、表格、Office、PDF 与图形格式同样保持原有导入或资料库边界。

## 质量门补充

- 完整发布门禁发现上游新披露的 Mermaid 与 PDF.js 安全公告，已将 `mermaid` 升级至 `11.16.1`、`pdfjs-dist` 升级至 `6.2.108`。
- 升级后重新验证生产依赖审计、应用构建、PDF 工作区与媒体工作区；`npm audit --omit=dev` 为 0 个已知漏洞。

## 下一步

进入 EA-2B：为 JSON、YAML、XML、TOML 与 SVG 的专用读写命令增加外部授权上下文，并逐一验证无效源码覆盖提示、撤销重做、冲突保护、返回上下文和显式保存，再决定是否加入 Windows 可选格式清单。
