# X3-B2 XLSX 数组生产者与 Spill 诊断审计

更新日期：2026-07-30

阶段状态：**WPS 检查点完成，生产者矩阵为 `partial 1/3`；读取/显示继续标记为受限。**

## 1. 目标对齐

本阶段继续服务于“在统一管理器内安全阅读和基础处理日常工作簿”的初始需求。重点不是模拟完整 Excel，而是让包含数组公式的文件在原有右侧工作簿界面中具备：

- 可核验的真实桌面生产者证据；
- 可解释的缓存完整度和潜在占用冲突；
- 不破坏原文件的明确写入、结构迁移和计算边界。

## 2. 已交付能力

### 2.1 Spill 只读诊断

每个数组声明新增以下结构：

- `occupiedCellCount`：声明范围内实际序列化的单元格数；
- `missingCachedCellCount`：声明单元格数与 `<v>` 缓存数的差值；
- `foreignFormulaCellCount`：声明范围内除锚点外的公式数量；
- `spillStatus`：
  - `not_applicable`：传统数组；
  - `cached_complete`：动态数组缓存完整；
  - `cache_incomplete`：缓存存在空洞；
  - `potential_conflict`：非锚点位置发现外来公式。

右侧工作簿提示条和单元格悬浮说明会展示缓存完整度与诊断结果。该诊断只观察序列化 OOXML，不执行动态数组函数，也不推导期望 spill 尺寸。

### 2.2 WPS 真实桌面往返

审计入口：

```powershell
npm.cmd run audit:x3-b2-array-producers
```

执行协议：

1. 通过 `KET.Application` 启动 WPS Spreadsheets；
2. 打开 X3-B1 确定性输入样本；
3. 原生另存为 XLSX；
4. 关闭工作簿并退出应用；
5. 启动独立新会话，以只读方式复开输出；
6. 检查 Sheet 名、两个 `t="array"` 声明及声明范围；
7. 记录生产者身份、版本、build、SHA-256 和接纳结果；
8. 由 Rust 再次解析并验证传统/动态类型、公式、缓存和源字节不变。

本机证据：

| 项目 | 结果 |
| --- | --- |
| 自动化身份 | `KET.Application` |
| 可执行文件 | Kingsoft WPS `office6/et.exe` |
| 应用自报 | `Microsoft Excel 12.0/26895`，仅作兼容层字段，不作为 Excel 身份 |
| WPS 版本/build | `12.0 / 26895` |
| 原生保存 | 通过 |
| 应用退出后独立复开 | 通过 |
| 传统数组 `B2:B4` | 保持，缓存由 `2,0,0` 更新为 `2,4,6` |
| 动态数组 `D2:D4` | 保持，缓存由 `10,0,0` 更新为 `10,11,12` |
| LongEdit 反向语义读取 | 通过 |

## 3. 机器证据

- WPS fixture：`src-tauri/tests/fixtures/workbook/array-formula-wps-spreadsheets.xlsx`
- fixture manifest：`src-tauri/tests/fixtures/workbook/array-formula-wps-spreadsheets.json`
- 生产者矩阵：`docs/evidence/x3-b2-xlsx-array-producers/matrix.json`
- 自动化审计：`scripts/run-x3-b2-array-producer-audit.ps1`
- 机器合同：`shared/xlsx-formula-capabilities.json`

证据 JSON 使用 UTF-8 无 BOM 写入，并由工作簿合同验证 SHA-256，防止样本和 manifest 漂移。

## 4. 审计边界

- WPS 证据是对确定性输入样本的真实桌面“打开—另存—退出—复开”，不是声称该文件最初由 WPS 创建。
- 本机没有真实 Microsoft Office `EXCEL.EXE`，不能把被 WPS 接管的 `Excel.Application` 当作 Excel。
- 本机没有 `soffice.exe`，LibreOffice Calc 保持环境阻断。
- 因此生产者矩阵为 `1/3 partial`，读取/显示仍是 `limited`。
- `potential_conflict` 只是可靠的序列化结构信号，不等同于 Excel 的 `#SPILL!` 计算结果。
- 数组内容、样式、合并、行列结构迁移和本地重算继续阻断。

## 5. 下一步

### X3-B2 剩余外部证据

1. 在具备正版 Excel 的机器执行相同保存、退出、独立复开和 LongEdit 复读协议。
2. 在具备 LibreOffice Calc 的机器执行无头保存、进程退出、独立复开和 LongEdit 复读协议。
3. 比较三者在 `cm`、函数前缀、缓存空洞、扩展元数据和声明范围上的差异。
4. 达到 `3/3` 后才评估将数组读取/显示从“受限”提升为“支持”。

### 后续代码阶段 X3-B3

- 增加缓存值类型分布和错误缓存诊断；
- 将潜在冲突定位到具体单元格地址；
- 为真实生产者样本增加明/暗、正常/紧凑和范围跳转桌面视觉证据；
- 仍不开放 spill 计算或数组公式写回。

## 6. 收口门禁

`npm.cmd run ci:check` 已通过：

- 前端类型检查与生产构建通过；
- 工作簿合同、fixture SHA-256 和全部格式证据合同通过；
- Rust 功能测试 `380/380`，性能测试 `1/1`；
- 100 MiB PDF range 基准 `55 ms`；
- 生产依赖审计 `0` 个漏洞。

保留的提示只有既有前端大 chunk 提示和 Windows Rust 增量目录清理警告，均不影响门禁结果。
