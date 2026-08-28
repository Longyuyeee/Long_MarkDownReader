# M4C-1 CSV/TSV→Table 披露与自动打开审计

日期：2026-08-29

阶段：M4C-1

状态：通过；下一接续点为 M4C-2 OPML→Canvas 投影披露闭环

版本边界：运行时/公开 `1.0.15`，开发目标 `1.0.16`，`releaseCandidate=false`

## 1. 结论

M4C-1 已按原始 M4 需求关闭 CSV/TSV→Table 的受控转换缺口：用户确认写盘前可以看到来源、候选目标、绝不覆盖与同名编号策略、实际转换规则和损失；创建成功后自动打开后端返回的实际目标，源 CSV/TSV 保持逐字节不变。

本阶段只修改 CSV/TSV→Table 工作流，没有扩展到 OPML、图谱输出，没有抽取全局转换框架，也没有改变运行时版本或发布候选状态。

## 2. 原始需求与实际代码对齐

原始 M4 合同要求受控转换必须披露来源、目标路径、覆盖策略和转换损失，保持源安全，并自动打开实际创建的目标。代码复核确认既有 Rust 后端已经具备以下边界，本阶段继续原样使用：

- 来源最大 32 MiB、最多 200,000 行、512 列、单元格最大 1,000,000 字符；
- 解析后构造并校验内部 Table schema；
- 目标最大 64 MiB；
- 同名目标使用递增编号，绝不覆盖已有目标；
- 使用可靠新文件写入。

前端实际缺口是披露不完整且成功后仍弹出二次选择框。现在 `TableView` 在确认框内显示资料库相对来源与候选目标，并明确以下事实：

1. 第一行作为列名，较短的数据行以空值补齐；
2. 每列最多读取前 2,000 个非空值推断类型，单元格原文作为文本值保存；
3. 目标生成新的稳定行列 ID，并只初始化一个表格视图；
4. 源编码、BOM 和换行不会作为 Table JSON 的物理序列化格式保留；
5. 原 CSV/TSV 文件保持不变。

## 3. 需求纠偏

实际 `internal_from_document` 只把数据、生成的行列 ID 和初始视图写入 `.table.json`，没有保存来源编码、BOM 或换行元数据。因此本阶段没有错误承诺“序列化信息保真”，而是在 UI 和阶段合同中明确把它列为转换损失。这一纠偏与“源文件保持不变”并不冲突：来源字节不修改，但目标 JSON 不复刻来源文本的物理编码形式。

成功行为也按原始需求收敛为单一步骤：后端返回真实目标路径后，前端先通知资料库文件已创建，再直接打开该路径；不再显示要求用户再次选择“打开”或“定位”的成功对话框。失败时仍留在来源工作面并显示错误。

## 4. 真实桌面与文件结果

真实 Tauri Debug WebView2 使用隔离资料库，覆盖一份 UTF-8 BOM/CRLF CSV 和一份 UTF-8 无 BOM/LF TSV：

| 项目 | 实际结果 |
| --- | --- |
| CSV 披露 | 来源、候选目标、编号策略、全部转换规则/损失和源不变均可见 |
| CSV 实际目标 | `Conversion Matrix.table.json`；自动打开；磁盘复读为 2 行 × 3 列 |
| TSV 披露 | 480px 窄工作区内可滚动，确认与取消操作可达 |
| TSV 碰撞目标 | 预先存在 `Conversion Outline.table.json` 后创建并自动打开 `Conversion Outline 1.table.json`；磁盘复读为 2 行 × 2 列 |
| 序列化事实 | CSV 目标 JSON 不含来源 encoding/BOM/line-ending 元数据 |
| 二次成功框 | 未出现；仅提示正在打开并进入目标工作面 |
| 源安全 | CSV、TSV 最终 SHA-256 均等于初始值 |
| 响应式 | 1280 与 480 宽度均通过；窄屏 Table 工作区和对话框在可视范围内，内部表格横向滚动保持 `auto` |
| 运行时/阻断错误面 | 0 / 无 |

四张截图已逐张人工复核并接受：宽屏披露与目标工作面信息完整；窄屏披露没有越出实际 Table 工作区，内容可滚动，编号目标标题和数据可见；截图未包含本机绝对路径或用户内容。

## 5. 审计过程纠偏

审计没有通过削弱门禁来获得绿色结果，过程中按实际产品行为修正了以下问题：

1. 自动打开最初已成功，但脚本把查询串中的 `+` 当作普通字符，随后对 Windows 反斜杠的路径谓词仍不稳定。最终以真实 Table 工作面标题和仅内部 Table 存在的导出控件证明自动打开，同时用已知安全目标路径独立复读文件。
2. 脚本曾把路由中的 `\\?\` Windows 设备路径直接传回后端，资料库守卫正确拒绝“路径在资料库之外”。测试改用隔离资料库中已验证的目标路径，产品安全边界未放宽。
3. 480px 下副标题会按响应式规则隐藏，脚本不再把“开放 Table”副标题当作目标打开条件，改为标题、表格与内部导出控件的组合证据。
4. 首轮窄屏披露确有内容区溢出。产品改为按实际 Table 工作区计算对话框宽度，并限制内容高度、允许纵向滚动。
5. 页面根 `scrollWidth` 会计入表格内部有意保留的横向滚动，Naive 对话框入场动画也会产生瞬时边界。最终几何门禁等待动画稳定后，检查 Table 工作区、对话框边界和 `.table-scroll` 的局部 `overflow-x:auto`。

## 6. 证据与验证

证据目录：[`evidence/post-v115-m4c1-csv-tsv-table-disclosure-and-auto-open`](./evidence/post-v115-m4c1-csv-tsv-table-disclosure-and-auto-open/)

Manifest 状态为 `accepted-after-visual-review`，交互证据状态为 `passed`。

```text
npm run audit:post-v115-m4c1-csv-tsv-table-conversion
npm run check:post-v115-m4c1-csv-tsv-table-conversion
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::table::tests
npm run build
npm run check:post-v115-m4c0-controlled-conversion-selection
npm run check:post-v115-m4b2-workspace-object-action-exit
npm run check:development-version-identity
git diff --check
```

## 7. 下一接续点

下一阶段固定为 **M4C-2 OPML→Canvas 投影披露闭环**。该工作流已经源安全、使用编号目标并自动打开 Canvas，下一步只补齐写盘前的资料库相对来源、候选目标、碰撞策略，以及 OPML 元数据、折叠状态和布局如何投影/丢失的说明，并以首个/编号目标、Canvas 结构复读、源摘要不变和宽窄屏验收。

图谱→Canvas、图谱→项目笔记、全局转换框架、临时产物清理和 `M4-release-freeze` 继续延期。
