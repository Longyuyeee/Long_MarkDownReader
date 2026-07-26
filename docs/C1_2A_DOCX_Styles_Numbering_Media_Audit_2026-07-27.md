# C1-2A DOCX 样式、编号与媒体阅读收口审计

更新日期：2026-07-27

开发分支：`codex/a4-format-closure`

对应需求：`FR-OFFICE-001`

## 1. 结论

DOCX 结构化阅读已从“直接样式 ID + 图片占位”推进到 **C1-2A**：

- 解析 `styles.xml` 的段落样式名称、`basedOn` 继承和 `outlineLvl`，可识别自定义/继承标题；
- 解析 `numbering.xml` 的 `numId → abstractNumId → ilvl/numFmt`，区分项目符号与有序列表；
- 解析 `word/_rels/document.xml.rels` 的内部图片关系；
- 对通过路径、类型、大小和文件签名门禁的内嵌图片，在原 Library 右侧工作面真实显示；
- 外部图片关系、SVG 和未知媒体、超预算或签名不符图片保持占位并给出警告；
- DOCX 原文件仍然只读。

本批没有完成 C0 三类真实生产者矩阵。本机审计确认 Microsoft Word、WPS Office、LibreOffice 命令均不可用，因此自动化样本仍是合成 OOXML 合同 fixture，不能冒充真实生产者证据。

## 2. 需求与用户价值对齐

| 用户目标 | C1 首批 | C1-2A 本批 |
|---|---|---|
| 在统一管理器阅读 DOCX | 标题、段落、列表、表格和图片占位 | 继续保留 |
| 目录可靠性 | 只识别直接 Heading/Title 样式 ID | 增加自定义样式、继承和 outline level |
| 列表语义 | 仅按 `ilvl` 显示统一圆点 | 根据编号定义区分 bullet/ordered |
| 文档图片 | 只显示对象数量 | 安全白名单内图片真实预览 |
| 能力透明 | 高级对象只读画像 | 增加样式、编号、可预览图片数量及媒体降级原因 |
| 基础编辑 | 未开放 | 仍未开放 |

这一步直接增强日常阅读，不改变“只有保真证据完成后才允许编辑”的开发顺序。

## 3. 样式解析边界

支持：

- paragraph style；
- `styleId` 和 `name`；
- `basedOn` 继承，最多追踪 16 层；
- 循环继承检测；
- `outlineLvl 0～8` 映射到标题层级 1～9；
- Heading/Title/标题命名回退。

暂不支持：

- 字符、表格和编号样式的完整级联；
- 主题字体、字号、颜色、间距、缩进和分页属性的视觉还原；
- 潜在样式、条件表格样式和复杂本地化映射；
- Word/WPS 字体度量或分页等价。

## 4. 编号解析边界

当前解析 `abstractNum`、`lvl`、`numFmt`、`num` 和 `abstractNumId`，把列表分为：

- `bullet`：显示项目符号；
- `ordered`：显示有序列表语义。

当前不计算真实序号、起始值、重启规则、多级编号文本、图片项目符号或自定义字符。无法证明真实编号时保留结构与层级，不伪造 Word 排版。

## 5. 图片安全模型

图片只有同时满足以下条件才进入 WebView：

1. 来自 `document.xml` 中 `r:embed/r:id`；
2. 关系为内部关系，不接受 `TargetMode="External"`；
3. 规范化目标必须位于 `word/media/`，拒绝越界；
4. 仅允许 PNG、JPEG、GIF、WebP、BMP；
5. 单图不超过 4 MiB；
6. 单文档最多预览 32 张；
7. 预览原始总量不超过 12 MiB；
8. 文件魔数必须与声明类型一致。

SVG 当前不进入 `data:` URL，避免未经清理的脚本/外部资源进入 WebView。失败媒体只生成占位和明确警告，不阻塞其他正文阅读。

## 6. 验证与桌面证据

新增回归覆盖：

- 自定义标题样式继承到 Heading2；
- `numId/abstractNumId/numFmt` 解析为 bullet；
- 内部图片关系解析为 `word/media/image1.png`；
- 外部关系不进入图片模型；
- PNG/JPEG/GIF/WebP/BMP 文件签名白名单；
- SVG 伪装或扩展名/内容不一致被拒绝。

真实 Tauri fixture 同时包含：

- 自定义 `BriefHeading → Heading1`；
- bullet numbering；
- `rId5 → media/image1.png`；
- 480×150 PNG；
- 修订、域、表格和正文搜索标记。

桌面断言图片 `naturalWidth === 480`，并继续确认 Library 外壳、右侧嵌入、目录、列表、表格、搜索命中和高级对象警告。证据：

- `docs/evidence/a5-stage-a/c1-docx-structured-reading.jpg`
- `docs/evidence/a5-stage-a/audit-manifest.json`

最终 `npm run ci:check` 全量通过：Rust 功能测试 294/294、性能测试 1/1、真实桌面检查 33/33、25 张截图、格式合同 30 类格式/62 个扩展名、生产依赖 0 个漏洞。100 MiB PDF 范围基准为 54 ms、约 255.9 KiB 请求量；仅保留既有 Vite 大分包非阻断提示。

## 7. 风险与未完成项

- 没有 Microsoft Word、WPS Office、LibreOffice 真实 fixture；
- 不渲染浮动定位、裁切、旋转、环绕、DrawingML 尺寸和 VML 视觉属性；
- 图片当前按正文结构顺序显示，不等于页面布局；
- 不展示页眉页脚、脚注/尾注和批注正文；
- 不接入全局知识索引；
- 不创建、另存或覆盖 DOCX。

## 8. 下一步

### C0-2：真实生产者矩阵

需要从具备相应软件的受控环境生成或收集可再分发样本，保存软件版本、生成步骤、许可证、原程序截图、预期结构和哈希。真实样本进入仓库前不得将 C0 标记为完成。

### C1-2B：阅读收口

1. 页眉页脚、脚注、尾注和批注的只读内容；
2. 合并单元格、分页标记和基础段落/字符样式摘要；
3. 图片尺寸、替代文本和基础内嵌布局；
4. DOCX 全局索引与块/表格定位；
5. 三生产者真实桌面视觉矩阵。

完成 C0/C1 证据后，再进入 C2 局部 OOXML 基础编辑，不重建整份文档。
