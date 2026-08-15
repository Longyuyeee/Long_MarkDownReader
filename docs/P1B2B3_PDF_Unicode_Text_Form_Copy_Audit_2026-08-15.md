# P1-B2B3 PDF 中文文本表单可靠副本审计

审计日期：2026-08-15

阶段状态：中文单行文本闭环完成，下一步扩展复选框与单选字段

## 需求对齐

PDF 表单编辑仍位于初版左侧资料库、右侧阅读/编辑区中的原 PDF 侧栏，不新增窗口、路由或另一套视觉体系。用户仍需先隔离验证，再保存为同目录新副本；源 PDF 和已有目标均不覆盖。

## 实现与安全边界

- 规范字段 `/V` 改用带 BOM 的 UTF-16BE PDF 文本字符串，检查器同步按 UTF-16BE/LE 复读。
- Widget 外观使用 Type0 + CIDFontType0、Identity-H 和 ToUnicode CMap，复制、搜索与页面显示使用同一字符映射。
- 内置 Noto Sans CJK SC 2.004 来自 notofonts/noto-cjk 官方仓库，保留 SIL Open Font License 1.1；字体原件 SHA-256 为 `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`。
- 每份 PDF 只嵌入本次值实际使用的字形，真实中文样本输出小于 1 MiB；不会把 15.7 MiB 全字体复制进用户文件。
- 当前开放中文、拉丁、数字、常用标点和内置字体覆盖的非复杂字形。控制字符、缺失字形及需要复杂塑形的文字继续明确阻断，避免生成视觉错误副本。
- 加密、签名、XFA、JavaScript、动作、重复字段、结构歧义、只读、密码、多行及外部 PDF 边界保持不变。

## 验证结论

真实 Tauri WebView2 在 1280×800 与 720×680 下完成 `Alice Example -> 中文编辑 QA`、隔离验证、可靠另存与目标复开；根级横向溢出为 0，运行时错误为 0。规范字段值、Widget 正常外观、源 SHA-256 不变均通过。

目标 PDF 另经 Poppler 真实渲染，字段矩形内存在可见字形像素；渲染截图与结构化证据位于 `docs/evidence/p1b2b3-pdf-unicode-form-copy/`，不包含用户内容。

## 下一步

按计划进入 `Btn`：先区分复选框与单选组，枚举每个 Widget `/AP /N` 的真实导出状态，再同步写入规范 `/V` 与 Widget `/AS`。不得把两类按钮合并成布尔值，也不得依赖 `/NeedAppearances`。
