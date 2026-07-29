# X3-B6 XLSX 数组公式生产者矩阵原子收口审计

> 日期：2026-07-30
> 阶段：X3-B6
> 结论：双包原子收口能力完成；真实矩阵仍为 `partial 1/3`

## 1. 阶段目标

X3-B5 已能逐包导入 Microsoft Excel 或 LibreOffice Calc 证据，但最终从 1/3 提升到 3/3 仍存在一个系统级风险：第一包成功、第二包失败时，仓库会停在中间状态，需要人工判断哪些 fixture、manifest 和契约已经变化。

X3-B6 的目标是把最终关闭动作提升为矩阵级事务：

1. 两个包必须来自经人工确认的正版 Microsoft Excel 与 LibreOffice Calc 环境。
2. 两包先在 TEMP 隔离区逐一执行全部 B5 校验。
3. 隔离矩阵必须达到 3/3，能力契约必须进入“待发布审计”。
4. 只有完整候选成立后，才向目标提升四个证据文件、矩阵和能力契约。
5. 任一校验或提升步骤失败，恢复原矩阵/能力契约并清理新目标。
6. 生产者矩阵完成不自动开放数组计算或写回。

## 2. 当前环境审计

`audit-x3-b6-array-producer-environment.ps1` 只读取注册表、环境变量、PATH 和标准安装位置：

- 不激活 COM 应用；
- 不打开工作簿；
- 不写用户文件。

本机结果：

| 生产者 | 状态 | 证据 |
|---|---|---|
| Microsoft Excel | 阻断 | 固定 CLSID 的 `LocalServer32` 指向 Kingsoft/WPS `et.exe`，不能计作 Microsoft Excel |
| WPS Spreadsheets | 已验证 | X3-B2 真实 native save + 独立复开证据 |
| LibreOffice Calc | 阻断 | 标准 64/32 位安装目录、环境变量和 PATH 均未发现 `soffice.com` |

机器证据保存于 `docs/evidence/x3-b6-xlsx-array-producer-closure/environment.json`。因此当前仍是可信的 1/3，不能在本机执行真实关闭。

## 3. 原子关闭实现

新增 `close-x3-b6-array-producer-matrix.ps1`：

1. 要求 `-ConfirmTrustedProducers`。
2. 要求起始矩阵严格为 1/3，Excel 与 LibreOffice 均为环境阻断。
3. 拒绝覆盖任何已有 Excel/LibreOffice fixture 或 manifest。
4. 复制当前矩阵和能力契约到唯一 TEMP 目录。
5. 调用 B5 导入器，在隔离目标依次验证两个包。
6. 检查隔离矩阵为 `verified 3/3`，共享契约为 `producer_matrix_verified_pending_release_audit`。
7. 检查四个证据文件完整存在。
8. 先创建全部新证据，再通过带备份的文件替换提升矩阵和能力契约。
9. 任一失败路径恢复旧矩阵/契约，并删除已创建的证据目标。

关闭器不会修改公开兼容矩阵文档，也不会把计算或写回状态改为 supported。3/3 只意味着生产者阅读兼容证据齐全，仍需单独发布审计。

## 4. 自动化验证

`test-x3-b6-array-producer-matrix-closure.ps1` 全程使用 TEMP 隔离目标和标记为 `synthetic-closure-test-only` 的协议测试数据，绝不把测试数据登记到仓库生产者矩阵。

覆盖两个路径：

### 4.1 合法双包

- Excel 包通过全部 B5 门禁；
- LibreOffice 包通过全部 B5 门禁；
- 隔离矩阵由 1/3 原子提升为 3/3；
- 四个 fixture/manifest 同时存在；
- 能力契约同步进入 3/3 待发布审计。

### 4.2 第二包损坏

- 第一包可在内部 staging 中通过；
- 第二包输出摘要漂移并被拒绝；
- 目标矩阵 SHA-256 不变；
- 目标能力契约 SHA-256 不变；
- 目标 fixture 目录仍为空。

这证明“先完整验证、后一次提升”的行为真实成立，而不是只检查脚本文本。

## 5. 完整回归

`npm.cmd run ci:check` 已通过：

- 生产构建、Vue 类型检查与全部机器契约通过；
- X3-B5 单包 5 类拒绝和 2/3 合法提升继续通过；
- X3-B6 合法双包 3/3 原子提升与第二包失败不落盘通过；
- Rust 功能测试 `383/383`；
- Rust 性能测试 `1/1`，复杂工作簿约 `4.0 s`；
- PDF 100 MiB 范围读取基准 `65 ms`，请求约 `255.9 KiB`；
- 生产依赖审计 `0` 漏洞。

保留既有非阻断提示：Vite 大分包警告，以及 Windows/Rust 增量编译目录收尾偶发“拒绝访问”警告；测试结果和退出码均正常。

## 6. 外部关闭命令

先分别在可信机器使用 X3-B5 导出命令生成两包，并人工核对传输来源。然后在接收机执行：

```powershell
npm.cmd run close:x3-b6-array-matrix -- `
  -ExcelBundlePath C:\evidence\x3-b5-microsoft-excel.zip `
  -LibreOfficeBundlePath C:\evidence\x3-b5-libreoffice-calc.zip `
  -ConfirmTrustedProducers

npm.cmd run ci:check
```

成功后应审计并提交：

- `array-formula-microsoft-excel.xlsx/.json`
- `array-formula-libreoffice-calc.xlsx/.json`
- 生产者矩阵；
- `shared/xlsx-formula-capabilities.json`；
- 3/3 发布审计文档。

证据 ZIP、TEMP 目录和测试合成数据不得提交。

## 7. 当前能力结论

| 项目 | X3-B6 后状态 |
|---|---|
| 数组公式阅读和诊断 | 受限可用 |
| 冲突与错误缓存定位 | 受限可用 |
| 真实生产者矩阵 | 1/3 partial |
| 双包最终关闭工具 | 已验证 |
| 本机真实关闭条件 | 不满足 |
| spill 预期计算 | 阻断 |
| 数组公式写回 | 阻断 |

本阶段提升的是证据治理和发布安全，不是通过测试数据冒充真实 Office 支持。

## 8. 后续方向

外部环境到位时，X3-B6 直接执行双包关闭和 3/3 发布审计。

等待外部环境期间，下一本机阶段建议进入 X3-C1：

1. 建立外部工作簿公式引用的只读清单；
2. 显示来源工作簿、工作表、引用位置和离线/失效状态；
3. 对外部引用提供搜索与单元格定位；
4. 保持外部工作簿计算、缓存刷新和写回阻断；
5. 继续复用原有右侧 XLSX 工作面，不增加脱离文件管理结构的独立页面。
