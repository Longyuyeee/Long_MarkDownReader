# S8-7E3G-B XLSX Pivot 多层轴 WPS 往返审计

## 1. 阶段结论

S8-7E3G 已从“只具备预检基线”推进为真实的增量生产者矩阵。当前机器上的 WPS Spreadsheets 已完成多层轴 Pivot 的刷新、保存、应用退出、独立新会话重开和 LongEdit 反向语义复读，矩阵由 `0/3` 更新为 `1/3`。

这仍不是发布白名单。Microsoft Excel 与 LibreOffice Calc 尚未验证，因此：

- 多层轴可靠新副本继续阻断；
- 原文件覆盖、已有目标覆盖继续阻断；
- Page Fields、外部数据和切片器继续阻断。

## 2. 本次实现

新增增量生产者验证器：

- `scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1`
- `scripts/verify-s8-7e3g-libreoffice-pivot.py`

验证器支持 `available`、`all` 或指定生产者执行。每个真实生产者都必须完成：

1. 从固定 LongEdit 基线复制独立输出；
2. 可写会话打开 `MultiAxisPivot`；
3. 刷新并保存；
4. 完整退出应用会话；
5. 新会话只读重开；
6. 验证无修复提示；
7. 用 LongEdit 再次解析生产者输出并生成隔离审计副本；
8. 复核 Pivot 身份、双层行列轴、`A3:I12`、80 个输出单元格、16 个预览分组和 Grand Total `424`。

`run-s8-7e3g-xlsx-pivot-multi-axis-roundtrip-audit.ps1` 已接入该验证器。新增两个入口：

```powershell
npm run audit:s8-7e3g-xlsx-pivot-multi-axis-available
npm run audit:s8-7e3g-xlsx-pivot-multi-axis-roundtrip
```

第一个入口验证当前机器可用的生产者并允许形成部分矩阵；第二个入口要求最终 `3/3`，不足时明确失败。

## 3. WPS 固定证据

- 生产者：WPS Spreadsheets
- 版本：`12.0`
- 构建：`26895`
- 输出：`fixtures/xlsx/output-reopen/s8-7e3g-wps-spreadsheets.xlsx`
- 字节数：`14492`
- SHA-256：`b554a1329e3d3ceb1be0212994eb68429cb8df6210d5e6928d1f7f1fcae35e4a`
- 刷新：通过
- 保存：通过
- 应用退出后新会话重开：通过
- 修复提示：未观察到
- LongEdit 反向复读：通过
- Pivot：`MultiAxisPivot`
- 行字段 / 列字段 / 数据字段 / 页面字段：`2 / 2 / 1 / 0`
- 输出范围：`A3:I12`
- Grand Total：`I12 = 424`

完整机器证据位于：

- `docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/matrix.json`

当前矩阵：

- 状态：`partial`
- 已验证：`1`
- 要求：`3`
- 待验证：Microsoft Excel、LibreOffice Calc

## 4. 安全边界

生产者审计只写入固定的测试输出目录，不修改用户文件。LongEdit 反向复读在系统临时目录中复制生产者输出并创建新的隔离审计副本，完成后清理临时目录。

即使 WPS 已通过，能力合同仍保持：

- `reliableCopySave = blocked`
- `sourceOverwrite = blocked`
- `existingTargetOverwrite = blocked`
- `pageFields = blocked`
- `externalData = blocked`
- `slicers = blocked`

## 5. 下一步

在装有 Microsoft Excel 或 LibreOffice Calc 的机器上，可以分别执行指定生产者：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1 -Producer microsoft-excel
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1 -Producer libreoffice-calc
```

或者在三生产者机器上直接运行完整入口。达到 `3/3` 并提交三份输出证据后，下一阶段才是评估多层轴“同目录可靠新副本”白名单，不包含原文件覆盖。

## 6. 验证

本阶段定向门禁：

```powershell
npm.cmd run check:s8-7e3g-xlsx-pivot-multi-axis-roundtrip
npm.cmd run check:workbook-contract
```

完整质量门禁以本次提交前的 `npm.cmd run ci:check` 结果为准。
