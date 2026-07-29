# X3-B5 XLSX 数组公式生产者证据交接审计

> 日期：2026-07-30
> 阶段：X3-B5
> 结论：跨机器证据闭环已实现；真实生产者矩阵仍为 `partial 1/3`

## 1. 需求与阶段目标

本阶段继续对齐“覆盖日常管理与基础编辑，并将内容成体系管理”的基础目标。数组公式属于 XLSX 兼容性与数据安全边界：在无法证明真实 Office 生产者往返稳定前，产品应能阅读、诊断和定位，但不能把局部解析能力宣传为完整 Excel 等价能力。

X3-B5 不扩展新页面，也不改变原有右侧 XLSX 工作面。它解决 X3-B2～B4 留下的外部环境阻断：

1. 在正版 Microsoft Excel 或 LibreOffice Calc 机器执行固定基线的原生保存。
2. 退出生产者，再用独立进程重新打开产物。
3. 用 LongEdit 自身解析器确认传统数组与动态数组声明仍可识别。
4. 导出可跨机器传递、摘要绑定且成员固定的证据包。
5. 在接收机严格校验后增量更新 1/3～3/3 矩阵。
6. 任一校验失败时不创建 fixture、不修改矩阵。

## 2. 本阶段交付

### 2.1 LongEdit 独立语义审计

新增 `xlsx-array-audit` Rust 二进制，直接复用产品的 OOXML 工作表解析路径，输出窄化、机器可读的数组语义报告。通过条件固定为：

- 工作表：`Array Boundary`
- 声明数：2
- 类型顺序：`legacy_array`、`dynamic_array`
- 范围：`B2:B4`、`D2:D4`
- 计算状态与写回状态仍为 `blocked`

外部产物仅有合法 ZIP/XML 结构不足以通过；必须能被产品当前版本实际重读。

### 2.2 双生产者执行与导出

`export-x3-b5-array-producer-evidence.ps1` 支持：

- `microsoft-excel`
- `libreoffice-calc`

Microsoft Excel 必须同时满足 `Excel.Application`、固定 CLSID、`EXCEL.EXE`、Microsoft Office 路径和非 Kingsoft/WPS 身份门禁。LibreOffice 必须使用 `soffice.com`、捆绑 `python.exe` 和 UNO；保存与复开使用不同的临时用户配置与进程。

证据 ZIP 必须恰好包含：

1. `manifest.json`
2. `producer.json`
3. `array-formula-{producerId}.xlsx`

manifest 绑定源码提交、固定基线大小/SHA-256、两个非 manifest 成员大小/SHA-256和安全声明。producer 绑定真实应用身份、两个会话标识、完整生命周期门、三次 LongEdit 语义快照和最终输出摘要。

### 2.3 严格导入与原子提升

`import-x3-b5-array-producer-evidence.ps1` 要求操作者显式传入 `-ConfirmTrustedProducer`。该参数表示操作者已在交接流程外确认来源机器和生产者真实可信；脚本仍会独立检查包内身份，不能用此参数绕过技术门禁。

导入端执行：

- ZIP 固定成员、重复成员与 50 MB 单成员上限检查；
- manifest、基线和成员摘要绑定；
- Excel/LibreOffice 身份排他校验；
- 原生保存、退出、独立复开、无修复提示、数组声明与语义复读门检查；
- 输出文件名、大小和摘要三方绑定；
- 接收机再次运行 `xlsx-array-audit`；
- 拒绝覆盖既有 fixture/manifest；
- fixture、producer manifest、矩阵与共享能力契约一并提升，失败时恢复原矩阵/契约并清理未完成目标。

矩阵按生产者增量更新。达到 2/3 时仍为 `partial`；只有 3/3 才转为 `verified`。共享能力契约同步记录验证数量；3/3 时进入“待发布审计”，不会自动开放计算、写回或直接改变公开兼容等级。

## 3. 负向审计

CI 自动构造并拒绝五类损坏或伪造包：

| 用例 | 预期阻断 |
|---|---|
| `extra_member` | ZIP 不是固定三成员 |
| `baseline_drift` | LongEdit 固定基线摘要不一致 |
| `missing_gate` | 缺少语义复读生命周期门 |
| `output_digest_drift` | manifest 与输出摘要不一致 |
| `producer_identity_spoof` | WPS/Kingsoft 路径冒充 Microsoft Excel |

