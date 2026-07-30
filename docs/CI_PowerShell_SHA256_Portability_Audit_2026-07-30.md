# CI PowerShell SHA-256 兼容性恢复审计

> 日期：2026-07-30
> 基线：`d3029b3`
> 结论：新证据协议的哈希实现已脱离 `Get-FileHash`，本地完整质量门禁恢复通过。

## 1. 问题

远端连续五次 Quality Gate 失败。最新失败发生在 X3-B5 证据包拒绝测试，较早运行也在 S8-7E3G Excel 证据包拒绝测试中失败，错误均为 GitHub Windows Runner 无法识别 `Get-FileHash`。

这些失败不表示证据语义或产品功能错误，但意味着 `main` 不能视为绿色发布基线。继续开发前必须先恢复 CI。

## 2. 修复

- 新增 `scripts/powershell-sha256.ps1`。
- `Get-Sha256Hex` 使用 .NET `SHA256.Create()` 和只读文件流计算小写十六进制摘要。
- S8-7E3G、X3-B5、X3-B6 的测试、导入、导出和生产者验证脚本统一使用该 helper。
- Workbook 机器契约要求八个证据脚本加载共享 helper，并禁止重新出现 `Get-FileHash`。
- 在主动卸载 `Microsoft.PowerShell.Utility` 的环境中，helper 与原命令对同一文件得到完全一致的摘要。

## 3. 验证

- X3-B5：5/5 损坏包拒绝，合法沙箱包推进到 2/3。
- X3-B6：合法双包原子推进到 3/3，第二包损坏时目标保持 1/3。
- S8-7E3G-E：4/4 损坏 Excel 证据包拒绝，matrix 不变。
- 完整 `npm.cmd run ci:check`：通过。
- Rust 功能测试：`383 passed`。
- Rust 性能测试：`1 passed`。
- 生产依赖审计：`0 vulnerabilities`。

## 4. 能力边界

本修复只恢复证据基础设施和 CI 可移植性，不改变产品能力：

- Pivot 多层轴生产者矩阵仍为 `2/3`，等待真实 Microsoft Excel。
- 数组公式生产者矩阵仍为 `1/3`，等待真实 Microsoft Excel 与 LibreOffice Calc。
- 数组公式计算、spill 生成、数组写回和多层轴可靠保存继续阻断。
- 原文件覆盖继续阻断。

## 5. 下一步

远端 Quality Gate 通过后，绿色基线恢复。下一代码阶段仍按综合审计进入 F1/E2A：外部应用能力发现与统一外部打开；外部生产者证据作为并行门禁等待可信机器。
