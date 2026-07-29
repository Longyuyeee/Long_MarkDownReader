# X3-A / S8-6F XLSX XMATCH 公式等价扩展审计

## 1. 阶段结论

本阶段完成 X3 计算与公式等价扩展的首批交付：

- IronCalc 从 `0.7.1` 固定升级至 `0.8.0`；
- 适配 0.8.0 的单格清空 API；
- 在真实 XLSX fixture 中新增 8 个 `XMATCH` 场景；
- 计算模块与 Tauri 命令边界同时通过；
- 机器合同更新为十个函数族、38 个函数、64 个真实场景。
- `vue-tsc` 升级到 `3.3.8`，清除本轮依赖审计发现的 4 个高危开发依赖漏洞。

该结论只覆盖标量 `XMATCH`。不扩大动态数组、数组常量、正则模式、外部工作簿计算或结果缓存写回。

## 2. 引擎升级审计

依赖固定为：

```toml
ironcalc = "=0.8.0"
```

锁文件同步固定 `ironcalc`、`ironcalc_base` 及新增的 `regex-lite`。升级后的唯一编译不兼容是旧 `cell_clear_contents` API 已移除；LongEdit 改用宽高均为 1 的 `Area` 调用 `range_clear_contents`，保持“仅清空目标单元格内容”的原语义。

升级后原有 17 个公式模块测试全部通过，再叠加本批 3 个 `XMATCH` 模块测试。

## 3. XMATCH 真实 fixture

`formula-function-matrix.xlsx` 新增：

1. 精确匹配；
2. 反向搜索；
3. 通配符匹配；
4. next-smaller；
5. next-larger；
6. 横向量；
7. 未找到时 `#N/A`；
8. `IFERROR` 恢复。

另以未保存草稿修改查找数组，验证反向搜索结果由 3 更新为 2，证明依赖重算不是只读取 fixture 缓存。

## 4. 三层事实门禁

机器清单要求 `XMATCH` 同时存在于：

- `shared/xlsx-formula-capabilities.json`
- `src-tauri/tests/fixtures/workbook/formula-function-matrix.xlsx`
- `src-tauri/tests/fixtures/workbook/formula-function-matrix.json`
- fixture 生成器
- 计算模块回归
- Tauri 命令边界回归

`check-workbook-contract` 还固定检查 Cargo 中的 `=0.8.0` 版本，避免代码、锁文件和公开能力发生漂移。

完整 CI 结果：

- Rust 功能测试：376 通过；
- Rust 性能测试：1 通过；
- 100 MiB PDF Range 基准：60 ms、单次范围请求；
- 前端生产构建通过；
- npm 完整及生产依赖审计：0 漏洞。

## 5. 能力边界

本阶段明确不承诺：

- `XMATCH` 数组常量；
- `XMATCH` 正则模式；
- 动态数组和溢出区域；
- `XLOOKUP` 数组返回；
- Excel 自动重算时机；
- 外部工作簿计算；
- 计算缓存写回 XLSX；
- Excel 完整函数等价。

现有动态数组和外部工作簿预检拒绝保持不变，源公式、缓存和用户文件不会因显式重算被修改。

## 6. 验证入口

```powershell
cargo test --locked --manifest-path src-tauri/Cargo.toml formats::workbook_calculation::tests::
cargo test --locked --manifest-path src-tauri/Cargo.toml formula_function_matrix_recalculates_through_command_boundary
npm.cmd run check:workbook-contract
npm.cmd run ci:check
```

## 7. 下一阶段

下一批为 X3-B：先建立动态数组 anchor、公式范围、保存缓存和溢出范围的只读结构模型，区分传统数组、动态数组和标量现代函数。读取、展示、源包保真与真实生产者 fixture 完成前，不开放动态数组重算或写回。

若真实 Microsoft Excel Pivot 证据先到位，优先按既有三成员证据流程完成 S8-7E3G `3/3`，不以 X3 工作替代外部生产者证据。