实测结果为 `5/5` 拒绝；每次失败后隔离矩阵与能力契约 SHA-256 均不变，Excel fixture 与 manifest 均不存在。随后同一 TEMP 隔离环境中的合法包成功原子提升 fixture、manifest、矩阵和能力契约到 `2/3`，证明负向门禁不会阻断正常交接。测试不依赖仓库目标为空，因此未来真实矩阵达到 3/3 后仍可持续执行。

## 4. 完整回归结果

`npm.cmd run ci:check` 已通过：

- 生产构建、Vue 类型检查与全部机器契约通过；
- Rust 功能测试 `383/383`；
- Rust 性能测试 `1/1`，复杂工作簿本次总耗时约 `3.9 s`；
- PDF 100 MiB 范围读取基准约 `50 ms`，请求约 `255.9 KiB`；
- 生产依赖审计 `0` 漏洞。

保留两个非阻断提示：Vite 仍报告既有大分包警告；Windows/Rust 增量编译目录收尾偶发“拒绝访问”警告，但测试进程、功能结果和退出码均正常。

## 5. 当前真实能力审计

| 能力 | 当前状态 | 说明 |
|---|---|---|
| 数组声明读取 | 受限可用 | 可区分传统/动态数组并显示范围、公式和缓存诊断 |
| 冲突/错误定位 | 受限可用 | X3-B4 已在原有右侧工作面完成真实桌面证据 |
| WPS 原生往返 | 已验证 | 1/3 真实生产者证据 |
| Excel 原生往返 | 待外部执行 | 协议与工具就绪，本机无可信 Microsoft Excel |
| LibreOffice 原生往返 | 待外部执行 | 协议与工具就绪，本机无 LibreOffice |
| 数组公式计算 | 阻断 | 没有 Excel 等价 spill 计算声明 |
| 数组公式写回 | 阻断 | 不因生产者矩阵完成而自动开放 |

因此，本阶段完成的是“可验证地补证”的工程能力，不是伪造的 3/3，也不是数组公式完整支持。

## 6. 外部执行手册

### 6.1 Microsoft Excel 机器

```powershell
npm.cmd run export:x3-b5-array-evidence -- -Producer microsoft-excel -OutputPath C:\evidence\x3-b5-microsoft-excel.zip
```

机器必须安装正版 Microsoft Office Excel。若 `Excel.Application` 被 WPS 兼容层接管，脚本会拒绝执行。

### 6.2 LibreOffice Calc 机器

```powershell
npm.cmd run export:x3-b5-array-evidence -- -Producer libreoffice-calc -LibreOfficeRoot "C:\Program Files\LibreOffice\program" -OutputPath C:\evidence\x3-b5-libreoffice-calc.zip
```

也可用 `LONGEDIT_LIBREOFFICE_ROOT` 指定 LibreOffice `program` 目录。

### 6.3 接收机导入

先人工核对传输来源、机器和应用，再执行：

```powershell
npm.cmd run import:x3-b5-array-evidence -- -BundlePath C:\evidence\x3-b5-microsoft-excel.zip -ConfirmTrustedProducer
npm.cmd run import:x3-b5-array-evidence -- -BundlePath C:\evidence\x3-b5-libreoffice-calc.zip -ConfirmTrustedProducer
npm.cmd run ci:check
```

导入后应提交新增 fixture、producer manifest 与更新后的矩阵，不提交临时 ZIP。

## 7. 阶段边界与下一步

下一阶段为 X3-B6 外部证据收口：

1. 在两套可信环境分别导出证据。
2. 在接收机逐包导入并审计 2/3、3/3 状态转换。
3. 完整 CI 通过后更新公开矩阵的“阅读/查看”状态。
4. 数组计算与写回保持独立研发门禁，不随 3/3 自动开放。

若短期拿不到外部环境，代码主线不应继续伪造生产者证据；应转入下一个可在本机闭环的 XLSX 兼容性任务，同时保留 X3-B6 为明确的外部动作。
