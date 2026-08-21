# 用户界面术语清理审计（2026-08-21）

## 目标

- 清理工作台和知识图谱中的装饰性英文眉题。
- 从 PPTX 用户界面和错误提示中移除 `C4A`、`C4B`、`C5A` 等研发阶段编号。
- 保留 PPTX、OOXML、SHA-256、Markdown、Canvas 等必要格式或协议名称，不改动能力边界。

## 修正前与修正后

| 界面 | 修正前 | 修正后 |
| --- | --- | --- |
| 工作台 | `ACTIVE WORKSPACE`、`ACTIVITY`、`KNOWLEDGE HEALTH` 等 | 当前工作区、最近活动、关系概览等 |
| 图谱辅助面板 | `GRAPH HEALTH`、`LOCAL GRAPH`、`GOVERNANCE` | 关系健康、局部图谱、资料治理 |
| PPTX 编辑面板 | `C4B 隔离文本预览`、`C5A 隔离图片替换` 等 | 文本编辑预览、图片替换、幻灯片管理等 |
| PPTX 错误 | 暴露内部阶段号和“门禁” | 描述具体操作与安全检查失败原因 |

## 验收结果

- 静态门禁检查 5 个用户界面，15 个内部或装饰性英文标记均不存在，15 个直白中文标签均存在。
- 真实 Tauri 在 1280×820 打开工作台和 WPS 生成的真实 PPTX；工作台标签、PPTX 六个编辑面板标题和无页面溢出检查通过。
- PPTX 只执行隔离编辑准备，没有保存或写回；源文件 SHA-256 前后相同。
- 运行时错误为 0，生产构建通过。

证据：

- `docs/evidence/user-facing-terminology/workspace-plain-language.png`
- `docs/evidence/user-facing-terminology/pptx-plain-language.png`
- `docs/evidence/user-facing-terminology/runtime-evidence.json`

结论：术语清理达到下一补丁版本收口标准，不扩大任何格式的编辑或保存承诺。
