# S8-7E3D XLSX Pivot 单度量聚合可靠新副本与生产者往返审计

> 审计日期：2026-07-29
> 分支：`main`
> 结论：`count/average/max/min/product/countNums` 全部进入可靠新副本白名单，三生产者矩阵 18/18。

## 1. 本阶段完成范围

- `save_workbook_pivot_copy` 增加与布局变体互斥的 `aggregationVariant`。
- 六种非 `sum` 聚合分别绑定源签名、独立隔离输出摘要和目标文件名。
- 保存仍只允许源文件同目录下不存在的新 `.xlsx`，禁止覆盖源文件和已有目标。
- 隔离构建同步改写 Pivot `dataField subtotal`、输出明细和总计，并复读包结构、对象语义、输出值、样式及未触及部件。
- 前端为每个通过隔离验证的聚合提供独立文件名和可靠另存入口。

## 2. 审计中修正的问题

早期聚合包只验证了明细组。S8-7E3D 的语义探针发现跨组 Grand Total 除 `average` 外都错误走求和，导致 `max/min/product` 总计漂移。本阶段将总计合并改为聚合自身规则：

- `count/countNums/sum`：分组结果求和；
- `average`：按 contributing count 加权；
- `max/min`：跨分组取极值；
- `product`：跨分组求积。

真实桌面自动化还出现过一次 Excel COM `RPC_E_CALL_REJECTED`，以及一次未能复现的 LibreOffice 聚合改写。审计器因此增加仅针对 RPC 的一次重试，并直接复读每份 XLSX 中 `pivotTable1.xml` 的 `subtotal`。最终全新隔离会话矩阵连续得到 18 个稳定通过结果。

## 3. 生产者矩阵

固定生产者：

- Microsoft Excel `16.0`，build `20228`；
- WPS Spreadsheets `12.0`，build `26895`；
- LibreOffice Calc `26.2.4.2`。

每个聚合都执行：

1. 打开 LongEdit 可靠新副本；
2. 验证基线 Pivot 身份、范围、聚合和关键总计；
3. 刷新并保存 XLSX；
4. 退出生产者进程；
5. 使用新进程独立重开；
6. 验证规范化状态在进程重启后稳定；
7. 复读 OOXML `subtotal`，拒绝静默改写；
8. 由 LongEdit 反向复读包、Pivot 字段和关键总计。

结果为 `6 aggregations × 3 producers = 18/18`。机器证据位于：

- `docs/evidence/s8-7e3d-xlsx-pivot-aggregation-roundtrip/matrix.json`
- `fixtures/xlsx/output-reopen/s8-7e3d-*.xlsx`

## 4. 规范化边界

LongEdit 基线使用紧凑可见项范围 `A3:D6`，关键总计位于 `D6`。Excel、WPS 和 LibreOffice 刷新后都会恢复隐藏项占位并稳定为 `A3:D7`、`D7`。该坐标规范化允许存在，但必须满足：

- 聚合 token 不变；
- 字段来源不变；
- 关键总计不变；
- 保存后与新进程重开一致。

关键总计固定为：

| 聚合 | 总计 |
| --- | ---: |
| `count` | 2 |
| `average` | 2 |
| `max` | 3 |
| `min` | 1 |
| `product` | 3 |
| `countNums` | 2 |

## 5. 验收与边界

- 本地审计矩阵：18/18。
- Rust 回归反向复读 6 份 LongEdit 基线和 18 份生产者输出。
- CI 机器合同固定聚合顺序、生产者、摘要、总计、规范化范围和 OOXML token。
- 完整本地质量门禁通过：Rust 功能测试 370/370、性能测试 1/1，生产依赖审计 0 漏洞。
- 原件覆盖、已有目标替换、多层轴、页面字段、切片器、外部连接继续阻断。

## 6. 下一阶段

进入 S8-7E3E：建立多层行/列轴真实 fixture、结构审计和隔离包原型。该阶段先证明多层轴字段、items、层级表头、总计和生产者规范化，不直接开放可靠保存。
