# S8-7E3G-E XLSX Pivot Excel 证据协议加固审计

## 1. 阶段结论

真实 Microsoft Excel 仍需外部可信机器，因此生产者矩阵保持 `partial / 2/3`，没有生成或伪造 Excel 通过证据。

本阶段完成 Excel 三成员证据协议的安全加固：

- manifest 绑定真实 Excel 环境身份；
- producer 条目绑定环境版本与构建；
- producer 条目绑定输出文件名、字节数和 SHA-256；
- 新增四类损坏证据包的自动拒绝矩阵；
- 所有拒绝路径验证目标文件不存在且 matrix 字节不变；
- 拒绝矩阵加入完整 CI。

## 2. 生产者身份绑定

导出 manifest 现在包含 `producerEnvironment`：

- `status = available`
- `trustedMicrosoftExcelAvailable = true`
- `progId = Excel.Application`
- 标准 Excel CLSID
- `LocalServer32`
- 应用名称、版本、构建和路径

导入器要求：

1. `LocalServer32` 包含 `EXCEL.EXE`；
2. 应用路径属于 Microsoft Office；
3. LocalServer 和应用路径均不包含 Kingsoft、WPS 或 `et.exe`；
4. producer 的版本、构建与环境身份一致；
5. `sourceCommit` 是完整 40 位 Git 提交摘要；
6. producer 输出文件名固定；
7. producer 输出字节数和 SHA-256 与实际 XLSX 一致。

这些校验不能替代人工确认可信产出机器，但能避免环境审计与 producer/output 条目在包内互相脱钩。

## 3. 自动拒绝矩阵

新增：

- `scripts/test-s8-7e3g-excel-evidence-bundle-rejections.ps1`
- `npm run check:s8-7e3g-excel-evidence-rejections`

固定四个拒绝场景：

1. `extra_member`
   - ZIP 包含第四个未登记成员；
   - 必须在解包校验阶段拒绝。
2. `baseline_drift`
   - manifest 绑定错误的 LongEdit 基线摘要；
   - 必须在 producer 语义处理前拒绝。
3. `missing_gate`
   - producer 缺少 `reparse_longedit_semantics`；
   - 必须在生命周期门禁阶段拒绝。
4. `output_digest_drift`
   - manifest 中的 XLSX 摘要被篡改；
   - 必须在成员摘要阶段拒绝。

每个场景都验证：

- 子进程返回失败；
- `s8-7e3g-microsoft-excel.xlsx` 不存在；
- matrix SHA-256 与执行前完全一致；
- 临时 ZIP、日志和解包目录全部清理。

本次结果：`4/4` 通过。

## 4. CI 与能力合同

能力合同新增：

- `producerIdentityBound = true`
- `rejectionValidation.stage = S8-7E3G-E`
- `rejectionValidation.status = verified`
- `verifiedCaseCount = 4`
- `matrixUnchangedOnFailure = true`
- `targetAbsentOnFailure = true`

完整 `ci:check` 已接入拒绝矩阵。只要导入器放松固定成员、基线、生命周期或摘要门禁，CI 会失败。

## 5. 能力边界

本阶段没有改变用户能力：

- Microsoft Excel：仍待真实证据
- 生产者矩阵：`2/3`
- 多层轴可靠新副本：阻断
- 原文件覆盖：阻断
- 已有目标覆盖：阻断
- Page Fields、外部数据、切片器：阻断

自动拒绝测试使用的是明确标记为 `synthetic-rejection-only` 的无效 producer 条目，只验证失败路径，不会进入 matrix，也不构成 Microsoft Excel 证据。

## 6. 下一步

在真实 Microsoft Excel 机器：

```powershell
npm run audit:s8-7e3g-excel-environment
npm run export:s8-7e3g-excel-evidence -- -OutputPath <handoff.zip>
```

可信传回后：

```powershell
npm run import:s8-7e3g-excel-evidence -- -BundlePath <handoff.zip>
```

导入达到 `3/3` 后，更新能力合同并运行完整 CI，再单独审计多层轴可靠新副本。不得由拒绝测试、WPS COM 兼容服务器或人工修改 matrix 代替真实 Excel 证据。

## 7. 验证入口

```powershell
npm.cmd run check:s8-7e3g-excel-evidence-handoff
npm.cmd run check:s8-7e3g-excel-evidence-rejections
npm.cmd run check:s8-7e3g-xlsx-pivot-multi-axis-roundtrip
npm.cmd run check:workbook-contract
npm.cmd run ci:check
```
