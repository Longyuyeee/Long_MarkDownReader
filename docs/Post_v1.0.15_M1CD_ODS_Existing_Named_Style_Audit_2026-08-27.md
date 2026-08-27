# M1C-D ODS 已有命名样式编辑审计

日期：2026-08-27

版本：`1.0.15`

结论：通过，M1C 在有界范围收口；下一阶段进入 M1D 媒体与结构化文本对象选择审计。

## 1. 开发目标

在不开放公式、自定义样式和源文件覆盖的前提下，让资料库内 ODS 的简单单元格可以引用文件中已经存在且通过安全解析的命名样式。编辑必须沿用内存草稿、撤销/重做、离开保护和可靠新副本。

## 2. 预期与实际

| 检查项 | 修正前实际 | 预期 | 修正后实际 |
| --- | --- | --- | --- |
| 样式能力 | 只完成继承模型探针，无用户编辑链路 | 枚举安全命名样式并编辑一个简单单元格 | `Overview!A1` 可从 `Default` 切换到 `Good` |
| 草稿与历史 | 无样式草稿 | 保存前不写盘，可撤销与重做 | 真实桌面完成 `Default -> Good -> Default -> Good`，源摘要不变 |
| 包保持 | 尚未证明真实 ODS ZIP 事务 | 仅修改 `content.xml`，其余成员逐字节保持 | 确定性自动样式引用通过结构、语义和成员保持复读 |
| 可靠保存 | 无样式保存命令 | 只另存不存在的新副本 | 新副本保存并重开为 `Good`，已有目标和源覆盖均拒绝 |
| 独立生产者 | 只有 Flat ODF 探针 | LibreOffice 独立复验输出 | Calc 转换的 A1 填充为 `FFCCFFCC`、文字为 `FF006600` |
| 窄窗口与运行时 | 未验证 | 960x720 无溢出、无运行时错误 | 两张真实 Tauri 截图通过，运行时错误 `0` |

## 3. 实现边界

- 只接受文件内可解析的 `table-cell` 命名样式；循环继承、缺失父级、未知属性和不安全颜色会被排除。
- 样式补丁创建确定性的自动样式引用，不创建用户自定义视觉属性。
- 目标由文件签名、单元格 ID 与样式摘要共同保护；陈旧目标、未知样式、自动样式名碰撞均安全拒绝。
- 公式、合并、重复单元格、复杂富文本、混合值/样式事务、外部 ODS、全部 ODP 和源文件覆盖继续关闭。

## 4. 真实证据

- 机器结果：[`evidence/post-v115-m1cd-ods-style-edit/audit.json`](./evidence/post-v115-m1cd-ods-style-edit/audit.json)
- 草稿截图：[`ods-style-draft.jpg`](./evidence/post-v115-m1cd-ods-style-edit/ods-style-draft.jpg)
- 副本重开截图：[`ods-style-copy-reopen.jpg`](./evidence/post-v115-m1cd-ods-style-edit/ods-style-copy-reopen.jpg)
- 审计命令：`npm run audit:post-v115-m1cd-ods-style-edit`
- 契约命令：`npm run check:post-v115-m1cd-ods-style-edit`

## 5. 阶段判断

M1C 已完成 ODF 风险基线、ODS 简单值可靠副本、公式/样式可行性审计和已有命名样式可靠副本。当前结果符合“先完成一段明确且可验证的工作，不宣称完整等价编辑”的原始方向。版本保持 `1.0.15`，`releaseCandidate=false`；下一步 M1D 先用真实媒体与结构化文本样本选择最值得补强的对象，不预设直接扩大写回范围。
