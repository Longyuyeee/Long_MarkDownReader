# LongEdit Open Table Format 1.0

状态：实现并冻结基础结构  
文件扩展名：`.table.json`  
媒体类型建议：`application/vnd.longedit.table+json`  
字符编码：UTF-8，无 BOM  

## 1. 设计目标

Open Table 是面向结构化知识数据的开放 JSON 格式。它解决四个问题：

1. 数据记录与视图配置分离，同一数据源可以被表格、看板和图表复用。
2. 列和行具有稳定 ID，改显示名称、排序或筛选不会破坏后续图表字段映射。
3. 文件可由普通文本工具、Git 和其他程序读取、比较和生成。
4. CSV/TSV 可以无损导入，数据可以导出为 CSV、TSV 和基础 XLSX。

该格式不是 Excel 工作簿的替代品，不保存宏、合并单元格、复杂公式或 Office 私有样式。

## 2. 顶层结构

```json
{
  "schemaVersion": 1,
  "kind": "longedit.table",
  "data": {
    "columns": [
      { "id": "column-1", "name": "项目", "type": "text" },
      { "id": "column-2", "name": "进度", "type": "number" }
    ],
    "rows": [
      {
        "id": "row-1",
        "values": {
          "column-1": "知识图谱增强",
          "column-2": "75"
        }
      }
    ]
  },
  "views": [
    {
      "id": "grid",
      "name": "表格",
      "kind": "grid",
      "config": {
        "filter": "知识",
        "sort": { "column": "column-2", "direction": "desc" },
        "frozenColumns": 1,
        "columnWidths": { "column-1": 240, "column-2": 120 }
      }
    }
  ],
  "activeView": "grid"
}
```

## 3. 数据层

`data.columns` 定义字段顺序、稳定 ID、显示名称和类型。支持的类型为：

- `auto`：由应用推断。
- `empty`：当前没有非空值。
- `text`、`integer`、`number`、`boolean`、`date`。

所有单元格在 JSON 中保存为字符串，以避免 JavaScript 数值精度、日期时区和 CSV 前导零被隐式改写。类型是解释和展示提示；导出 XLSX 时，明确的数值和布尔类型会写成对应的 Excel 原生值。

`data.rows` 使用稳定行 ID。`values` 以列 ID 为键；缺失键等价于空字符串。列改名不会修改所有数据记录，也不会破坏引用该列的视图和图表。

## 4. 视图层

`views` 与 `data` 同级，不能包含数据副本。1.0 支持四种视图类型。

`grid` 表格视图：

- `filter`：当前全字段筛选文本。
- `sort`：引用列 ID 的单列排序；方向为 `asc` 或 `desc`。
- `frozenColumns`：从左侧开始冻结的列数。
- `columnWidths`：以列 ID 为键的像素宽度，范围 60–600。

`board` 看板视图：

- `groupBy`：必填，卡片分组列 ID；拖动卡片只修改该行对应单元格。
- `titleColumn`：卡片标题列 ID。
- `cardColumns`：卡片展示字段 ID，最多 8 个。

`chart` 图表视图：

- `categoryColumn`：必填，分类列 ID。
- `valueColumn`：求和、平均或散点图 Y 轴使用的数值列 ID；散点图必填。
- `seriesColumn`：可选的系列/颜色分组列 ID。
- `aggregation`：`count`、`sum` 或 `average`。
- `chartType`：`bar`、`line`、`pie` 或 `scatter`，缺省为 `bar`。
- `nullStrategy`：`skip` 跳过缺失或非数值记录，`zero` 将其按 0 处理；缺省为 `skip`。
- `showLegend`：是否显示图例，缺省为 `true`。

`dashboard` 仪表盘视图：

- `filter`：仪表盘级共享筛选文本，同时作用于所有卡片。
- `dashboardItems`：最多 24 个图表引用，按数组顺序保存布局顺序。
- `chartViewId`：引用同一 Table 内已有的 `chart` 视图 ID，不复制图表字段配置或数据。
- `width`：12 栅格中的卡片宽度，只允许 `4`、`6`、`8` 或 `12`。
- 删除图表视图时，应用同步清理仪表盘中的对应引用；解析器拒绝悬空引用、重复引用和非法宽度。

柱状、折线和饼图按分类与系列聚合；散点图不聚合，以 `categoryColumn` 作为 X、`valueColumn` 作为 Y，并可按系列着色。任何视图都不能保存 `rows`、数据快照或派生记录。`activeView` 必须引用现有视图 ID。

## 5. 限制与验证

- 文件最大 64 MB；最多 200,000 行、512 列、64 个视图。
- 单元格最大 1,000,000 个 Unicode 字符。
- 行、列和视图 ID 长度为 1–80，只允许 ASCII 字母、数字、`-` 和 `_`，且在各自范围内唯一。
- 行值、排序、列宽、看板字段和图表字段不得引用不存在的列；未知图表类型、聚合或空值策略必须拒绝。
- 未知 schema 版本或错误 `kind` 必须拒绝写入，不能静默降级覆盖。
- 损坏文件只显示错误；修复前不生成新的持久化内容。

## 6. 导入、导出和写入语义

- CSV/TSV 转换会创建同目录 `.table.json`，保留原文件不变；重名时使用递增后缀。
- CSV/TSV 第一条记录作为列名；复杂引号、字段内换行和短行由标准 CSV 解析器处理。
- 导出 CSV、TSV 或 XLSX 会创建新文件，不覆盖现有文件。
- `.table.json` 写入前校验完整 schema，并使用长度、修改时间和全文件内容指纹检测外部冲突。
- 保存走临时文件、备份和原子替换流程；Table JSON 是用户事实源，索引和图谱内容可以重建。

## 7. 版本演进

兼容新增字段可以在同一 schema 版本中出现；改变字段含义、ID 语义或数据布局必须提升 `schemaVersion`。读取器遇到未知顶层字段应保留兼容空间，但写入器不得假装理解未知 schema 版本。后续迁移必须先生成可恢复备份，并提供往返 fixture。
