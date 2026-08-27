# E1C ODS/ODP 只读预览与索引审计

日期：2026-07-30
阶段：E1C
结论：`.ods/.odp` 已完成真实 ODF 样本、有界语义解析、原 Library 右侧结构化预览、全文搜索、精确定位和源文件不变证明；编辑、创建、公式计算、复杂演示还原和写回继续不支持。

## 1. 已交付

- 共享格式注册新增 `ods` 与 `odp`，能力为 `preview-only / saveMode:none`，读取和索引 supported，编辑与创建 unsupported。
- 解析前强制复用 E1A ODF 包验证器，校验 mimetype、manifest、ZIP 路径、压缩比、XML 深度/事件和风险项；加密内容不进入语义预览。
- ODS 提取工作表、非空行、单元格地址、显示文本、值类型和公式标记；公式只显示生产者缓存值，不在 LongEdit 内计算。
- ODP 提取幻灯片顺序、名称、正文文本、生产者实际保留的备注和图片引用计数；动画、母版和复杂媒体保持降级。
- 限制 128 个工作表、20,000 个可见行、1,024 列、200,000 个非空单元格、2,000 张幻灯片和 4,000,000 个文本字符。
- ODS 重复空行/空列只推进逻辑坐标，不展开为大内存对象；非空重复内容受预览预算限制。
- 搜索索引为 ODS 单元格生成 `ods-cell` locator，为 ODP 正文/备注生成 `odp-slide` / `odp-notes` locator；搜索结果返回原 Library 右侧工作面。
- WorkspaceGuard 命令读取前后复核源字节并返回 SHA-256，不提供任何保存命令。

## 2. 真实证据

| 格式 | 文件 | 大小 | SHA-256 |
| --- | --- | ---: | --- |
| ODS | `longedit-e1c-spreadsheet.ods` | 8411 | `bdcb998b191da9047b29d8a2a9b67faf1564f5826c723c7a079ada2eda9a316c` |
| ODP | `longedit-e1c-presentation.odp` | 15864 | `8ef886d0370d18a497ceb7811ed845a1f4d73064ae4a20cf37e0e1eb22554f52` |

样本由项目自有 FODS/FODP 种子经 LibreOffice Calc/Impress `26.2.4.2` 使用隔离配置生成，并分别由另一套全新配置重开导出 PDF。manifest 固定文件大小、摘要、ZIP 签名、生产者版本、独立重开和源文件不变事实。

LibreOffice 本次从 FODP 导出 ODP 时没有保留种子中的演讲者备注文本，因此真实 ODP 基线不宣称备注生产者证据。解析器另有受控 ODF XML 测试，证明生产者实际保留备注时可生成 `odp-notes` locator；后续生产者矩阵仍需复核各应用的备注保真。

2026-08-27 M1C-A 复核发现原 FODS 公式种子会被 LibreOffice 规范化为无效的 `of:=of:=SUM` 和 `错误:510`。种子已修正，当前真实 ODS 包含 `of:=SUM([.A2];8)` 与缓存值 `50`；ODS/ODP 均重新由 LibreOffice 26.2.4.2 隔离生成和独立复开，因此上表大小与摘要同步更新。只读产品边界不变。

## 3. 产品边界

- ODS 不是 XLSX 等价编辑器：不计算公式、不处理宏、不编辑单元格、不写回。
- ODP 不是 PowerPoint/Impress 等价编辑器：不还原动画、切换、母版、复杂图表或媒体播放。
- 外部链接不跟随，脚本和嵌入对象不执行，签名只识别不验证。
- 当前真实生产者基线为 LibreOffice `1/3`；Microsoft Office 与可信 WPS 的 ODS/ODP 生产者差异留在 R 发布矩阵，不伪造完成。
- E1B WPS ODT 仍为 `2/3` 外部门禁；E1C 不注册 `.odt`，也不改变其发布状态。

## 4. 门禁

- `npm.cmd run check:e1c-ods-odp-contract`：通过。
- `npm.cmd run check:format-contract`：通过，39 类格式、71 个扩展名。
- `npm.cmd run build`：通过。
- E1C Rust 定向测试：`4 passed`，覆盖真实 ODS/ODP、跨格式拒绝、备注保留路径、搜索 locator 和命令级源字节不变。
- 持久化知识索引真实 fixture 回归：`1 passed`，ODS 单元格和 ODP 幻灯片 locator 均进入 snapshot。
- 共享 Office 审计与格式注册测试：通过。
- `npm.cmd run ci:check` 已通过构建、全部共享契约链和 Rust 功能测试（`406 passed; 2 ignored; 1 filtered out`），但本机既有 XLSX 性能门禁两次采样的 patch 阶段为 `7217ms` / `9076ms`，超过发布阈值，因此完整命令以失败退出；阈值未放宽，最终以推送后的 GitHub Quality Gate 干净环境结果复核。
- 中断后独立补跑 `benchmark:pdf-range`：100 MiB 文件 `1068ms`，请求约 `255.9 KiB`；`audit:prod` 为 `0 vulnerabilities`，`cargo check --locked` 通过。
- 实现提交 `1a2780a` 的 GitHub Quality Gate 已在干净环境完整通过，耗时 `10m50s`：<https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30522399662>。唯一 annotation 是 `actions/setup-node@v4` 的 Node 20 action runtime 弃用维护提示，不影响本阶段验收，留给 R 阶段升级 CI action。

## 5. 下一阶段

下一代码阶段为 **R：统一发布矩阵与基础版本收口**：

1. 汇总 39 类格式的真实用户能力、保存模式、外部依赖和已知限制。
2. 为 ODS/ODP 补充桌面布局、搜索与 locator 场景，并扩展可信生产者差异矩阵。
3. 验证安装包、文件关联、迁移恢复、隐私和干净机器首次运行。
4. 将 E1B WPS ODT、X3-B6 数组生产者等外部证据门禁继续单列，不阻塞可独立发布的安全能力，也不伪造关闭。
5. 完整 CI 与发布说明通过后，形成基础版本候选。
