# S8-7E3E XLSX Pivot 多层轴结构与隔离包原型审计

> 审计日期：2026-07-29  
> 分支：`main`  
> 结论：真实双层行轴、双层列轴结构已完成语义审计和临时 Cache 包验证；用户文件保存未开放。

## 1. 本阶段完成范围

- 新增 Microsoft Excel 真实生产者 fixture，固定 `Region/City` 双层行轴、`Year/Quarter` 双层列轴和 `Sum of Sales` 单度量。
- fixture 包含 16 条源记录、16 个完整层级分组、双轴父级小计与总计，输出范围为 `A3:I12`，总计为 `424`。
- 新增可重复执行的 Excel COM 生成脚本；生成后关闭首个会话，并由独立 Excel 进程重开确认 2/2/1 字段结构。
- 新增 `audit_workbook_pivot_multi_axis_isolated_copy` 命令，执行签名校验、层级解码、内存预览、临时 Cache Definition/Records 重建、包复读和未触及部件检查。
- 用户文件始终不写入；Pivot Definition 与输出 Worksheet 在临时包中逐字节保持不变。

## 2. 真实结构审计

Excel fixture 的 `rowItems/colItems` 均使用 `r` 属性复用上一条键的前缀，而不是为每条明细重复完整层级索引。当前解码器已验证：

| 轴 | 字段 | 明细项 | 父级小计 | 总计 | 压缩明细 |
| --- | --- | ---: | ---: | ---: | ---: |
| 行轴 | `Region → City` | 4 | 2 | 1 | 2 |
| 列轴 | `Year → Quarter` | 4 | 2 | 1 | 2 |

Grand Total 项可包含一个无 `v` 的 `<x/>` 占位符；该占位按非语义占位处理，非零值和多个占位仍拒绝。

## 3. 隔离包门禁

已通过：

- 源签名与 Pivot 身份校验；
- 多层字段清单和 sharedItems 边界校验；
- 压缩层级键解码、重复键拒绝；
- 明细、父级小计和总计结构完整性；
- 16 个双层行列组合的当前工作表值预览；
- Cache Definition、Cache Records 临时重建；
- XLSX 包校验和 Linked Data 语义复读；
- 重建前后层级审计、预览分组完全一致；
- Pivot Definition、输出 Worksheet 逐字节不变；
- 影响清单外部件逐字节不变；
- 成功与旧签名阻断路径均不修改用户文件。

## 4. fixture 与证据

- fixture：`src-tauri/tests/fixtures/workbook/pivot-multi-axis-microsoft-excel.xlsx`
- manifest：`src-tauri/tests/fixtures/workbook/pivot-multi-axis-microsoft-excel.json`
- 生成器：`scripts/generate-s8-7e3e-xlsx-pivot-multi-axis-fixture.ps1`
- Microsoft Excel：`16.0 / 20228`
- 文件大小：`14433` bytes
- SHA-256：`D1B79E6E78FFADBDFECB8FC3B0E329EEDB55ECB0E22974791EC25AD26EF8B3AD`
- 独立进程重开：通过

## 5. 验证结果

- 定向 Rust：2 项多层轴测试通过。
- Workbook 机器契约：通过。
- 完整本地 CI：通过；372 项功能测试、1 项性能测试全部通过。
- 前端生产构建、全部机器契约、PDF Range 基准和生产依赖审计通过；`npm audit` 为 0 漏洞。
- GitHub Quality Gate：待推送后执行并回填。

## 6. 明确未开放范围

- 尚未重建多层 `pivotFields/items`、`rowItems/colItems`；
- 尚未重建多层表头、明细、父级小计、行列总计和 Grand Total 输出单元格；
- 尚未验证多层轴类别扩张、收缩、隐藏项和样式延伸；
- 尚未执行 Excel/WPS/LibreOffice 多层轴刷新保存重开；
- `save_workbook_pivot_copy` 继续拒绝多层轴；
- 页面字段、切片器、外部连接、已有目标覆盖和原件覆盖继续阻断。

## 7. 下一阶段：S8-7E3F

1. 将单层 `PivotAxisRebuildTemplate` 扩展为有序多层轴模板。
2. 在内存中编码完整及 `r` 前缀压缩的 `rowItems/colItems`。
3. 重建多层表头、明细、父级小计、行列总计和总计输出。
4. 用源数值变化、类别扩张与收缩验证布局、旧单元格清理和样式延伸。
5. 通过包、语义、输出值、样式和未触及部件门禁；仍不写用户文件。
6. S8-7E3F 稳定后，S8-7E3G 才规划三生产者往返和可靠新副本白名单。
