# P0 格式能力声明与发布事实对齐审计

> 审计日期：2026-08-15
>
> 基线版本：`1.0.10`
>
> 需求：按照“日常管理、基础编辑、成体系管理”的初始目标，先保证公开说明不超过正式注册和真实证据，再逐阶段增强格式编辑能力。
>
> 结论：**P0-A 能力声明纠偏已完成；P0-B `1.0.9 -> 1.0.10` 真实更新观察保持 pending。**

## 1. 本阶段问题

公开 README 曾把 `XLSX / XLSM / XLSB` 合并描述为工作簿编辑能力，但 `shared/file-formats.json` 的正式工作簿注册只有 `.xlsx`。这会把未注册的宏工作簿和二进制工作簿误写成现有产品能力。

ODF/WPS 汇总行也没有明确区分以下边界：

- `.ods/.odp` 是软件内只读预览；
- `.odt` 已有受限预览代码，但 WPS 生产者门禁仍为 2/3，尚未正式注册；
- `.wps/.et/.dps` 只交给外部桌面应用，不在软件内解析、索引或写回。

## 2. 已完成修复

1. README 工作簿行只声明正式注册的 `.xlsx`。
2. README 明确 ODS、ODP、ODT 与 WPS 原生格式的不同边界。
3. `check-format-contract` 新增公开说明门禁：
   - 工作簿注册必须继续明确为 `.xlsx`；
   - README 必须出现独立 `XLSX` 能力行；
   - README 出现未注册的 `XLSM/XLSB` 承诺时直接失败。
4. 开发对齐文档把历史 `v1.0.6` 证据与当前 `v1.0.10` 事实分开，并登记后续格式增强顺序。

## 3. 当前权威能力

- 版本：`1.0.10`
- 格式：43 类、91 个注册扩展名
- 发布状态：30 类已验证、7 类有限能力、6 类外部依赖
- 工作簿软件内编辑入口：`.xlsx`
- ODF：`.ods/.odp` 只读；`.odt` 未注册
- WPS 原生：`.wps/.et/.dps` 外部程序交接

机器事实源仍为：

- `shared/file-formats.json`
- `shared/release-capability-matrix.json`
- `shared/v1-community-release-policy.json`

## 4. 更新链证据边界

仓库当前只有截至 `v1.0.9` 的受管更新工作流与已导入证据。`v1.0.10` 发布回执明确记录 `1.0.9-to-1.0.10-pending`，因此本阶段不能宣称真实升级已经通过。

下一独立步骤必须先建立 v1.0.10 专用策略、托管 Windows 工作流、安装编排、WebView 探针和证据校验；推送并通过源码门禁后，再由一次性 Windows 从官方 v1.0.9 安装包执行真实应用内升级。只有 12 项生命周期检查、截图、二进制身份和资料保留证据全部导入后，才能把 pending 改为 passed。

## 5. 验证

- `npm.cmd run check:format-registry`
- `npm.cmd run check:ui4c-release-fact-alignment`
- `npm.cmd run check:current-development-audit`
- `npm.cmd run build`

## 6. 下一步

进入 **P0-B v1.0.10 受管更新证据链**。该步骤只建立并执行发布后验证，不混入图片、PDF 或 Office 新功能；真实证据完成后再进入图片基础编辑阶段。
