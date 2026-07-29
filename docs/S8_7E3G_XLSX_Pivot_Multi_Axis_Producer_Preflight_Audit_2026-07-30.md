# S8-7E3G XLSX Pivot 多层轴生产者往返预检审计

> 审计日期：2026-07-30
> 分支：`main`

## 1. 阶段结论

S8-7E3G 已进入，但本机不能完成 Excel / WPS / LibreOffice 三生产者矩阵：当前只发现 WPS Spreadsheets，未发现 Microsoft Excel 与 LibreOffice Calc。因此本次完成 S8-7E3G-A 预检收口：固定 LongEdit 多层轴审计副本、登记生产者矩阵合同、增加检查脚本，并继续阻断可靠保存。

这不是完整 E3G 通过；完整 E3G 仍要求三生产者真实打开、刷新、保存、退出和新进程重开。

## 2. 本次完成

- 新增 `generate_workbook_pivot_multi_axis_audit_copy`。
- `xlsx-pivot-audit-copy` CLI 新增 `multi_axis` 变体。
- 生成并固定 LongEdit 基线副本：
  - `fixtures/xlsx/output-reopen/s8-7e3g-longedit-multi-axis.xlsx`
  - 大小：`12503` bytes
  - SHA-256：`a060ff1dbd708618217e9cbb442e25a2a4e74efd1c01d64ef3d5cafaafef3736`
- 新增 E3G matrix：
  - `docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/matrix.json`
  - 状态：`blocked_preflight`
  - 完成度：`0/3`
- 新增检查脚本：
  - `scripts/check-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.mjs`
  - `scripts/run-s8-7e3g-xlsx-pivot-multi-axis-roundtrip-audit.ps1`
- `package.json` 新增 E3G check/audit 脚本，并把 preflight check 纳入 `ci:check`。

## 3. 固定语义

LongEdit 基线副本来自 S8-7E3F 已验证的隔离重建结果：

- Pivot：`MultiAxisPivot`
- 行轴：`Region / City`
- 列轴：`Year / Quarter`
- 输出范围：`A3:I12`
- 输出单元格：`80`
- 预览分组：`16`
- Grand Total：`424`
- 用户原文件：不写入
- 可靠保存：仍阻断

## 4. 环境审计

当前本机生产者状态：

- Microsoft Excel：未发现 `EXCEL.EXE`
- WPS Spreadsheets：发现 `et.exe`
  - `C:\Users\Administrator\AppData\Local\Kingsoft\WPS Office\12.1.0.26375\office6\et.exe`
  - `C:\Users\Administrator\AppData\Local\Kingsoft\WPS Office\12.1.0.26895\office6\et.exe`
- LibreOffice Calc：未发现 `soffice.exe`

因此 `audit:s8-7e3g-xlsx-pivot-multi-axis-roundtrip` 带 `-RequireComplete` 时会明确失败，避免把单机预检误判为生产者完整通过。

## 5. 下一步

在具备三生产者的机器上继续：

1. 使用固定基线 `s8-7e3g-longedit-multi-axis.xlsx`。
2. Excel / WPS / LibreOffice 分别执行打开、刷新、保存、退出、新进程重开。
3. 记录版本、是否修复提示、保存后和重开后的 Pivot 身份、范围、字段、压缩层级项和 Grand Total。
4. 更新 matrix 为 3/3 verified。
5. 只有矩阵通过后，才评估多层轴可靠新副本白名单。

继续阻断：原件覆盖、已有目标覆盖、Page Fields、外部数据、切片器。

## 6. 本地验证

已通过：

```powershell
npm.cmd run check:s8-7e3g-xlsx-pivot-multi-axis-roundtrip
npm.cmd run check:workbook-contract
cargo test --locked --manifest-path src-tauri/Cargo.toml multi_axis -- --nocapture
npm.cmd run ci:check
```

完整 CI 结果：Rust 功能测试 `373 passed`，性能测试 `1 passed`，PDF Range 基准 `100 MiB / 160 ms`，生产依赖审计 `0 vulnerabilities`。Vite chunk size warning 与 Windows incremental compilation directory cleanup warning 为既有非阻断提示。
