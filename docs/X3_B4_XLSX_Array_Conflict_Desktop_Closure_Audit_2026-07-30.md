# X3-B4 XLSX 数组冲突桌面定位闭环审计

更新日期：2026-07-30

阶段状态：**受控冲突/错误定位闭环完成；真实生产者矩阵仍为 `partial 1/3`**

## 1. 目标

X3-B3 已具备缓存类型、错误缓存地址和外来公式冲突地址，但真实桌面样本只有正常缓存。本阶段关闭以下证据缺口：

- 在原有右侧 XLSX 工作面真实显示冲突与错误缓存；
- 证明冲突地址和错误缓存地址可以分别点击、分别定位；
- 验证冲突警示样式在专业明/暗主题和正常/紧凑视口下可用；
- 对超过资源上限的诊断地址显式提示截断；
- 保持源文件不变，并继续阻断数组计算与写回。

## 2. 受控诊断 fixture

文件：

- `src-tauri/tests/fixtures/workbook/array-formula-conflict-diagnostic.xlsx`
- `src-tauri/tests/fixtures/workbook/array-formula-conflict-diagnostic.json`
- `scripts/generate-x3-b4-array-conflict-fixture.ps1`

fixture 基于已完成 WPS 原生另存、退出和独立复开的 X3-B2 样本派生，仅修改动态数组声明 `D2:D4` 内两个缓存单元格：

| 地址 | 受控内容 | 诊断语义 |
| --- | --- | --- |
| `D3` | 标量公式 `=1+1`、缓存数值 `2` | 非锚点外来公式冲突 |
| `D4` | 标准错误缓存 `#DIV/0!` | 错误缓存地址 |

最终缓存类型为“数值 2 / 错误 1”，spill 状态为 `potential_conflict`。

该 fixture 是隐私净化的受控诊断派生物，不计入真实生产者矩阵。它也不声称 `#DIV/0!` 是 Excel 动态数组计算得到的 `#SPILL!`。

## 3. 兼容性发现

首次桌面审计使用 `#SPILL!` 作为缓存错误值时，工作表完整打开链路被 Calamine 拒绝，错误为：

```text
Unsupported cell error value '#SPILL!'
```

语义读取器能够观察 OOXML 的 `t="e"` 与地址，但页面值读取器无法把该新错误码映射为已支持的单元格错误。为避免把模拟值误当作真实 Excel 计算结果，本阶段改用公开基线已支持的 `#DIV/0!` 验证“错误缓存地址”能力，同时继续使用结构化外来公式验证潜在冲突。

后续若要显示 `#SPILL!`，必须先扩展底层错误值兼容层并单独建立真实生产者证据，不能绕过解析错误。

## 4. 产品能力

原有 `WorkbookView` 增强后具备：

- 缓存类型摘要：“数值 2 / 错误 1”；
- `定位冲突 D3` 按钮；
- `定位错误缓存 D4` 按钮；
- 冲突单元格红色斜纹警示；
- 目标单元格选择、公式栏同步和滚动定位；
- 地址超过 256 个时显示“诊断地址已截断（最多显示 256 个）”；
- 数组范围内编辑、重算、写回和结构迁移继续阻断。

功能继续位于统一右侧 XLSX 工作面，没有新增独立页面或窗口。

## 5. 自动化验证

生成 fixture：

```powershell
npm.cmd run generate:x3-b4-array-conflict
```

桌面审计：

```powershell
npm.cmd run audit:x3-b4-array-conflict-desktop
npm.cmd run check:x3-b4-array-conflict-desktop
```

真实 Tauri/WebView2 共通过 12 项检查：

1. 专业浅色主题；
2. 冲突与缓存类型摘要；
3. 两个不同地址的诊断按钮；
4. 数组编辑与重算阻断；
5. 冲突 `D3` 精确定位及警示样式；
6. 1280×800 布局不溢出；
7. 专业深色主题；
8. 错误缓存 `D4` 精确定位；
9. 错误地址与冲突地址保持独立；
10. 定位后按钮继续可见；
11. 1024×720 紧凑布局不溢出；
12. 源 fixture SHA-256 不变。

证据：

- `docs/evidence/x3-b4-xlsx-array-conflict-desktop/audit-manifest.json`
- `professional-light-conflict-d3-1280.jpg`
- `professional-dark-error-cache-d4-1024.jpg`

两张截图已人工和浏览器双重复核，尺寸分别为 1280×800 与 1024×720。

## 6. 资源与回归测试

Rust 回归覆盖：

- 受控 fixture 的缓存类型、错误地址、冲突地址和源字节不变；
- 258 个错误缓存、257 个冲突时，总数保持完整；
- 两类地址列表均限制为 256；
- 错误地址范围为 `A1…A256`，冲突地址范围为 `A2…A257`；
- `diagnosticCellsTruncated` 必须为真。

机器契约校验 fixture SHA-256、`D3/D4` 语义、UI 截断文案、Rust 测试名称、桌面 12 项检查以及计算/写回边界。

## 7. 能力边界

- `potential_conflict` 仍是序列化 OOXML 结构信号，不是 Excel 计算结果。
- 当前只验证标准错误缓存 `#DIV/0!`；`#SPILL!` 页面值解析仍未支持。
- 受控诊断 fixture 不计入 Excel/WPS/LibreOffice 真实生产者矩阵。
- 真实生产者仍只有 WPS Spreadsheets，矩阵保持 `1/3 partial`。
- 期望 spill 计算、数组公式编辑、缓存写回和数组范围结构迁移继续阻断。
- 公开能力继续标记“受限”。

## 8. 下一阶段：X3-B5

建立外部生产者证据交接协议：

1. 为正版 Microsoft Excel 和 LibreOffice Calc 生成独立执行入口；
2. 固定打开、原生保存、应用退出、独立复开和 LongEdit 反向语义读取步骤；
3. 导出带生产者身份、版本、SHA-256 和完整门禁结果的证据包；
4. 对路径穿越、缺失文件、身份伪造、摘要漂移和语义不符的包安全拒绝；
5. 只有矩阵达到 `3/3` 后，才评估将数组只读显示从“受限”提升为“支持”。

## 9. 收口结果

完整 `npm.cmd run ci:check` 已通过：

- 前端类型检查和生产构建：通过；
- 工作簿机器契约：17 项公开能力行通过；
- X3-B4 桌面证据：12 项检查、2 张截图通过；
- Rust 功能测试：`382/382`；
- Rust 性能测试：`1/1`；
- 100 MiB PDF range 基准：54 ms；
- 生产依赖安全审计：0 个漏洞。

保留提示仅有既有前端大 chunk 警告和 Windows Rust 增量目录清理警告，不影响门禁结论。
