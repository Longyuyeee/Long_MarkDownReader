# C5A2 PPTX 图片输出三生产者复开审计

> 审计日期：2026-07-28
> 基线版本：LongEdit `v0.7.0`
> 输入阶段：C5A1 隔离图片替换与可靠新副本
> 结论：C5A2 完成，下一开发入口为 C5B 基础形状增删

## 1. 审计目标

C5A1 已证明 LongEdit 能在单引用、同格式、PNG/JPEG 和 8 MiB 上限内，只替换一个 PPTX 媒体部件并生成可靠新副本。C5A2 不增加编辑能力，只关闭该输出在真实外部 Office 软件中的复开门禁：

1. PowerPoint 和 WPS Presentation 以只读方式打开输出；
2. 保留三页结构，并直接读取第 2 页的目标嵌入图片；
3. 将目标图片解码导出为非空 PNG；
4. LibreOffice Impress 使用隔离用户配置打开并渲染完整演示文稿；
5. 只读重开前后输出 SHA-256 完全一致；
6. 将 3/3 生产者矩阵纳入 CI。

## 2. 锁定对象与包差异

- 输出：`fixtures/pptx/output-reopen/c5a-image-copy.pptx`
- 文件大小：`92106` 字节
- SHA-256：`ad25ec6bfb35c5db2f250db160c3c89ee3bacdec88a4bb557c315c93f912bcc3`
- 目标幻灯片：第 2 页
- 目标对象：`WPS producer image`
- 目标对象类型：嵌入图片
- 唯一变化部件：`ppt/media/image1.png`
- 原媒体大小：`5123` 字节
- 替换媒体大小：`2963` 字节

包级复核确认幻灯片 XML、关系、内容类型及其他部件均未变化；`slide2.xml` 仍通过 `rId1` 指向 `ppt/media/image1.png`。

## 3. 三生产者结果

| 生产者 | 版本 | 结构/对象验证 | 解码或渲染证据 | 结果 |
|---|---|---|---:|---|
| Microsoft PowerPoint | `16.0` | 3 页；第 2 页目标为嵌入图片 | 导出 PNG `42663` 字节 | 通过 |
| WPS Presentation | `12.1.0.26895` | 3 页；第 2 页目标为嵌入图片 | 导出 PNG `2963` 字节 | 通过 |
| LibreOffice Impress | `26.2.4.2` | 隔离配置打开并渲染 3 页 | 输出 PDF `53313` 字节 | 通过 |

PowerPoint 与 WPS 均通过独立 COM 实例只读打开文件，直接按对象名读取图片，并成功调用图片导出。LibreOffice 使用临时用户配置进行无界面 PDF 渲染，未复用现有 Office 会话或用户配置。

## 4. 完整性与只读证明

重开前后 SHA-256 均为：

`ad25ec6bfb35c5db2f250db160c3c89ee3bacdec88a4bb557c315c93f912bcc3`

因此三类外部软件的验收过程没有写回或修复输出文件。C5A1 桌面证据中的大小和哈希、C5A2 提交产物以及 C5A2 矩阵三者一致。

## 5. 自动化与证据

- 验收器：`scripts/verify-c5a2-pptx-image-output-reopen.ps1`
- CI 门禁：`scripts/check-c5a2-pptx-image-output-reopen.mjs`
- 生产者矩阵：`docs/evidence/c5a2-pptx-image-output-reopen/matrix.json`
- C5A1 桌面清单：`docs/evidence/c5a-pptx-image-replacement/audit-manifest.json`

门禁固定检查 3/3 生产者、版本和方法记录、三页结构、目标对象身份、图片/渲染证据、输出大小、C5A1/C5A2 哈希一致性及只读重开前后哈希一致性。

## 6. 结论与边界

C5A2 通过，C5A 图片替换批次整体收口。当前可以准确表述为：

> LongEdit 支持对单引用 PNG/JPEG 图片执行受限、同格式的隔离二进制替换，可靠生成新副本，并已通过 PowerPoint、WPS Presentation 和 LibreOffice Impress 3/3 外部复开。

仍不能宣称：

- 支持共享媒体引用的定向拆分替换；
- 支持 SVG、EMF、WMF、视频、音频或 OLE 对象替换；
- 支持裁剪、滤镜、透明度、图片关系重建或源文件覆盖；
- PPTX 已达到完整 PowerPoint 等价编辑。

下一开发入口为 **C5B 基础矩形、椭圆和线条的安全新增/删除**。继续沿用源文件不变、新副本、包差异、应用内复读及三生产者复开的门禁。
