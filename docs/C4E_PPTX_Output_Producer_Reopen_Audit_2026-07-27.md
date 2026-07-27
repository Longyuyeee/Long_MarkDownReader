# C4E PPTX 输出副本外部生产者复开审计

> 日期：2026-07-27
> 当前状态：部分通过，`2/3 verified`
> 已验证：Microsoft PowerPoint 12.0、WPS Presentation 12.1.0.26895
> 待补：LibreOffice Impress
> 下一入口：C4E3 LibreOffice Impress 隔离复开与渲染证据

## 1. 阶段目标

C4D 已证明 LongEdit 可以安全生成受限编辑副本，但应用自身能够复读并不等于外部 Office 软件一定接受该输出。C4E 使用同一组三个输出副本，分别交给 PowerPoint、WPS Presentation 和 LibreOffice Impress 真实打开。

本阶段不扩大编辑范围，只验证：

1. 文本副本恢复目标文本和三页结构；
2. 样式副本恢复 `24 pt / Aptos / #2f6fed / 居中` 的形状文本；
3. 无障碍副本恢复图片替代文本；
4. 外部程序以只读方式打开，不能修改源文件或输出证据；
5. 缺失的软件必须记录为 `pending`，不能由内部解析或其他软件代替。

## 2. 可重复输出样本

真实 Tauri Debug / WebView2 通过产品界面执行三次完整链路：

```text
WPS 真实生产者源文件
  → C4A 原件保护基线
  → C4B/C4C 隔离补丁预览
  → C4D 原子无覆盖新副本
  → 应用内结构与语义复读
  → C4E 外部生产者只读复开
```

生成结果：

| 操作 | 输出文件 | 外部语义 |
|---|---|---|
| 文本 | `c4e-text-copy.pptx` | `LongEdit C4E WPS Text` |
| 形状文本样式 | `c4e-style-copy.pptx` | 24 pt、Aptos、`#2f6fed`、居中 |
| 图片替代文本 | `c4e-alt-text-copy.pptx` | `LongEdit C4E WPS accessible picture` |

生成报告同时记录源 SHA-256、三个输出 SHA-256、字节数和 `sourceUnchanged=true`。输出样本位于 [`fixtures/pptx/output-reopen`](../fixtures/pptx/output-reopen)，可在另一台安装了缺失生产者的软件上直接补证。

## 3. 外部复开结果

| 生产者 | 实际版本 | 状态 | 验证方法 |
|---|---:|---|---|
| Microsoft PowerPoint | 12.0 | `verified` | 新 `PowerPoint.Application` 实例以只读方式打开三个输出，恢复三页结构、文本、样式和替代文本 |
| WPS Presentation | 12.1.0.26895 | `verified` | 新 `KWPP.Application` 实例以只读方式打开三个输出，恢复三页结构、文本、样式和替代文本 |
| LibreOffice Impress | 未安装 | `pending` | 待用独立用户配置执行三个 PPTX 的 headless PDF 渲染 |

PowerPoint 版本按实际 COM 返回值记录为 12.0，没有沿用输入 fixture 的 PowerPoint 16 标识。WPS 与 PowerPoint 复开后重新计算的三个输出哈希与生成报告一致，证明只读复开没有改变证据文件。

## 4. 自动化与发布门禁

新增工具：

- `capture-c4e-pptx-output-copies.mjs`：通过真实桌面产品入口生成三个可靠副本；
- `verify-c4e-pptx-producer-reopen.ps1`：自动探测三种外部生产者并执行真实复开；
- `run-c4e-pptx-output-reopen-audit.ps1`：隔离工作区、生成、发布和复开的完整编排；
- `check-c4e-pptx-output-reopen.mjs`：校验生产者状态、输出哈希、生成报告和 pending 依赖；
- `-RequireComplete`：发布候选必须达到 3/3，否则明确失败。

当前普通 CI 接受诚实的部分矩阵，但至少要求 WPS 真实复开证据持续存在；正式标记 C4E 完成时必须执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/verify-c4e-pptx-producer-reopen.ps1 `
  -OutputDirectory fixtures/pptx/output-reopen `
  -ReportPath docs/evidence/c4e-pptx-output-reopen/matrix.json `
  -RequireComplete
```

## 5. 当前能力判定

C4E1/C4E2 已完成：

- 三种受限操作均形成稳定、可转交的真实输出样本；
- PowerPoint 与 WPS 对三个样本均完成实际复开；
- 文本、样式、替代文本和幻灯片数量语义一致；
- 源文件和输出文件均保持不变；
- 缺失 LibreOffice 时不会虚假标记 3/3。

C4E 整体尚未完成。PPTX 当前仍应描述为：

> 已具备结构化阅读、知识管理、受限基础编辑和可靠新副本；输出已通过 PowerPoint/WPS 复开，LibreOffice 输出复开待补。

## 6. 下一步

C4E3 在安装 LibreOffice Impress 的 Windows 环境执行：

1. 拉取本提交并确认三个输出 SHA-256；
2. 运行统一验证器，使用独立 LibreOffice 用户配置打开并渲染三个输出；
3. 保留版本、退出码、非空 PDF 渲染和文件哈希；
4. 使用 `-RequireComplete` 验证 3/3；
5. 更新矩阵、交接文档和 PR 后独立提交推送。

C4E3 完成前不进入 C5 的图片二进制替换、形状增删或幻灯片结构编辑，避免在输出兼容性尚未完全闭环时扩大风险面。
