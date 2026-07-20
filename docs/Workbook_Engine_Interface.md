# 工作簿内核接口与兼容性门禁

更新日期：2026-07-20
状态：FR-DATA-009 第二阶段已有单元格编辑基线

## 1. 目标

LongEdit 的工作簿工作面以完整 Excel 等价编辑为长期目标。实现必须位于稳定的 `WorkbookEngine` 契约之后，使读取、公式计算、编辑模型和 XLSX 写回可以分层组合，不把具体第三方引擎直接耦合到 Vue 页面或 Tauri 命令。

## 2. 当前契约

`src-tauri/src/formats/workbook.rs` 定义：

- `WorkbookEngine`：工作簿检查和分页工作表读取接口。
- `WorkbookDocument`、`WorkbookSheetPage`、`WorkbookCell`：前后端稳定数据模型。
- `WorkbookCapabilities`：机器可读能力矩阵，覆盖读取、公式缓存、单元格编辑、格式、公式重算、图表、数据透视、验证、打印和 XLSX 往返。

当前 `calamine-ooxml-v2` 组合由 Calamine 承担读取、独立 `workbook_ooxml` 局部补丁层承担写回。前端可通过 `get_workbook_capabilities` 获取真实能力，不能根据页面控件推断兼容等级。

第二阶段已支持对源 XML 中存在的文本、数字、布尔和公式单元格进行编辑或清空。保存携带读取时的内容签名，冲突时拒绝覆盖；未编辑 OOXML 部件保持原始字节。完整单元格创建、样式和公式重算仍未进入 `supported`。

## 3. Fixture 门禁

基线文件位于 `src-tauri/tests/fixtures/workbook/`：

- `compatibility-baseline.xlsx`：多 Sheet、基础类型、公式缓存、格式、合并单元格和列宽。
- `compatibility-baseline.json`：语义单元格、文档特性和当前能力预期。

重新生成：

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --example generate_workbook_fixture
```

任何工作簿引擎变更必须先通过现有语义断言。开始写回后，门禁扩展为“读取基线 -> 修改指定单元格/样式 -> 保存副本 -> 再读取 -> OOXML 结构差异报告”，且不得静默丢弃未编辑的未知部件。

## 4. 当前写回门禁

1. 只修改目标工作表中明确提交的已有单元格节点。
2. 未编辑的 ZIP 部件保持原始字节；测试至少固定比较 `styles.xml`。
3. 保存前验证内容签名，写入使用同目录临时文件、恢复备份和原子替换。
4. 找不到目标单元格、坐标越界、重复编辑或内容超限时整批拒绝，不产生部分写入。
5. ZIP 部件名不得重复；单部件解压上限 256 MB，整包解压上限 512 MB。

## 5. 下一实现批次

1. 在保持有序行列 XML 的前提下创建原文件中不存在的空白单元格。
2. 扩展连续/多区域选择、复制粘贴和批量补丁模型。
3. 读取并编辑基础样式 ID、数字格式、字体、填充、边框和对齐。
4. 接入公式依赖图与重算引擎，再扩展图表、数据验证、数据透视和打印。
5. 用真实业务工作簿持续扩大 fixture 集，按能力矩阵逐项从 `planned` 升级为 `supported`。
