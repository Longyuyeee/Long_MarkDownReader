# C0-2B WPS Writer 生产者证据审计

> 审计日期：2026-07-27
>
> 阶段范围：WPS Writer 真实生产者 DOCX、隐私处理、原生产者重开与解析回归
>
> 结论：C0-2B 已完成；C0-2 三生产者矩阵达到 3/3

## 1. 真实环境

- 生产者：WPS Writer
- WPS Build：`12.1.0.26895`
- 文件版本：`12.1.0.26895`
- 自动化接口：`KWPS.Application`
- 可执行程序：`C:\Program Files (x86)\WPS Office\12.1.0.26895\office6\wps.exe`

生成器创建独立隐藏 WPS 实例，不关闭或复用用户当前打开的 WPS 窗口。仓库不提交 WPS 安装包、用户配置、缓存或安装日志。

## 2. 可重复生成链

新增 `scripts/generate-c0-wps-docx-fixture.ps1`：

1. 生成项目自有文字与确定性 PNG；
2. 通过 `KWPS.Application` 创建标题、两项列表、表格、显式分页和内嵌图片；
3. 由 WPS Writer 以 Office Open XML 文档格式保存；
4. 定向替换 OOXML 作者字段，并移除 WPS `<Application>` 中 GUID 形态的安装实例后缀；
5. 扫描最终包，拒绝本机用户名、用户目录、临时图片路径和外部关系；
6. 启动新的隐藏 WPS 实例，只读重开最终 DOCX 并恢复预期标题；
7. 仅在重开成功后生成版本、哈希、许可和结构清单。

最终 fixture 仅包含项目自有文字和图片，可随仓库再分发。

## 3. 匿名化缺陷审计

首轮内部候选曾使用“全局替换用户缩写”的方式处理元数据。当前 WPS 用户缩写为单个数字，导致该候选的关系 ID 和 `w3.org` 命名空间被误改。该候选虽然能被 WPS 容错重开，但不满足 OOXML 保真要求，因此未进入矩阵。

最终生成器只修改明确的作者字段和 WPS 安装实例后缀，不再全局替换短字符串。重新生成后的命名空间、关系 ID、内部图片关系和生产者版本标识均保持有效，并再次通过 WPS 原程序重开。

## 4. 版本化证据

- DOCX：`fixtures/docx/producers/wps-writer.docx`
- 清单：`fixtures/docx/producers/wps-writer.json`
- DOCX 大小：`83,349` 字节
- SHA-256：`0da9fad1284dcddc27689f381c26fd7f52d82f154e8a5cf152faebb7b206868b`
- 应用标识：`WPS Office_12.1.0.26895`
- 审计身份：`LongEdit C0-2B Audit`
- 原生产者重开：`true`

清单哈希由独立矩阵门禁重新计算，fixture 小于防空壳阈值或存在缺失清单时无法进入 `verified`。

## 5. 解析与运行时判定

Rust 回归验证：

- 应用标识对应 WPS Office `12.1.0.26895`；
- 生产者身份为 `LongEdit C0-2B Audit`；
- 标题、2 个列表项、1 个表格、显式分页和内嵌图片可恢复；
- 图片为内部可渲染部件；
- Word、WPS、LibreOffice 三项均为 `verified`，且没有环境依赖字段。

C2E0 运行时保存准备报告现在返回：

- `producerEvidence = ["microsoft-word-16", "wps-writer", "libreoffice-writer"]`
- `missingProducerEvidence = []`
- 不再产生任何 `producer_evidence_missing:*` blocker

生产者证据完成不会自动开放保存。C2E 仍保持 `blocked_readiness_only`，并由 `docx_save_command_not_enabled`、源签名、目标冲突和禁止覆盖等独立门禁约束。

## 6. 阶段判定

C0-2 已达到 **3/3**：

| 生产者 | 状态 |
| --- | --- |
| Microsoft Word | `verified` |
| WPS Writer | `verified` |
| LibreOffice Writer | `verified` |

下一开发入口切换为 **C2E DOCX 可靠另存闭环**。该阶段必须基于 C2A～C2D 已验证的隔离输出，实现无覆盖目标写入、写后语义复读、三生产者重开和真实桌面验收；在完成前不得覆盖用户原件。

## 7. 最终仓库门禁

- DOCX 生产者矩阵：`3/3 verified`，pending 为 none；
- Rust 功能测试：`312/312`；
- Rust 性能测试：`1/1`；
- 真实 Tauri 桌面证据：`35/35`，27 张截图；
- 前端生产构建、Vue 类型检查、格式/主题/图谱/PDF/工作簿/XLSX 契约通过；
- 生产依赖审计：0 个漏洞；
- Tauri Debug 无打包构建成功。

构建仅保留既有的大分包体积警告，不影响本阶段验收。
