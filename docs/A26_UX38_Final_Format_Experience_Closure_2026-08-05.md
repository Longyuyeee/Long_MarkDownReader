# UX-38 全格式体验最终收口

## 结论

UX-38 全格式体验阶段已按有界能力收口。机器矩阵覆盖注册表中的 41/41 种格式、10 个实际使用的体验档案和 12 个体验维度，不再存在 `pending` 项或无人引用的占位档案。

120 个档案维度项的最终分布为：75 个 `accepted`、32 个 `partial`、7 个 `referenced`、6 个 `not-applicable`。这里的 `partial` 与 `not-applicable` 不是漏项：它们用于保留完整 Excel/Word/PowerPoint 等价、只读 ODF、PDF 原文只读、Draw.io 复杂大图以及外部 Office 依赖等真实能力边界。每个档案都已写入边界说明并绑定现有证据路径。

## 阶段覆盖

- UX-38A：24 种轻量源码和结构化格式的真实桌面批量加载。
- UX-38B：统一工作区标签可读宽度、滚轮横移和无原生轨道。
- UX-38C：CSV/TSV/Table/XLSX/ODS 数据工作区与返回上下文。
- UX-38D：PDF、DOCX/ODT、PPTX/ODP 文档媒体工作区。
- UX-38E：Canvas、Draw.io、Mermaid、OPML 图形工作区。
- UX-38F：DOC/XLS/PPT/WPS/ET/DPS 外部依赖工作区。

## 机器事实

`shared/ux38-final-closure.json` 固定格式数、档案数、维度数和状态计数；`scripts/check-ux38-final-closure.mjs` 验证：

- 格式注册表与矩阵严格 41/41 对齐。
- 所有档案均被至少一种格式引用，所有证据路径存在。
- 使用中的 120 个维度项没有 `pending`。
- 每个非全接受档案都有明确能力边界。
- `releaseCandidate=false` 保持不变。

## 下一步

进入 UX-39 无签名打包与安装回归收口：基于当前 `main` 重新构建 1.0.3 安装包，在隔离环境复测启动、控制台隐藏、设置、标签、表格、文档、图形和外部 Office 工作区。没有真实签名时只发布无签名社区构建，不得宣称 Authenticode 已通过。
