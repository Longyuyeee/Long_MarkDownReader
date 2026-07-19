# 完整工作簿引擎技术评估与决策 1.0

状态：S3-7 / FR-DATA-007 已完成  
评估日期：2026-07-19  
决策：当前默认构建不引入 Univer 或其他第三方完整工作簿编辑器；保留隔离式适配层候选。

## 1. 执行摘要

LongEdit 当前需要补足的是“本地知识工作台中的结构化数据闭环”，而不是在应用内复刻 Microsoft Excel。现有原生链路已经覆盖 CSV/TSV 编辑、开放 Table、多视图、专业图表、实时嵌入，以及 XLSX 多 Sheet 只读预览和 Sheet 转 Table。

Univer 的开源核心适合构建内部电子表格，但当前最关键的 XLSX 导入导出、图表、数据透视、打印和协作属于 Pro 边界；XLSX 交换还依赖服务端能力。未授权评估模式存在水印和文件/单元格额度，不能作为正式产品能力。与此同时，最小官方 Sheets Core preset 已显著扩大前端依赖和主包，并把 React/Radix 运行时带入现有 Vue/Tauri 应用。

因此本阶段的选择是：

1. 继续以普通本地文件作为事实源，XLSX 默认只读并显式转换为开放 Table 后编辑。
2. 下一阶段优先实现原生仪表盘和共享筛选，使已有 Table/图表能力形成更强的业务工作面。
3. 只有在“完整 XLSX 往返”成为已批准的商业需求，并明确接受商业许可与可选服务端后，才启动隔离式 Univer Pro POC。

## 2. 评估问题与通过门槛

| 维度 | 必须回答的问题 | 通过门槛 |
|---|---|---|
| 许可 | 默认发行物能否合法、无水印地提供目标能力 | 许可成本和再分发条件已书面批准 |
| 离线 | 打开、编辑、保存能否不依赖远程服务 | 本地优先场景完整可用；联网能力必须可选 |
| XLSX 往返 | 样式、公式、图表等能否安全保真 | 有真实 fixture 差异报告，不以“能打开”代替保真 |
| 数据模型 | 是否继续以用户文件为事实源 | 不把私有快照或远端数据库变成唯一事实源 |
| 集成 | 是否适配 Vue 3、Tauri、当前安全边界 | 路由级隔离、延迟加载、可释放、无全局污染 |
| 体积与性能 | 冷启动、首屏、内存和构建产物是否可控 | 独立 chunk，有明确预算，不拖慢 Markdown 核心路径 |
| 可维护性 | 版本、插件和服务端是否可独立升级 | 精确锁版本，有兼容矩阵、回滚和退出方案 |

任何一个强制门槛未通过，都不能进入默认构建。

## 3. 候选方案审计

### 3.1 Univer 开源核心

- 官方仓库采用 Apache-2.0，并把基础表格、公式、格式和插件架构作为开源能力。
- 官方安装文档要求所有 Univer 包版本一致；preset 集成方便，但只能按 preset 粒度延迟加载，plugin 模式才适合细粒度按需加载。
- 适合建立“应用内部工作簿”，但不能单独满足本项目最关注的完整 XLSX 往返和图表目标。

结论：技术上可运行，业务目标覆盖不足；不应只为获得网格编辑而替换已经稳定的开放 Table 工作面。

### 3.2 Univer Pro

- 官方将 XLSX 导入导出、Charts、Pivot、打印、协作等列为 Pro 能力。
- 官方导入导出文档说明该能力依赖 Univer Server；这与默认纯本地链路存在架构冲突。
- 未提供许可证时，评估模式包含水印及导入大小、导出单元格数等限制，不能作为正式发行方案。

结论：只有在商业许可、部署模型和数据边界获批后才可 POC；当前不满足许可与离线强制门槛。

### 3.3 Handsontable

- 适合可嵌入数据网格，但当前版本使用商业/非商业评估许可，并非完整 XLSX 兼容引擎。
- 即使购买许可，仍需另建 XLSX 解析、公式、样式、图表和往返体系。

结论：不能解决本阶段核心缺口，且会与现有 Table 网格功能重叠，不引入。

### 3.4 Luckysheet

- 历史项目使用 MIT，但官方 GitHub 仓库已归档并明确进入 EOL，推荐迁移到 Univer。

结论：维护风险不可接受，排除。

### 3.5 当前原生方案

- CSV/TSV 与 `.table.json` 可编辑、可审计、可通过 Git/网盘同步。
- 图表、看板、Markdown/Canvas 引用均消费同一行数据，不创建隐藏副本。
- `calamine` 提供受知识库边界保护的 XLSX 分页读取；原文件不被修改，选中 Sheet 转 Table 后进入完整编辑闭环。
- 缺点是不能编辑原 XLSX，也不还原样式、图表或重算公式。

