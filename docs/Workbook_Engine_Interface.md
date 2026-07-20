# 工作簿内核接口与兼容性门禁

更新日期：2026-07-20
状态：FR-DATA-009 第一阶段基线

## 1. 目标

LongEdit 的工作簿工作面以完整 Excel 等价编辑为长期目标。实现必须位于稳定的 `WorkbookEngine` 契约之后，使读取、公式计算、编辑模型和 XLSX 写回可以分层组合，不把具体第三方引擎直接耦合到 Vue 页面或 Tauri 命令。

## 2. 当前契约

`src-tauri/src/formats/workbook.rs` 定义：

- `WorkbookEngine`：工作簿检查和分页工作表读取接口。
- `WorkbookDocument`、`WorkbookSheetPage`、`WorkbookCell`：前后端稳定数据模型。
- `WorkbookCapabilities`：机器可读能力矩阵，覆盖读取、公式缓存、单元格编辑、格式、公式重算、图表、数据透视、验证、打印和 XLSX 往返。

当前 `calamine-preview-v1` 实现只负责安全读取；它不承担原位编辑或写回。前端可通过 `get_workbook_capabilities` 获取真实能力，不能根据页面控件推断兼容等级。

## 3. Fixture 门禁

基线文件位于 `src-tauri/tests/fixtures/workbook/`：

- `compatibility-baseline.xlsx`：多 Sheet、基础类型、公式缓存、格式、合并单元格和列宽。
- `compatibility-baseline.json`：语义单元格、文档特性和当前能力预期。

重新生成：

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --example generate_workbook_fixture
```

任何工作簿引擎变更必须先通过现有语义断言。开始写回后，门禁扩展为“读取基线 -> 修改指定单元格/样式 -> 保存副本 -> 再读取 -> OOXML 结构差异报告”，且不得静默丢弃未编辑的未知部件。

## 4. 下一实现批次

1. 定义可编辑工作簿文档、工作表、单元格值/公式和样式 ID 模型。
2. 增加工作副本与原文件签名冲突检测，所有保存先写临时文件再原子替换。
3. 交付单元格与区域编辑、撤销重做、复制粘贴和基础格式。
4. 接入公式依赖图与重算引擎，再扩展图表、数据验证、数据透视和打印。
5. 用真实业务工作簿持续扩大 fixture 集，按能力矩阵逐项从 `planned` 升级为 `supported`。
