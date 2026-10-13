# 全界面改版：页面级收口与展示

2026-10-13，分支 `codex/v110-editor-shell`，接续 PR #48。本文是本轮页面状态的最新结论；此前逐页文档中的“下一页面”是历史接续记录。

## 当前结论

已完成批准的 R2/R3 页面布局接续和本轮发现的界面问题修复，可以打开当前开发版进行用户评审。范围为 `src/views` 的 27 个页面和组件中的 GraphView，共 28 个页面级工作区，另包括共享导航、参考、工作现场、集合、历史等流程。不是所有格式原生读写、性能、升级安装的全量验收，不表示 1.1.0 封板或发布；运行版本仍为 1.0.26。

## 覆盖与证据

证据均在 `docs/evidence/`。浏览器脚本加载实际 Vue 组件，原生 IPC 使用隔离夹具；截图不是静态设计图，但不能替代原生输出证据。

| 页面/流程 | 已完成的本轮页面检查 | 证据目录（前缀 v110-） |
| --- | --- | --- |
| 资料库、工作台、收集箱、快速笔记、外部 Markdown | 导航/搜索、编辑工具、目标目录/模板、保存失败留稿、窄窗口 | shell-r3、workflow-redesign、temp-redesign |
| 参考、工作现场、智能集合、历史 | 摘录插入、现场管理、集合条件、历史上下文；主题与外观保留 | workflow-redesign、history-ownership、display-preferences |
| PDF | 页面/搜索/批注工具、专用面板、元数据及水印草稿保留 | pdf-redesign、pdf-panel-drafts |
| DOCX / PPTX | 阅读、目录/备注、编辑面板、草稿保留/失败边界、窄窗口 | docx-redesign、pptx-redesign、pptx-panels |
| ODT / ODS / ODP、外部 Office、旧 Office | 原只读/副本边界、详情、窄窗入口与失败恢复 | odt-redesign、odf-redesign、office-handoff |
| 文本/HTML、JSON/JSONC、YAML、XML/SVG、TOML、日志 | 工具命名、结构/诊断、源码/预览、筛选、草稿与窄容器布局 | text/json/yaml/xml/toml/log-redesign |
| Table、Workbook | 四类视图、工作表、格式/结构/规则、打印/区域/连接面板可达；数据验证中文表单 | table-redesign、workbook-redesign、workbook-panels-layout、workbook-print-layout、workbook-linked-layout、workbook-validation-form |
| OPML、Canvas、Mermaid、Draw.io、知识图谱 | 工具/属性/页面/搜索不在窄窗消失，局部编辑和视图操作 | mindmap/canvas/diagram/drawio/graph-redesign |
| 图片、视频 | 图片编辑/副本入口；实际 WebM 解码、播放暂停、静音、循环、倍速 | media-redesign、video-ui |
| 设置、格式能力 | 八分类、19 预设、六风格、色调与保存边界完整可见 | settings-redesign、capabilities-redesign、display-preferences |

## 最后补查

- `test-pptx-panel-drafts.mjs`：成功基线夹具下进入实际长面板，编辑文本/字号/形状、调整幻灯片顺序，关闭重开值不丢失；补丁验证故意失败后输入仍保留，原文件保存仍禁用。查看了 480×650 的实际页面截图。没有将模拟基线当作真实 OOXML 验证。
- `test-video-ui-browser.mjs`：Canvas/MediaRecorder 生成测试 WebM，实际播放器解码及操作通过。图片原回归再次通过。字幕与原生范围流不在本证据范围。
- 完整日常流程连续两次通过，资料库外壳复跑通过；`npm run build`（含 vue-tsc）通过。
- 本轮纠偏：PDF 重试加载不能覆盖用户输入；参考选择不能丢掉键盘移动后的插入位置；工作簿数据验证明确写“立即写回”，未将原本直接保存伪装成草稿。
- 没有移除既有读写、另存、导出或高级工具，没有降低原生保存门禁。未把没有测试到的能力登记为通过。

## 展示与后续

使用当前仓库构建的开发程序及独立示例资料库展示，不覆盖已安装软件、用户资料库或现有配置。示例文件可编辑，不是发行包。

### 实际桌面启动后的纠偏

`cargo build --locked --manifest-path src-tauri/Cargo.toml` 通过，启动本仓库 debug 程序和独立示例资料库。通过 Windows 窗口截图查看真实主编辑页面，发现 `LibraryMode` 使用了未注册的 `NPopover`，菜单直接铺在正文上方。此前浏览器夹具注册了整个 Naive UI，掩盖了正式入口缺陷；因此仅以夹具通过下页面完成结论不充分。

已增加 `NPopover` 本地引用；将正式入口的 25 个全局组件抽为共享注册函数，20 个浏览器夹具改用相同注册边界。增加全源码组件注册检查，进一步查出 JSON 范围读取/搜索进度条缺少 `NProgress` 引用并修正；580 处组件用法现已检查通过。没有在生产中注册整套组件来遮盖依赖问题。

重新查看同一原生窗口，文档操作恢复为紧凑按钮，正文空间恢复；主编辑/完整工作流程在正式注册边界下重新通过。新增断言要求默认菜单不可见、没有未解析的 `n-popover`、文档行高度小于 90px。展示使用的示例库和配置位于被忽略的 `release-artifacts/ui-review-20261013/`，不推送本机配置，也不修改旧安装目录。窗口已打开，仍属于开发版评审，不是封板声明。

纠偏后最终验证：17 套受注册边界影响的页面回归全部通过，另有完整工作流程、历史恢复和工作现场回归通过；最终 `npm run build` 通过。真实桌面已点击文档操作按钮并查看稳定展开状态，菜单内容正常、不再占据正文布局。

正式封板还需要：原生保存/复读及多窗口场景的集成回归；复杂 Office/大图性能验收；审计历史合同（E2B、M8-1、SVG 格式计数、DOCX 旧阶段文字）与现状差异，不为绿灯倒改需求；核实 F4 文本历史范围和 F5 网页收集的版本归属；最后统一版本合同、README 与 Release。当前没有发布新版本。