结论：当前最符合本地优先、开放格式和渐进增强原则，继续作为默认方案。

## 4. 实测数据

测量环境为本项目 Node/Vite 工具链，候选版本统一锁定为 Univer `0.25.1`。试验项目只创建一个空白工作簿，导入 `@univerjs/presets`、`@univerjs/preset-sheets-core`、中文 locale、CSS、`rxjs`、React 和 ReactDOM，尚未加入任何 Pro 能力。

| 指标 | 实测结果 |
|---|---:|
| npm 安装包数 | 223 |
| `node_modules` 文件数 | 22,592 |
| `node_modules` 磁盘占用 | 198 MiB |
| Vite 转换模块数 | 2,590 |
| 主 JS（minified） | 5,846,948 bytes |
| 主 JS（gzip） | 1,650.76 KiB |
| 主 CSS（minified） | 84.19 KiB |
| 主 CSS（gzip） | 12.92 KiB |

这些数字是“最小官方 preset 试验”的测量值，不代表经过 plugin 模式、拆 chunk 和裁剪后的理论下限；但已经证明引擎必须独立加载，不能进入 Markdown/知识图谱的公共启动路径。更重要的是，这个成本仍未购买或覆盖完整 XLSX 和 Charts。

## 5. 架构决策

### ADR-WB-001：默认不集成完整第三方工作簿引擎

决定：

- 保持 `WorkbookView` 为受限只读入口。
- 保持 `.table.json` 为 LongEdit 可编辑结构化数据格式。
- 保持转换创建新文件，不静默覆盖 XLSX。
- 不在 `package.json` 中加入 Univer、Univer Pro、Handsontable 或 Luckysheet。
- 不宣称当前能力等同 Excel。

影响：

- 用户可以安全查看和提取 XLSX 数据，但不能在 LongEdit 中原样编辑工作簿。
- 团队把近期投入放到知识图谱、思维导图、仪表盘和跨对象引用等差异化能力。
- 如果未来批准商业方案，接入必须经过新的 ADR，而不是直接替换现有 Table。

## 6. 可选引擎适配边界

未来 POC 应在独立路由和动态 chunk 中实现，不让第三方工作簿模型渗入业务层。概念接口如下：

```ts
interface WorkbookEngine {
  capabilities(): WorkbookCapabilities
  open(source: WorkbookSource): Promise<void>
  snapshot(): Promise<PortableWorkbookSnapshot>
  exportXlsx(target: string): Promise<ExportReport>
  dispose(): Promise<void>
}
```

约束：

- `WorkbookSource` 只能来自 `WorkspaceGuard` 授权的文件或受控临时副本。
- 引擎快照不是永久唯一事实源；导出必须生成可检查的失真报告。
- UI 通过路由级动态导入，单独设置包体、内存和首屏预算。
- 第三方运行时异常不得阻断 Markdown、Canvas、图谱和 Table。
- 版本必须精确锁定；Pro 客户端与服务端版本形成兼容矩阵。

## 7. 重新评估触发条件

只有同时满足以下条件才进入 Univer Pro POC：

1. 已有明确目标客户和至少三个必须原样往返的真实 XLSX fixture。
2. 商业许可、离线/私有部署、遥测和再分发条款通过法务与预算审批。
3. 产品接受可选服务端，或供应商提供满足要求的完全本地交换方案。
4. POC 通过样式、公式、图表、合并单元格、条件格式和大文件差异测试。
5. 路由级懒加载后，Markdown 冷启动与默认构建预算不回退。
6. 有禁用、回滚和导出退出方案，用户不会被锁在专有快照中。

## 8. 后续实施顺序

1. S3-8 / FR-DATA-008：基于开放 Table 实现仪表盘、共享筛选和布局持久化。
2. 补充 XLSX 兼容 fixture 与差异报告框架，为未来引擎 POC 准备统一验收集。
3. 需求证据充足时再决定是否立项“可选商业工作簿引擎”，不影响默认本地版本。

## 9. 官方依据

- [Univer 开源仓库与 Open Source / Pro 能力表](https://github.com/dream-num/univer)
- [Univer Sheets 安装与 preset/plugin 模式](https://docs.univer.ai/guides/sheets/getting-started/installation)
- [Univer XLSX 导入导出](https://docs.univer.ai/guides/sheets/features/import-export)
- [Univer Pro 评估限制](https://docs.univer.ai/guides/sheets/getting-started/pro)
- [Handsontable license key 与许可说明](https://handsontable.com/docs/javascript-data-grid/license-key/)
- [Luckysheet 归档仓库](https://github.com/dream-num/Luckysheet)
