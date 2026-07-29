# S8-7E3G-D XLSX Pivot Excel 身份与证据交接审计

## 1. 阶段结论

本机仍不能完成 Microsoft Excel 的最后一项生产者往返。进一步审计发现，系统虽然注册了标准 `Excel.Application` CLSID，但其 `LocalServer32` 实际指向 WPS Spreadsheets：

```text
C:\Users\Administrator\AppData\Local\Kingsoft\WPS Office\1210~1.268\office6\et.exe /Automation
```

该 COM 服务器返回：

- Name：`Microsoft Excel`
- Version：`12.0`
- Build：`26895`
- Path：Kingsoft WPS Office

因此“能创建 `Excel.Application`”不能证明 Microsoft Excel 存在。本阶段完成 S8-7E3G-D：增加真实 Excel 身份门禁，并建立固定三成员证据包的跨机器导出、严格导入和失败清理流程。

生产者矩阵仍为 `partial / 2/3`，可靠保存继续阻断。

## 2. Excel 身份门禁

新增：

- `scripts/audit-s8-7e3g-excel-environment.ps1`
- `docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/excel-environment.json`

可信 Microsoft Excel 必须同时满足：

1. `Excel.Application` 可以激活；
2. CLSID `LocalServer32` 指向 `EXCEL.EXE`；
3. 应用路径属于 Microsoft Office；
4. 路径和命令不包含 Kingsoft、WPS 或 `et.exe`。

当前状态：

- `status = compatible_server_not_microsoft_excel`
- `trustedMicrosoftExcelAvailable = false`
- 审计过程中未打开工作簿；
- 未写用户文件。

生产者验证器也已复用同一身份逻辑。即使 WPS 抢占标准 Excel COM ProgID，也不能进入 `microsoft-excel` 证据项。

## 3. 跨机器证据包

新增：

- `scripts/export-s8-7e3g-excel-evidence-bundle.ps1`
- `scripts/import-s8-7e3g-excel-evidence-bundle.ps1`

证据包必须且只能包含：

1. `manifest.json`
2. `producer.json`
3. `s8-7e3g-microsoft-excel.xlsx`

### 3.1 在可信 Excel 机器导出

```powershell
npm run audit:s8-7e3g-excel-environment
npm run export:s8-7e3g-excel-evidence -- -OutputPath D:\handoff\s8-7e3g-excel-evidence.zip
```

导出器会：

1. 重新执行 Excel 身份门禁；
2. 执行 Microsoft Excel 刷新、保存、退出和新进程重开；
3. 运行 LongEdit 反向复读；
4. 固定生产者条目和输出摘要；
5. 绑定当前 LongEdit 基线摘要；
6. 拒绝覆盖已有证据包。

### 3.2 在当前开发机导入

先人工确认产出机器确实运行 Microsoft Excel，且证据包来自可信传输渠道，然后执行：

```powershell
npm run import:s8-7e3g-excel-evidence -- -BundlePath D:\handoff\s8-7e3g-excel-evidence.zip
```

导入器会：

1. 拒绝成员缺失、额外成员、重复成员和超限成员；
2. 校验 manifest 身份与安全边界；
3. 校验固定 LongEdit 基线摘要；
4. 校验 producer/output 的 SHA-256 和字节数；
5. 校验七个生产者生命周期门禁；
6. 复核三阶段 Pivot 快照；
7. 用 LongEdit 再次解析导入输出；
8. 拒绝覆盖已有 Microsoft Excel 证据；
9. 以新输出和 matrix 原子提升完成 `3/3`；
10. 失败时删除尚未完成的输出并保持 matrix 不变。

SHA-256 只能证明传输后内容未漂移，不能证明产出机器身份。可信机器确认仍是强制人工前置条件。

## 4. 已验证的拒绝路径

本机执行导出时：

- WPS COM 兼容服务器被识别；
- 导出明确失败；
- 未创建 ZIP。

使用缺少成员的伪造 ZIP 执行导入时：

- 导入明确失败；
- 未创建 Excel 输出；
- matrix 摘要保持不变；
- 临时解包目录被清理。

## 5. 能力边界

本阶段没有新增用户写入能力：

- 当前生产者矩阵：`2/3`
- 多层轴可靠新副本：阻断
- 原文件覆盖：阻断
- 已有目标覆盖：阻断
- Page Fields：阻断
- 外部数据：阻断
- 切片器：阻断

即使未来导入后达到 `3/3`，也必须先更新能力合同和完成完整质量门禁，才能进入可靠新副本白名单评估。

## 6. 下一步

下一阶段只需在真实 Microsoft Excel 机器导出三成员证据包，并在当前分支导入。完成 `3/3` 后：

1. 更新生产者矩阵和固定 Excel 输出；
2. 更新能力合同为三生产者已验证；
3. 运行完整 `ci:check`；
4. 单独审计是否允许多层轴同目录可靠新副本；
5. 原文件覆盖仍不属于开放范围。

## 7. 验证入口

```powershell
npm.cmd run check:s8-7e3g-excel-evidence-handoff
npm.cmd run check:s8-7e3g-xlsx-pivot-multi-axis-roundtrip
npm.cmd run check:workbook-contract
npm.cmd run ci:check
```

## 8. 后续进展

S8-7E3G-E 已把 Excel 环境身份写入 manifest，并增加 producer/output 绑定与 4/4 损坏证据包自动拒绝矩阵。后续以 [`S8_7E3G_E_XLSX_Pivot_Excel_Evidence_Protocol_Hardening_Audit_2026-07-30.md`](./S8_7E3G_E_XLSX_Pivot_Excel_Evidence_Protocol_Hardening_Audit_2026-07-30.md) 为准。
