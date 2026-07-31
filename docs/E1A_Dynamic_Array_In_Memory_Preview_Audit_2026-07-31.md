# E1A 动态数组只读内存预览审计

日期：2026-07-31

## 结论

E1A 已完成。XLSX 工作簿现可对机器白名单内的 `SEQUENCE` 动态数组执行显式
内存预览，并在原工作簿网格中显示计算范围和结果。

该能力不写用户文件、不写公式缓存、不修改数组声明，也不改变当前 1/3 数组生产者
矩阵。完整 Excel 动态数组等价能力仍未宣称。

## 已交付边界

- 支持 `SEQUENCE(rows, columns, start, step)`，省略参数使用 Excel 对应默认值；
- 参数仅接受有限数字字面量或直接 A1 数值单元格；
- 未保存的数值草稿可以作为参数依赖；
- 单次最多预览 10,000 个单元格；
- 结果只保存在当前前端会话内存中，草稿、刷新和工作表切换会清除预览；
- 源文件签名不一致时拒绝预览；
- 嵌套函数、字符串、区域参数、公式依赖、外部引用和未知动态函数 fail-closed；
- 占用单元格、外来公式、合并单元格、工作表越界和数值溢出返回稳定诊断；
- 传统多单元格数组继续只读阻断；
- 所有数组公式写回、公式缓存持久化和源文件覆盖继续阻断。

机器事实记录在
`shared/xlsx-formula-capabilities.json#dynamicArrayPreviewContract`，并由
`check:e1a-dynamic-array-preview` 与 Rust 回归测试共同验证。

## 验证

```powershell
npm run check:e1a-dynamic-array-preview
npm run check:workbook-contract
cargo test --locked --manifest-path src-tauri/Cargo.toml workbook_dynamic_array
npm run build
```

## 后续

E1B 数组写回评估仍等待 Excel/WPS/LibreOffice 生产者矩阵达到 3/3，E1C
Multi-axis Pivot 仍等待 3/3。两项外部证据未到位前，下一代码阶段为 E2A：
先建立 SVG 脚本、事件处理器、外部引用、XML 实体和资源上限安全合同，再进入基础
源码编辑、净化预览和可靠保存。
