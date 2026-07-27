# C4E PPTX 输出副本外部生产者复开审计

> 日期：2026-07-27
> 当前状态：已完成，`3/3 verified`
> 已验证：Microsoft PowerPoint 12.0、WPS Presentation 12.1.0.26895、LibreOffice Impress 26.2.4.2
> 下一入口：C5 PPTX 更高风险对象编辑，首批为隔离图片替换

## 1. 阶段目标

C4D 已证明 LongEdit 能安全生成受限编辑副本，但应用自身能够复读并不等于外部 Office 软件一定接受输出。C4E 使用同一组三个真实输出副本，分别交给 PowerPoint、WPS Presentation 和 LibreOffice Impress 打开。

本阶段只验证：

1. 文本副本恢复目标文本和三页结构；
2. 样式副本恢复 `24 pt / Aptos / #2f6fed / 居中` 的形状文本；
3. 无障碍副本恢复图片替代文本；
4. 外部程序只读打开，不改变源文件或输出证据；
5. 三类生产者必须分别提供真实证据，不能相互替代。

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

| 操作 | 输出文件 | 外部语义 |
|---|---|---|
| 文本 | `c4e-text-copy.pptx` | `LongEdit C4E WPS Text` |
| 形状文本样式 | `c4e-style-copy.pptx` | 24 pt、Aptos、`#2f6fed`、居中 |
| 图片替代文本 | `c4e-alt-text-copy.pptx` | `LongEdit C4E WPS accessible picture` |

生成报告记录源文件和三个输出的 SHA-256、字节数与 `sourceUnchanged=true`。输出样本位于 [`fixtures/pptx/output-reopen`](../fixtures/pptx/output-reopen)，矩阵位于 [`docs/evidence/c4e-pptx-output-reopen/matrix.json`](./evidence/c4e-pptx-output-reopen/matrix.json)。

## 3. 外部复开结果

| 生产者 | 实际版本 | 状态 | 验证方法 |
|---|---:|---|---|
| Microsoft PowerPoint | 12.0 | `verified` | 新 `PowerPoint.Application` 实例只读打开三个输出，恢复三页结构、文本、样式与替代文本 |
| WPS Presentation | 12.1.0.26895 | `verified` | 新 `KWPP.Application` 实例只读打开三个输出，恢复三页结构、文本、样式与替代文本 |
| LibreOffice Impress | 26.2.4.2 | `verified` | 原厂 MSI 管理映像中的真实 `soffice` 使用独立用户配置逐一打开三个输出，并渲染为非空 PDF |

本机 Codex 进程没有管理员令牌，LibreOffice MSI 的 `Privileged` 启动条件不允许系统安装。因此使用 Windows Installer 官方管理映像模式解包原厂、SHA-256 校验一致的 MSI；没有注册组件、修改文件关联或依赖模拟实现。实际执行版本为 `LibreOffice 26.2.4.2 0229ac93fcf0d7cbc6376066c6f35021cef002dc`。

PowerPoint 版本按实际 COM 返回值记录为 12.0，没有沿用输入 fixture 的 PowerPoint 16 标识。验证完成后，三个输出的哈希仍与生成报告一致，证明只读复开没有改写证据文件。

## 4. 自动化与发布门禁

- `capture-c4e-pptx-output-copies.mjs`：通过真实桌面产品入口生成三个可靠副本；
- `verify-c4e-pptx-producer-reopen.ps1`：自动检测三种外部生产者并执行真实复开；
- `-LibreOfficePath`：允许对已校验的管理映像或非默认安装位置执行真实 Impress 验证；
- `run-c4e-pptx-output-reopen-audit.ps1`：编排隔离工作区、生成、发布和复开；
- `check-c4e-pptx-output-reopen.mjs`：校验生产者状态、输出哈希与生成报告；
- `-RequireComplete`：发布候选必须达到 3/3，否则明确失败。

本次关闭门禁所用命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/verify-c4e-pptx-producer-reopen.ps1 `
  -OutputDirectory fixtures/pptx/output-reopen `
  -ReportPath docs/evidence/c4e-pptx-output-reopen/matrix.json `
  -LibreOfficePath <verified-soffice-path> `
  -RequireComplete
```

默认安装路径存在时无需传入 `-LibreOfficePath`。

## 5. 当前能力判定

C4E 已完成：

- 三种受限操作均形成稳定、可转交的真实输出样本；
- PowerPoint、WPS 与 LibreOffice 对三个样本全部完成实际复开；
- 文本、样式、替代文本和幻灯片数量语义一致；
- 源文件和输出文件保持不变；
- 三生产者输出兼容门禁达到 `3/3 verified`。

PPTX 当前可描述为：

> 已具备结构化阅读、知识管理、受限基础编辑、可靠新副本，以及 PowerPoint/WPS/LibreOffice 三生产者输出复开闭环。

这不等于完整 PowerPoint 编辑器。动画、母版、SmartArt、复杂图表、宏、外链和未知扩展仍保持只读或阻断。

## 6. 下一步

C5 按风险逐批开放，不在一个提交中扩大多个写回面：

1. C5A：隔离图片二进制替换，限制媒体类型/体积并保留原件；
2. C5B：基础矩形、圆形和线条的安全增删；
3. C5C：幻灯片复制、删除与排序；
4. 每批继续执行“隔离预览 → 新副本 → 内部复读 → 外部生产者矩阵”；
5. 未编辑 OOXML 部件必须通过差异门禁，任何不确定结构整包拒绝写回。

C4E 已独立收口，可以进入 C5A；仍不开放源文件覆盖。
