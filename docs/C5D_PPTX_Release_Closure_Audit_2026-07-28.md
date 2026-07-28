# C5D PPTX 发布收口审计

> 审计日期：2026-07-28
> 分支：`main`
> 前置基线：C3A～C3D、C4A～C4E、C5A1/C5A2、C5B、C5C 已完成
> 结论：**C5D 已完成，PPTX 基础编辑阶段收尾；下一开发入口为 B2A PDF 拆分/提取。**

## 1. 本批交付

1. `shared/file-formats.json` 将 PPTX 从 `planned / preview-only / none` 对齐为 `supported / basic-edit / copy`，写入适配器登记为 `pptx`。
2. 能力说明完整列出文本/备注、基础字符样式、图片替代文本、单引用 PNG/JPEG 替换、白名单基础形状和幻灯片新增/复制/删除/排序。
3. 继续明确源演示文稿只读，结果仅另存同目录新副本；母版、动画、SmartArt、复杂图表和未知对象保持只读。
4. Library 嵌入式工作面显示统一能力徽标；PPTX 顶部统一显示“基础编辑副本 · 原文件不写回”。
5. 前端和 Rust 注册表新增 `edit` 能力与 `writer` 适配器一致性校验。
6. 清理 C4E 已完成后仍存在的“等待外部生产者复开”旧文案。

## 2. 发布能力矩阵

| 能力 | 发布状态 | 保存/安全边界 |
|---|---|---|
| 结构化阅读、搜索、定位、备注和放映 | 支持 | 不执行宏、动画或未知对象 |
| 文本/备注与基础字符样式 | 基础编辑 | 隔离补丁验证后另存新副本 |
| 图片替代文本、单引用 PNG/JPEG 替换 | 基础编辑 | 共享媒体和不支持编码阻断 |
| 白名单矩形、椭圆、线条新增/删除 | 基础编辑 | 复杂形状与未知对象只读 |
| 幻灯片新增、复制、删除、排序 | 基础编辑 | 维护顺序、关系、内容类型和独占备注 |
| 源文件覆盖 | 不支持 | 源 PPTX 始终只读，已有目标不覆盖 |
| 母版、动画、SmartArt、复杂图表 | 仅保真/只读 | 不开放编辑，不宣称 PowerPoint 等价 |

输出已经在 C4E、C5A2、C5B、C5C 分别通过 Microsoft PowerPoint、WPS Presentation 和 LibreOffice Impress 3/3 复开；C5D 不增加新的 OOXML 写入类型。

## 3. 桌面发布审计

真实 Tauri Debug WebView2 使用 WPS Presentation fixture 完成以下矩阵：

| 主题 | 正常 `1280×820` | 紧凑 `960×720` |
|---|---:|---:|
| 专业浅色 | 通过 | 通过 |
| 专业深色 | 通过 | 通过 |

自动化验证：

- 四个场景均显示 `PowerPoint 演示 · 基础编辑副本`。
- PPTX 顶部均显示“基础编辑副本 · 原文件不写回”。
- 正常尺寸显示安全详情；紧凑尺寸关闭覆盖式详情后，缩略图和完整主画布均位于视口内。
- Library、PPTX 工作面和页面均无横向溢出。
- 临时 WPS 源文件 SHA-256 前后不变。

证据目录：`docs/evidence/c5d-pptx-release-closure/`

- `professional-light-normal-1280.jpg`
- `professional-light-compact-960.jpg`
- `professional-dark-normal-1280.jpg`
- `professional-dark-compact-960.jpg`
- `audit-manifest.json`

## 4. 门禁

- `npm run check:format-contract`
- Rust `pptx_is_basic_copy_edit_and_globally_indexed`
- `npm run audit:c5d-pptx-release-closure`
- `npm run check:c5d-pptx-release-closure-evidence`
- 完整 `npm run ci:check`
- GitHub Quality Gate

## 5. 阶段判定与下一步

C5D 关闭后，PPTX 已达到“受限基础编辑 + 可靠新副本 + 应用内重开 + 三生产者复开 + 统一能力展示”的基础阶段退出条件。它不是完整 PowerPoint 等价编辑器，高级对象继续只读保真。

下一批执行 **B2A PDF 拆分/提取**：按显式页范围生成新 PDF，保持源文件不变，并验证页面顺序、资源继承、应用内重开和复杂/加密输入阻断。
