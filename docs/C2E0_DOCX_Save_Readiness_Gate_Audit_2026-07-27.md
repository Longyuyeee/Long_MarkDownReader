# C2E0 DOCX 保存准备门禁审计

> 审计日期：2026-07-27
>
> 阶段范围：冲突检测与可靠另存的只读准备门禁
>
> 结论：C2E0 已完成；C2E 仍未验收，DOCX 保存命令、可保存字节和原件覆盖继续禁用

## 1. 环境结论

当前机器已验证 Microsoft Word、WPS Writer `12.1.0.26895` 与 LibreOffice Writer `26.2.4.2`。运行时报告消费 `fixtures/docx/producers/matrix.json`，真实生产者矩阵为：

| 生产者 | 状态 |
| --- | --- |
| Microsoft Word 16 | 已完成真实创建、匿名化、只读重开与解析回归 |
| WPS Writer 12.1.0.26895 | 已完成真实创建、隐私处理、只读重开与解析回归 |
| LibreOffice Writer 26.2.4.2 | 已完成真实导出、隐私扫描、原程序重开与解析回归 |

因此本批只实现保存准备审计，不调用 `reliable_write`，不生成或返回可保存 DOCX，不创建目标文件。

## 2. 结构化报告

新增 Tauri 命令：

- `audit_docx_save_readiness`

输入包括知识库、源 DOCX、拟另存文件名、读取时源签名和 C2A～C2D 隔离输出摘要。输出 `DocxSaveReadinessReport`，包含：

- 当前源签名是否仍与读取快照一致；
- 源文件 SHA-256 与隔离输出摘要握手；
- 拟另存目标路径、是否存在、是否与源文件相同；
- 已有和缺失的真实生产者证据；
- 稳定 blocker 列表；
- `writeAttempted=false`；
- 审计前后源文件与拟另存目标是否保持不变。

报告状态固定为 `blocked_readiness_only`。

## 3. 稳定阻断原因

当前门禁可以报告：

- `source_signature_stale`
- `source_overwrite_forbidden`
- `target_already_exists`
- `docx_save_command_not_enabled`

路径仍由 `WorkspaceGuard` 限制在知识库内，拟另存文件名必须是单一合法 `.docx` 文件名；父目录跳转、路径分隔符、控制字符、Windows 禁用字符和错误扩展名在进入审计内核前拒绝。

## 4. 不写入证明

回归覆盖：

- 不存在的目标在审计后仍不存在；
- 已存在目标的字节在审计前后相同；
- 源文件字节、摘要和签名在审计前后相同；
- 陈旧源签名返回结构化 blocker，不触发写入；
- 源/目标同一路径返回覆盖阻断；
- 非法隔离输出摘要和非法文件名被拒绝；
- 命令未注册任何 `save_docx` 或 `write_docx` 路径。

## 5. 最终仓库门禁

- DOCX 命令层定向回归 `3/3` 通过；
- 当前 Rust 功能测试 `312/312` 通过，性能测试 `1/1` 通过；
- 前端生产构建、Vue 类型检查及全部格式、主题、图谱、PDF、工作簿和 XLSX 契约通过；
- 真实 Tauri 桌面证据检查 `35/35` 通过，27 张截图证据完整；
- 生产依赖审计为 0 个漏洞；
- Tauri Debug 无打包构建成功生成桌面应用。

构建只保留既有的大分包体积警告，不影响本批验收。

## 6. 阶段判定

C2 当前进度继续为 **4/5**。C2E0 只完成 C2E 的只读准备门禁，不满足 C2E 的可靠另存、三类生产者重开和真实桌面闭环退出条件。

三生产者证据已补齐。下一步进入 C2E 可靠另存闭环；在无覆盖写入、写后语义复读、三生产者重开和真实桌面验收完成前，不得删除 `blocked_readiness_only`，不得接入 UI 保存入口。

> 后续状态（2026-07-27）：C2E 已完成可靠另存、落盘语义复读、用户入口和 Word/WPS/LibreOffice 输出复开；当前结论见 `docs/C2E_DOCX_Reliable_Save_Audit_2026-07-27.md`。本文件保留为 C2E0 历史门禁记录。
