# A0O HTML 与代码专业工作区审计

日期：2026-08-04
需求：UX-30，以及“所有格式只有点击保存才写入”的明确保存规则
结论：实现完成，等待下一安装包复测。

## 本阶段完成

- JavaScript、TypeScript、Python、Rust、Go、Java/Kotlin、C/C++/C#、Shell/PowerShell、SQL 与 Web 源码继续统一使用 CodeMirror。
- 在原有行号、语法高亮、括号匹配、自动缩进、查找替换、跳行、撤销重做基础上，新增语言关键字、HTML 标签和当前文档词补全。
- 新增轻量诊断：行尾空白、超过 200 字符的长行，以及 HTML 中会被安全预览移除的危险元素、内联事件和外部资源。
- 补全最多扫描 512 KiB，诊断最多扫描 1 MiB，文档词候选最多 120 项，避免大源码文件输入卡顿。
- `.html/.htm` 默认进入源码模式，可切换到安全网页预览；CSS、Vue 与其他代码格式不伪装成可执行网页。

## HTML 预览安全边界

- 使用 `DOMParser` 结构化解析，移除脚本、内联事件、iframe、object、embed、base、link、meta 和外部 URL 属性。
- iframe 使用空权限 `sandbox` 与 `referrerpolicy=no-referrer`。
- 预览文档注入严格 CSP：默认、脚本、连接、媒体、对象、子框架、表单提交和 base URI 均禁止；图片仅允许内嵌安全位图数据，样式只允许文档内联样式。
- 预览当前内存草稿，不读取远程资源、不执行源码、不改变文件签名，也不触发保存。

## 保存合同纠正

- TextEditor 已移除 1.5 秒防抖自动写盘和设置页“TXT 自动保存”入口。
- 输入、补全、诊断和预览只更新标签草稿；只有保存按钮或 `Ctrl+S` 才调用可靠写入命令。
- 保存仍携带源签名；外部修改冲突时保留当前草稿并阻止覆盖。
- 旧配置字段暂时只为配置兼容保留，不再驱动 TextEditor 写盘，也不在设置页展示。

## 自动检查

- `npm.cmd run build`
- `npm.cmd run check:code-html-workspace`
- `npm.cmd run check:code-editor-theme-contract`
- `node scripts/check-format-contract.mjs`
- `npm.cmd run check:r1-release-capability-matrix`
- `npm.cmd run check:d2-safe-degradation-contract`
- `npm.cmd run check:text-workspace-layout`
- `npm.cmd run check:current-development-audit`
- `npm.cmd run audit:prod`（PostCSS 传递依赖已在锁文件内提升到 `8.5.25`，结果为 0 漏洞）

## 安装包复测

1. HTML 首次打开为源码模式；安全预览能显示常规排版，但脚本、事件、网络图片、外部样式、iframe 和表单提交均不生效。
2. 在预览模式修改前的草稿可见，切回源码内容不丢失，未点击保存时磁盘文件不变。
3. 十类代码格式有可用的关键字和文档词补全；HTML 输入 `<` 后有标签候选。
4. 行尾空白、超长行和 HTML 危险能力有轻量诊断，512 KiB 以上源码输入仍保持可用。
5. 设置页不再出现 TXT 自动保存；编辑后等待、切换预览或普通窗口焦点变化均不会自动写盘。
6. 九主题下源码、补全菜单、诊断标记、光标、选区和行号均清晰可辨。

## 下一步

进入 UX-31：收紧 XLSX 工作区布局和冻结区域视觉，重写“高级数据对象 / MultiAxisPivot / 审计详情”等面向用户的说明，并确保窄窗口不挤压核心表格。
