# M5-1 ODP 幻灯片正文生产者保真与对象选择审计

审计日期：2026-08-31

当前公开/运行时版本：`1.0.16`

开发目标：`1.0.17`

阶段结论：**通过；唯一接续点为 M5-2 ODP 简单幻灯片正文可靠副本基础**

## 1. 开发目标审计

M5-1 只回答一个问题：LibreOffice Impress 与 Microsoft PowerPoint 真实生成的 ODP 中，哪一类文字对象具备足够一致的跨生产者可见性，可以进入下一阶段的后端可靠副本实现。该阶段没有修改产品代码、格式注册表或二进制版本，也没有开放 ODP 编辑入口。

结论是：只选择**不含复杂对象的幻灯片中，直接位于 `draw:frame/draw:text-box/text:p` 的段落**。备注、列表、字段、媒体、动画、母版及含 `draw:custom-shape` 等复杂对象的整张幻灯片均不进入 M5-2。

## 2. 真实测试：预期、实际与修正

测试脚本分别让 LibreOffice Impress 26.2.4.2 和 PowerPoint 16.0 生成项目自有内容的两页 ODP。每个生产物都进行 ZIP/XML 对象盘点、PowerPoint 语义重开，以及 LibreOffice 隔离配置 PDF 渲染；重开前后比较源 SHA-256。原始生产物只保留在临时目录，仓库只提交去路径化的结构化证据。

| 步骤 | 预期 | 实际 | 修正 |
| --- | --- | --- | --- |
| PowerPoint 自动化初始化 | `DisplayAlerts=0` 可用 | COM 属性要求严格 `PpAlertLevel`，首次在产物前失败 | 改用 `ppAlertsNone=1`，并显式释放 COM 生命周期 |
| 带样式的 LibreOffice 页 | 4 个正文标记可被 PowerPoint 找回 | ODP XML 与 LibreOffice 渲染均有 4/4，PowerPoint 只有闭合页 1/4 | 去除手写样式，单独验证样式假设 |
| 无样式但带自定义形状的页 | 去除样式后恢复 4/4 | 仍为 1/4；PowerPoint 对含自定义形状的第一页显示 0 个形状 | 反证样式根因，改为隔离复杂对象并按整页阻断 |
| 仅直接文本框的简单页 | 两生产者各 4/4，且源文件不被重开修改 | LibreOffice 与 PowerPoint 生产物均由 PowerPoint 找回 4/4；两者均被 LibreOffice 成功渲染，源摘要不变 | 冻结简单页直接文本框段落为唯一候选 |

最终 LibreOffice ODP 为 12,049 bytes，PowerPoint 找回 4/4 正文，LibreOffice 渲染 PDF 为 17,253 bytes；最终 PowerPoint ODP 为 46,981 bytes，PowerPoint 找回 4/4 正文，LibreOffice 渲染 PDF 为 15,580 bytes。两条路径的源摘要均不变。

备注没有达到共同保真：PowerPoint 生产物保留 `M5_PPT_NOTE`，LibreOffice 的 FODP→ODP 路径丢失 `M5_LO_NOTE`。PowerPoint 生产物还含一个复杂形状；它只用于证明对象库存能够识别复杂对象，不代表该对象可编辑。WPS Presentation 12.1.0.28043 可用，但不属于 M5-1 已冻结的必需矩阵。

## 3. 对象选择与安全边界

- 可进入 M5-2：简单幻灯片上的直接文本框段落。
- 必须整页阻断：任何含自定义形状或其他复杂对象的幻灯片；本轮真实差异说明只跳过复杂形状本身仍可能造成跨生产者整页丢失。
- 继续只读：作者备注、列表、字段、媒体、动画、母版及所有未单独证明的对象。
- 保存边界：M5-2 只能可靠另存新副本，必须先有有界库存，源文件摘要必须不变，不允许覆盖源文件。
- 能力边界：ODP 继续保持 `preview-only`、writer 为 `null`、保存模式为 `none`，直到后端退出审计通过。

## 4. 需求对齐与接续点

本阶段满足“真实代码与真实生产者测试”“记录预期和实际差异”“根据差异修正”“阶段结束审计、文档更新和推送”的要求。证据位于 [`evidence/post-v116-m5-1-odp-producer-selection/producer-selection.json`](./evidence/post-v116-m5-1-odp-producer-selection/producer-selection.json)，可由审计脚本重新生成并由静态门禁复核。

唯一接续点为 **M5-2 ODP 简单幻灯片正文可靠副本基础**：先实现后端有界库存、复杂对象整页拒绝、直接文本框段落替换、原子可靠新副本和双生产者重开测试。M5-2 不开放 UI、不编辑备注、不覆盖源文件、不提升 `1.0.16` 二进制版本。

## 5. 阶段退出审计

- 开发目标：已完成，唯一候选对象类已冻结。
- 需求对齐：已完成，所有失败尝试及修正均进入证据。
- 真实测试：必需矩阵通过；两生产者正文均为 4/4，LibreOffice 双向渲染成功，源摘要不变。
- 文档与事实源：已更新；ODP 产品能力没有提前提升。
- 接续开发：只进入 M5-2 后端可靠副本基础。
