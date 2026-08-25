# M1A4A XLSX 条件格式可视编辑器交接

日期：2026-08-25

状态：主体已实现，真实桌面最终复验待完成

基线提交：`773f830`（开始开发时 `main == origin/main`）

## 已完成

- 基础 `cellIs` 与 `expression` 条件格式已从五轮以上文字输入改为单一可视表单。
- 表单提供中文规则类型、八种比较方式、一/二阈值、五种色板、停止后续规则开关、应用范围和实时预览。
- 色阶、数据条和图标集继续走“高级规则”入口，没有降低既有能力或扩大安全子集。
- 修复数据工具入口遗漏条件格式选区的问题；只有条件格式的单元格现在也能打开“数据、Table 与规则”。
- 单单元格范围从 `B2:B2` 规范为 `B2`。
- 新增 M1A4A 策略、静态合同、真实 Tauri/WebView2 捕获脚本和 npm 命令。

## 真实测试进度

真实样本为 `src-tauri/tests/fixtures/workbook/compatibility-baseline.xlsx`，测试只修改临时副本。

| 检查 | 预期 | 当前实际 |
| --- | --- | --- |
| 目标规则 | `Summary!B2` 既有 `greaterThan 1000` | 已从 OOXML 与真实桌面确认 |
| 编辑器可达 | B2 可打开统一表单 | 已通过；测试过程中发现并修复数据工具入口遗漏 |
| 可视字段 | 2 类规则、5 种样式、预览 | 已通过 |
| 编辑中写盘 | 临时文件 SHA-256 不变 | 已通过 |
| 应用与复开 | 写为 `between / 1000 / 2000 / green_fill`，刷新后复读一致 | 已运行通过至窄屏检查之前 |
| 1280×800 | 弹窗完整可用 | 已生成过程截图，但本次未登记为最终证据 |
| 560×720 | 弹窗不越界且内部可滚动 | 修正前底部超出 23.5 px；已把 Teleport 弹窗样式从 scoped `:deep` 改为 `:global`，修正后复验被暂停 |
| 运行时错误 | 0 | 最终完整运行待确认 |

`npm run build` 在主体实现和入口修复后通过。最后一处全局弹窗 CSS 修改之后尚未重新执行生产构建。`npm run check:post-v115-m1a4a-xlsx-conditional-editor` 已通过。

## 新电脑接手顺序

1. 拉取 `main`，确认工作区干净并执行 `npm ci`（依赖未恢复时）。
2. 先运行 `npm run build`。
3. 运行 `npm run audit:post-v115-m1a4a-xlsx-conditional-editor`；它会重新生成 `docs/evidence/post-v115-m1a4a-xlsx-conditional-editor/`，不要沿用旧电脑未验收的单张截图。
4. 人工查看宽屏和窄屏截图，核对文字、色板、预览、按钮与内部滚动；同时检查 `interaction-evidence.json` 的哈希边界、复开字段和 `runtimeErrorCount=0`。
5. 若仍发生窄屏越界，先读取 `.conditional-format-modal` 的 computed `max-height/overflow-y` 和 Naive Card 内容区高度，再修 CSS；不要放宽验收尺寸。
6. 全部通过后将 M1A4A 标记完成，更新路线图、开发交接和证据清单并推送。
7. 随后进入 M1A4B：把条件格式与 Table 等对象操作纳入统一内存草稿、撤销/重做、脏状态和显式保存；本次“应用并写入文件”不能视为该边界已完成。

## 边界

- 本次不提升版本、不打包、不更新 README 或 Release。
- M1A4 整体未完成；M1A4A 也必须等待最后一轮真实桌面验收后才能关闭。
- 高级或未知条件格式继续使用既有高级入口、只读保持或阻断策略。
- 仓库真实样本必须保持 SHA-256 不变，所有写入只针对测试脚本创建的临时副本。
