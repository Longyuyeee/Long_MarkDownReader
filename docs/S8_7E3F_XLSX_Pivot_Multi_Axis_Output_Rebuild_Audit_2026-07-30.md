# S8-7E3F XLSX Pivot 多层轴定义与输出重建审计

> 审计日期：2026-07-30
> 分支：`main`
> 结论：多层行轴 + 多层列轴 Pivot 已从“结构审计原型”推进到“临时包内同步重建 Pivot Definition 与输出 Worksheet”。用户原文件仍不写入，可靠保存仍未开放。

## 1. 本阶段目标对齐

用户最初目标是让管理器覆盖日常管理和基础编辑，并逐步具备 PDF、图表、WPS/Office、Excel、TXT、JSON 等常用格式的体系化管理能力。本阶段继续补 XLSX 专业能力中最难的一块：透视表多层行/列轴。

本阶段不追求直接保存用户原文件，而是先证明引擎能够在隔离包中稳定重建：

- 多层 `pivotFields/items`；
- 有序 `rowFields/colFields`；
- 支持 `r` 前缀压缩的 `rowItems/colItems`；
- 多层列表头、行表头、明细、父级小计、行列交叉总计和 Grand Total；
- 输出工作表单元格复读；
- 未触及部件逐字节保持不变；
- 成功路径和旧签名拒绝路径均不修改用户原文件。

## 2. 已完成能力

- `WorkbookPivotMultiAxisAuditResult` 新增 `outputRange` 和 `outputCellCount`，让审计结果能直接描述临时输出范围与写入规模。
- `audit_workbook_pivot_multi_axis_isolated_copy` 返回状态升级为 `multi_axis_output_rebuilt`。
- 多层轴结构从真实 Excel fixture 中解码，并保留明细键序列用于重建。
- 从原始数据源重新生成多层行/列轴模板，避免依赖旧输出表的静态单元格。
- 临时包内重建 Pivot Definition：
  - `rowFields/colFields`；
  - 多层字段 `items`；
  - 压缩 `rowItems/colItems`；
  - `location ref/firstDataRow/firstDataCol`。
- 临时包内重建输出 Worksheet：
  - 输出范围：`A3:I12`；
  - 输出单元格：`80`；
  - 预览分组：`16`；
  - Grand Total：`424`。
- 增加输出值复读门禁，确保写出的单元格能被引擎重新读取并与期望值一致。

## 3. 安全边界

仍然保持阻断：

- 不写入用户原文件；
- 不开放原件覆盖；
- 不覆盖已有目标副本；
- 不处理 Page Fields、外部连接、切片器、复杂刷新链；
- 不把多层轴加入可靠保存白名单；
- 不声明 Excel / WPS / LibreOffice 生产者往返已完成。

也就是说，E3F 是“引擎内可重建”的证据，不是“用户可保存”的最终许可。

## 4. 门禁证据

已纳入合同和测试的门禁：

- `signature_check`
- `multi_axis_field_inventory`
- `compressed_hierarchy_decode`
- `cache_definition_rebuild`
- `cache_records_rebuild`
- `pivot_definition_rebuild`
- `output_worksheet_rebuild`
- `package_validation`
- `semantic_reparse`
- `output_value_reparse`
- `untouched_part_preservation`
- `source_package_unchanged`

定向验证：

```powershell
cargo test --locked --manifest-path src-tauri/Cargo.toml multi_axis -- --nocapture
```

结果：2 项 multi-axis 测试通过。

完整门禁：

```powershell
npm.cmd run ci:check
```

结果：通过。Rust 功能测试 `372 passed`，性能测试 `1 passed`，PDF Range 基准 `100 MiB / 89 ms`，生产依赖审计 `0 vulnerabilities`。Vite chunk size warning 与 Windows incremental compilation directory cleanup warning 为既有非阻断提示。

## 5. 当前开发位置

已完成：

- E3E：真实 Excel 多层轴 fixture、结构审计、临时 Cache 包；
- E3F：多层轴定义和层级输出的临时包重建。

下一步：

- S8-7E3G：执行 Excel / WPS / LibreOffice 生产者往返验证；
- 检查刷新保存后是否无修复提示、语义稳定；
- 如果三生产者均稳定，再评估是否允许保存为可靠同目录新副本；
- 原文件覆盖继续保持阻断。

## 6. 对产品目标的意义

这一步提升的是“Excel/图表/数据对象专业管理”的底层可信度。对用户而言，未来表现为：

- 管理器不只是打开 XLSX，还能理解内部高级对象；
- 透视表不是黑盒，能被审计、预览、重建和逐步保存；
- 复杂数据对象会有明确安全边界，避免损坏用户文件；
- 为后续“专业管理系统”的图表、表格、知识图谱、思维导图统一对象模型继续铺路。
