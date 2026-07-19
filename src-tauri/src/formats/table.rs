use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

pub(crate) const TABLE_SCHEMA_VERSION: u32 = 1;
pub(crate) const TABLE_KIND: &str = "longedit.table";
pub(crate) const MAX_INTERNAL_TABLE_BYTES: usize = 64 * 1024 * 1024;
pub(crate) const MAX_TABLE_ROWS: usize = 200_000;
pub(crate) const MAX_TABLE_COLUMNS: usize = 512;
pub(crate) const MAX_CELL_CHARS: usize = 1_000_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InternalTable {
    pub schema_version: u32,
    pub kind: String,
    pub data: TableData,
    pub views: Vec<TableView>,
    pub active_view: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TableData {
    pub columns: Vec<TableColumn>,
    pub rows: Vec<TableRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TableColumn {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub column_type: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TableRow {
    pub id: String,
    pub values: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TableView {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub config: GridViewConfig,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GridViewConfig {
    #[serde(default)]
    pub filter: String,
    #[serde(default)]
    pub sort: Option<TableSort>,
    #[serde(default)]
    pub frozen_columns: usize,
    #[serde(default)]
    pub column_widths: BTreeMap<String, u16>,
    #[serde(default)]
    pub group_by: Option<String>,
    #[serde(default)]
    pub title_column: Option<String>,
    #[serde(default)]
    pub card_columns: Vec<String>,
    #[serde(default)]
    pub category_column: Option<String>,
    #[serde(default)]
    pub value_column: Option<String>,
    #[serde(default = "default_aggregation")]
    pub aggregation: String,
    #[serde(default = "default_chart_type")]
    pub chart_type: String,
    #[serde(default)]
    pub series_column: Option<String>,
    #[serde(default = "default_null_strategy")]
    pub null_strategy: String,
    #[serde(default = "default_true")]
    pub show_legend: bool,
    #[serde(default)]
    pub dashboard_items: Vec<DashboardItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DashboardItem {
    pub chart_view_id: String,
    #[serde(default = "default_dashboard_width")]
    pub width: u8,
}

fn default_dashboard_width() -> u8 {
    6
}

fn default_aggregation() -> String {
    "count".into()
}

fn default_chart_type() -> String {
    "bar".into()
}

fn default_null_strategy() -> String {
    "skip".into()
}

fn default_true() -> bool {
    true
}

impl Default for GridViewConfig {
    fn default() -> Self {
        Self {
            filter: String::new(),
            sort: None,
            frozen_columns: 0,
            column_widths: BTreeMap::new(),
            group_by: None,
            title_column: None,
            card_columns: Vec::new(),
            category_column: None,
            value_column: None,
            aggregation: default_aggregation(),
            chart_type: default_chart_type(),
            series_column: None,
            null_strategy: default_null_strategy(),
            show_legend: true,
            dashboard_items: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TableSort {
    pub column: String,
    pub direction: String,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

pub(crate) fn validate_internal_table(table: &InternalTable) -> Result<(), String> {
    if table.schema_version != TABLE_SCHEMA_VERSION || table.kind != TABLE_KIND {
        return Err("Table schemaVersion 或 kind 不受支持".into());
    }
    if table.data.columns.is_empty() || table.data.columns.len() > MAX_TABLE_COLUMNS {
        return Err(format!("Table 列数必须在 1–{} 之间", MAX_TABLE_COLUMNS));
    }
    if table.data.rows.len() > MAX_TABLE_ROWS {
        return Err(format!("Table 超过 {} 行上限", MAX_TABLE_ROWS));
    }
    let mut column_ids = HashSet::new();
    for column in &table.data.columns {
        if !valid_id(&column.id) || !column_ids.insert(column.id.as_str()) {
            return Err("Table 列 ID 必须合法且唯一".into());
        }
        if column.name.chars().count() > 200 {
            return Err("Table 列名不能超过 200 个字符".into());
        }
        if !matches!(
            column.column_type.as_str(),
            "auto" | "empty" | "text" | "integer" | "number" | "boolean" | "date"
        ) {
            return Err(format!("Table 列 {} 的类型无效", column.id));
        }
    }
    let mut row_ids = HashSet::new();
    for row in &table.data.rows {
        if !valid_id(&row.id) || !row_ids.insert(row.id.as_str()) {
            return Err("Table 行 ID 必须合法且唯一".into());
        }
        for (column, value) in &row.values {
            if !column_ids.contains(column.as_str()) {
                return Err(format!("Table 行 {} 引用了未知列 {}", row.id, column));
            }
            if value.chars().count() > MAX_CELL_CHARS {
                return Err("Table 单元格文本超过 100 万字符上限".into());
            }
        }
    }
    if table.views.is_empty() || table.views.len() > 64 {
        return Err("Table 必须包含 1–64 个视图".into());
    }
    let mut view_ids = HashSet::new();
    for view in &table.views {
        if !valid_id(&view.id) || !view_ids.insert(view.id.as_str()) {
            return Err("Table 视图 ID 必须合法且唯一".into());
        }
        if !matches!(view.kind.as_str(), "grid" | "board" | "chart" | "dashboard")
            || view.name.trim().is_empty()
            || view.name.chars().count() > 120
        {
            return Err("Table 视图名称或类型无效".into());
        }
        if view.config.filter.chars().count() > 2_000
            || view.config.frozen_columns > table.data.columns.len()
        {
            return Err("Table 视图筛选条件或冻结列数无效".into());
        }
        if let Some(sort) = &view.config.sort {
            if !column_ids.contains(sort.column.as_str())
                || !matches!(sort.direction.as_str(), "asc" | "desc")
            {
                return Err("Table 视图排序配置无效".into());
            }
        }
        for (column, width) in &view.config.column_widths {
            if !column_ids.contains(column.as_str()) || !(60..=600).contains(width) {
                return Err("Table 视图列宽配置无效".into());
            }
        }
        let referenced_columns = [
            view.config.group_by.as_ref(),
            view.config.title_column.as_ref(),
            view.config.category_column.as_ref(),
            view.config.value_column.as_ref(),
            view.config.series_column.as_ref(),
        ]
        .into_iter()
        .flatten()
        .chain(view.config.card_columns.iter());
        if referenced_columns
            .into_iter()
            .any(|column| !column_ids.contains(column.as_str()))
        {
            return Err("Table 视图引用了不存在的列".into());
        }
        if view.config.card_columns.len() > 8
            || !matches!(
                view.config.aggregation.as_str(),
                "count" | "sum" | "average"
            )
            || !matches!(
                view.config.chart_type.as_str(),
                "bar" | "line" | "pie" | "scatter"
            )
            || !matches!(view.config.null_strategy.as_str(), "skip" | "zero")
        {
            return Err("Table 看板字段或图表聚合配置无效".into());
        }
        let mut card_columns = HashSet::new();
        if view
            .config
            .card_columns
            .iter()
            .any(|column| !card_columns.insert(column))
        {
            return Err("Table 看板卡片字段不能重复".into());
        }
        if view.kind == "board" && view.config.group_by.is_none() {
            return Err("Table 看板视图必须指定分组列".into());
        }
        if view.kind == "chart" && view.config.category_column.is_none() {
            return Err("Table 图表视图必须指定分类列".into());
        }
        if view.kind == "chart"
            && (view.config.chart_type == "scatter"
                || matches!(view.config.aggregation.as_str(), "sum" | "average"))
            && view.config.value_column.is_none()
        {
            return Err("Table 求和或平均图表必须指定数值列".into());
        }
    }
    for view in &table.views {
        if view.config.dashboard_items.len() > 24 {
            return Err("Table 仪表盘最多包含 24 个图表".into());
        }
        let mut dashboard_chart_ids = HashSet::new();
        for item in &view.config.dashboard_items {
            let chart = table
                .views
                .iter()
                .find(|candidate| candidate.id == item.chart_view_id);
            if view.kind != "dashboard"
                || !matches!(item.width, 4 | 6 | 8 | 12)
                || !dashboard_chart_ids.insert(item.chart_view_id.as_str())
                || chart.is_none_or(|candidate| candidate.kind != "chart")
            {
                return Err("Table 仪表盘图表引用或布局无效".into());
            }
        }
    }
    if !view_ids.contains(table.active_view.as_str()) {
        return Err("Table activeView 未引用现有视图".into());
    }
    Ok(())
}

pub(crate) fn parse_internal_table(content: &str) -> Result<InternalTable, String> {
    if content.len() > MAX_INTERNAL_TABLE_BYTES {
        return Err("Table 文件不能超过 64 MB".into());
    }
    let table: InternalTable =
        serde_json::from_str(content).map_err(|error| format!("Table JSON 无效: {}", error))?;
    validate_internal_table(&table)?;
    Ok(table)
}

pub(crate) fn table_search_text(table: &InternalTable, max_chars: usize) -> String {
    let mut output = table
        .data
        .columns
        .iter()
        .map(|column| column.name.as_str())
        .collect::<Vec<_>>()
        .join("\t");
    for row in &table.data.rows {
        if output.chars().count() >= max_chars {
            break;
        }
        output.push('\n');
        for (index, column) in table.data.columns.iter().enumerate() {
            if index > 0 {
                output.push('\t');
            }
            if let Some(value) = row.values.get(&column.id) {
                output.push_str(value);
            }
        }
    }
    output.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> InternalTable {
        InternalTable {
            schema_version: 1,
            kind: TABLE_KIND.into(),
            data: TableData {
                columns: vec![TableColumn {
                    id: "name".into(),
                    name: "名称".into(),
                    column_type: "text".into(),
                }],
                rows: vec![TableRow {
                    id: "row-1".into(),
                    values: BTreeMap::from([("name".into(), "示例".into())]),
                }],
            },
            views: vec![TableView {
                id: "grid".into(),
                name: "表格".into(),
                kind: "grid".into(),
                config: GridViewConfig {
                    frozen_columns: 1,
                    column_widths: BTreeMap::from([("name".into(), 180)]),
                    ..Default::default()
                },
            }],
            active_view: "grid".into(),
        }
    }

    #[test]
    fn accepts_open_table_with_separate_data_and_view() {
        let mut table = fixture();
        table.views.push(TableView {
            id: "board".into(),
            name: "看板".into(),
            kind: "board".into(),
            config: GridViewConfig {
                group_by: Some("name".into()),
                title_column: Some("name".into()),
                card_columns: vec!["name".into()],
                ..Default::default()
            },
        });
        table.views.push(TableView {
            id: "chart".into(),
            name: "图表".into(),
            kind: "chart".into(),
            config: GridViewConfig {
                category_column: Some("name".into()),
                aggregation: "count".into(),
                ..Default::default()
            },
        });
        validate_internal_table(&table).unwrap();
        let json = serde_json::to_string_pretty(&table).unwrap();
        assert_eq!(json.matches("\"rows\"").count(), 1);
        let parsed = parse_internal_table(&json).unwrap();
        assert_eq!(parsed.data.rows[0].values["name"], "示例");
        assert_eq!(parsed.views[0].config.column_widths["name"], 180);
    }

    #[test]
    fn rejects_duplicate_ids_unknown_columns_and_invalid_view_references() {
        let mut duplicate = fixture();
        duplicate
            .data
            .columns
            .push(duplicate.data.columns[0].clone());
        assert!(validate_internal_table(&duplicate).is_err());

        let mut unknown = fixture();
        unknown.data.rows[0]
            .values
            .insert("missing".into(), "x".into());
        assert!(validate_internal_table(&unknown).is_err());

        let mut invalid_view = fixture();
        invalid_view.active_view = "missing".into();
        assert!(validate_internal_table(&invalid_view).is_err());

        let mut invalid_board = fixture();
        invalid_board.views.push(TableView {
            id: "board".into(),
            name: "看板".into(),
            kind: "board".into(),
            config: GridViewConfig {
                group_by: Some("missing".into()),
                ..Default::default()
            },
        });
        assert!(validate_internal_table(&invalid_board).is_err());
    }

    #[test]
    fn validates_professional_chart_configuration() {
        for chart_type in ["bar", "line", "pie", "scatter"] {
            let mut table = fixture();
            table.views.push(TableView {
                id: format!("chart-{}", chart_type),
                name: chart_type.into(),
                kind: "chart".into(),
                config: GridViewConfig {
                    category_column: Some("name".into()),
                    value_column: Some("name".into()),
                    series_column: Some("name".into()),
                    aggregation: "sum".into(),
                    chart_type: chart_type.into(),
                    null_strategy: "zero".into(),
                    show_legend: false,
                    ..Default::default()
                },
            });
            validate_internal_table(&table).unwrap();
        }

        let mut invalid_type = fixture();
        invalid_type.views.push(TableView {
            id: "chart".into(),
            name: "图表".into(),
            kind: "chart".into(),
            config: GridViewConfig {
                category_column: Some("name".into()),
                chart_type: "radar".into(),
                ..Default::default()
            },
        });
        assert!(validate_internal_table(&invalid_type).is_err());

        let mut invalid_scatter = fixture();
        invalid_scatter.views.push(TableView {
            id: "scatter".into(),
            name: "散点".into(),
            kind: "chart".into(),
            config: GridViewConfig {
                category_column: Some("name".into()),
                chart_type: "scatter".into(),
                ..Default::default()
            },
        });
        assert!(validate_internal_table(&invalid_scatter).is_err());
    }

    #[test]
    fn validates_dashboard_chart_references_and_layout() {
        let mut table = fixture();
        table.views.push(TableView {
            id: "chart".into(),
            name: "图表".into(),
            kind: "chart".into(),
            config: GridViewConfig {
                category_column: Some("name".into()),
                ..Default::default()
            },
        });
        table.views.push(TableView {
            id: "dashboard".into(),
            name: "仪表盘".into(),
            kind: "dashboard".into(),
            config: GridViewConfig {
                dashboard_items: vec![DashboardItem {
                    chart_view_id: "chart".into(),
                    width: 6,
                }],
                ..Default::default()
            },
        });
        validate_internal_table(&table).unwrap();

        let mut invalid_width = table.clone();
        invalid_width.views[2].config.dashboard_items[0].width = 5;
        assert!(validate_internal_table(&invalid_width).is_err());

        let mut missing_chart = table.clone();
        missing_chart.views[2].config.dashboard_items[0].chart_view_id = "missing".into();
        assert!(validate_internal_table(&missing_chart).is_err());

        let mut duplicate = table;
        let duplicate_item = duplicate.views[2].config.dashboard_items[0].clone();
        duplicate.views[2]
            .config
            .dashboard_items
            .push(duplicate_item);
        assert!(validate_internal_table(&duplicate).is_err());
    }
}
