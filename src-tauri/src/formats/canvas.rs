use std::sync::LazyLock;

pub(crate) const MAX_CANVAS_BYTES: usize = 20 * 1024 * 1024;

pub(crate) fn validate_canvas_json(content: &str) -> Result<(), String> {
    if content.len() > MAX_CANVAS_BYTES {
        return Err("Canvas 文件不能超过 20 MB".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("Canvas JSON 无效: {}", e))?;
    let object = value.as_object().ok_or("Canvas 顶层必须是 JSON 对象")?;
    let nodes = object
        .get("nodes")
        .and_then(|value| value.as_array())
        .ok_or("Canvas 缺少 nodes 数组")?;
    let edges = object
        .get("edges")
        .and_then(|value| value.as_array())
        .ok_or("Canvas 缺少 edges 数组")?;
    let mut node_ids = std::collections::HashSet::new();
    for node in nodes {
        let item = node.as_object().ok_or("Canvas 节点必须是对象")?;
        let id = item
            .get("id")
            .and_then(|value| value.as_str())
            .ok_or("Canvas 节点缺少 id")?;
        if id.is_empty() || !node_ids.insert(id) {
            return Err("Canvas 节点 id 不能为空或重复".into());
        }
        for field in ["x", "y", "width", "height"] {
            if !item.get(field).is_some_and(|value| value.is_number()) {
                return Err(format!("Canvas 节点缺少数值字段 {}", field));
            }
        }
        if let Some(view_id) = item.get("longeditViewId") {
            let view_id = view_id
                .as_str()
                .ok_or("Canvas 图表引用 longeditViewId 必须是字符串")?;
            let valid_view_id = !view_id.is_empty()
                && view_id.len() <= 80
                && view_id.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
                });
            let is_table_file = item.get("type").and_then(|value| value.as_str()) == Some("file")
                && item
                    .get("file")
                    .and_then(|value| value.as_str())
                    .is_some_and(|file| file.to_ascii_lowercase().ends_with(".table.json"));
            if !valid_view_id || !is_table_file {
                return Err(
                    "Canvas 图表引用必须是指向 .table.json 的 file 节点并包含合法视图 ID".into(),
                );
            }
        }
    }
    let mut edge_ids = std::collections::HashSet::new();
    for edge in edges {
        let item = edge.as_object().ok_or("Canvas 连线必须是对象")?;
        let id = item
            .get("id")
            .and_then(|value| value.as_str())
            .ok_or("Canvas 连线缺少 id")?;
        if id.is_empty() || !edge_ids.insert(id) {
            return Err("Canvas 连线 id 不能为空或重复".into());
        }
        let from = item
            .get("fromNode")
            .and_then(|value| value.as_str())
            .ok_or("Canvas 连线缺少 fromNode")?;
        let to = item
            .get("toNode")
            .and_then(|value| value.as_str())
            .ok_or("Canvas 连线缺少 toNode")?;
        if !node_ids.contains(from) || !node_ids.contains(to) {
            return Err("Canvas 连线引用了不存在的节点".into());
        }
        for field in ["fromSide", "toSide"] {
            if let Some(value) = item.get(field) {
                let side = value
                    .as_str()
                    .ok_or_else(|| format!("Canvas 连线字段 {field} 必须是字符串"))?;
                if !matches!(side, "top" | "right" | "bottom" | "left") {
                    return Err(format!("Canvas 连线字段 {field} 的端口无效"));
                }
            }
        }
        for field in ["fromEnd", "toEnd"] {
            if let Some(value) = item.get(field) {
                let end = value
                    .as_str()
                    .ok_or_else(|| format!("Canvas 连线字段 {field} 必须是字符串"))?;
                if !matches!(end, "none" | "arrow") {
                    return Err(format!("Canvas 连线字段 {field} 的端点无效"));
                }
            }
        }
        for (field, max_length) in [("label", 160usize), ("relationType", 80usize)] {
            if let Some(value) = item.get(field) {
                let text = value
                    .as_str()
                    .ok_or_else(|| format!("Canvas 连线字段 {field} 必须是字符串"))?;
                if text.chars().count() > max_length {
                    return Err(format!("Canvas 连线字段 {field} 过长"));
                }
            }
        }
        if let Some(value) = item.get("color") {
            let color = value.as_str().ok_or("Canvas 连线颜色必须是字符串")?;
            let valid_hex = color.len() == 7
                && color.starts_with('#')
                && color[1..]
                    .chars()
                    .all(|character| character.is_ascii_hexdigit());
            if !matches!(color, "1" | "2" | "3" | "4" | "5" | "6") && !valid_hex {
                return Err("Canvas 连线颜色必须是预设编号或十六进制颜色".into());
            }
        }
    }
    Ok(())
}

#[derive(Clone, Debug)]
struct OutlineItem {
    text: String,
    rank: usize,
    parent: Option<usize>,
}

fn parse_markdown_outline(content: &str) -> Vec<OutlineItem> {
    static HEADING_RE: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"^(#{1,6})\s+(.+?)\s*$").unwrap());
    static LIST_RE: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"^(\s*)(?:[-+*]|\d+[.)])\s+(.+?)\s*$").unwrap());
    let mut result = Vec::new();
    let mut stack: Vec<(usize, usize)> = Vec::new();
    let mut heading_level = 0usize;
    let mut in_fence = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence || trimmed.is_empty() {
            continue;
        }
        let (rank, raw_text, is_heading) = if let Some(captures) = HEADING_RE.captures(line) {
            heading_level = captures[1].len();
            (heading_level * 100, captures[2].to_string(), true)
        } else if let Some(captures) = LIST_RE.captures(line) {
            let indent = captures[1]
                .chars()
                .map(|character| if character == '\t' { 2 } else { 1 })
                .sum::<usize>();
            (
                heading_level * 100 + 10 + indent / 2,
                captures[2].to_string(),
                false,
            )
        } else {
            continue;
        };
        let text = raw_text
            .trim_start_matches("[ ] ")
            .trim_start_matches("[x] ")
            .trim_start_matches("[X] ")
            .trim_matches(|character| matches!(character, '*' | '_' | '`'))
            .trim()
            .to_string();
        if text.is_empty() {
            continue;
        }
        if is_heading {
            while stack
                .last()
                .is_some_and(|(previous_rank, _)| previous_rank % 100 != 0)
            {
                stack.pop();
            }
        }
        while stack
            .last()
            .is_some_and(|(previous_rank, _)| *previous_rank >= rank)
        {
            stack.pop();
        }
        let parent = stack.last().map(|(_, index)| *index);
        let index = result.len();
        result.push(OutlineItem { text, rank, parent });
        stack.push((rank, index));
        if result.len() >= 500 {
            break;
        }
    }
    result
}

pub(crate) fn markdown_outline_to_canvas(
    content: &str,
    source_file: &str,
) -> Result<serde_json::Value, String> {
    let outline = parse_markdown_outline(content);
    if outline.is_empty() {
        return Err("文档中没有可转换的标题或列表".into());
    }
    let mut depths = vec![1usize; outline.len()];
    for index in 0..outline.len() {
        if let Some(parent) = outline[index].parent {
            depths[index] = depths[parent] + 1;
        }
    }
    let mut counts = std::collections::HashMap::new();
    for depth in &depths {
        *counts.entry(*depth).or_insert(0usize) += 1;
    }
    let mut indexes = std::collections::HashMap::new();
    let mut nodes = vec![serde_json::json!({
        "id": "source-document", "type": "file", "file": source_file,
        "x": 0, "y": 0, "width": 300, "height": 150, "color": "6"
    })];
    for (index, item) in outline.iter().enumerate() {
        let depth = depths[index];
        let position = indexes.entry(depth).or_insert(0usize);
        let count = *counts.get(&depth).unwrap_or(&1);
        let y = (*position as f64 - count.saturating_sub(1) as f64 / 2.0) * 160.0;
        *position += 1;
        nodes.push(serde_json::json!({
            "id": format!("outline-{}", index), "type": "text", "text": item.text,
            "x": depth as f64 * 340.0, "y": y, "width": 260, "height": 110,
            "color": match item.rank / 100 { 1 => "6", 2 => "5", 3 => "4", _ => "3" }
        }));
    }
    let edges: Vec<serde_json::Value> = outline.iter().enumerate().map(|(index, item)| serde_json::json!({
        "id": format!("outline-edge-{}", index),
        "fromNode": item.parent.map(|parent| format!("outline-{}", parent)).unwrap_or_else(|| "source-document".into()),
        "toNode": format!("outline-{}", index), "fromSide": "right", "toSide": "left"
    })).collect();
    Ok(serde_json::json!({ "nodes": nodes, "edges": edges }))
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_CANVAS: &str = include_str!("../../tests/fixtures/canvas/valid.canvas");
    const DAMAGED_CANVAS: &str = include_str!("../../tests/fixtures/canvas/damaged.canvas");
    const MINDMAP_MARKDOWN: &str = include_str!("../../tests/fixtures/canvas/mindmap.md");

    #[test]
    fn accepts_open_format_document() {
        assert!(validate_canvas_json(VALID_CANVAS).is_ok());
    }

    #[test]
    fn rejects_dangling_edges() {
        assert!(validate_canvas_json(DAMAGED_CANVAS).is_err());
    }

    #[test]
    fn rejects_canvas_larger_than_limit() {
        let oversized = "x".repeat(MAX_CANVAS_BYTES + 1);
        let error = validate_canvas_json(&oversized).unwrap_err();
        assert!(error.contains("20 MB"));
    }

    #[test]
    fn validates_standard_edge_properties_and_relation_extension() {
        let valid = r##"{"nodes":[{"id":"a","type":"text","text":"A","x":0,"y":0,"width":100,"height":80},{"id":"b","type":"text","text":"B","x":200,"y":0,"width":100,"height":80}],"edges":[{"id":"e","fromNode":"a","toNode":"b","fromSide":"right","toSide":"left","fromEnd":"arrow","toEnd":"arrow","color":"#12ABEF","label":"支持","relationType":"supports"}]}"##;
        assert!(validate_canvas_json(valid).is_ok());

        let invalid = valid.replace("\"fromEnd\":\"arrow\"", "\"fromEnd\":\"circle\"");
        let error = validate_canvas_json(&invalid).unwrap_err();
        assert!(error.contains("fromEnd"));
    }

    #[test]
    fn validates_interoperable_table_chart_file_node() {
        let valid = r#"{"nodes":[{"id":"chart","type":"file","file":"data.table.json","longeditViewId":"chart-1","x":0,"y":0,"width":640,"height":420}],"edges":[]}"#;
        assert!(validate_canvas_json(valid).is_ok());

        let invalid = r#"{"nodes":[{"id":"chart","type":"text","file":"data.table.json","longeditViewId":"bad view","x":0,"y":0,"width":640,"height":420}],"edges":[]}"#;
        assert!(validate_canvas_json(invalid).is_err());
    }

    #[test]
    fn validates_standard_mermaid_file_reference_node() {
        let valid = r#"{"nodes":[{"id":"diagram","type":"file","file":"diagrams/process.mmd","x":0,"y":0,"width":660,"height":430}],"edges":[]}"#;
        assert!(validate_canvas_json(valid).is_ok());
    }

    #[test]
    fn validates_thousand_node_canvas_within_regression_budget() {
        let nodes: Vec<serde_json::Value> = (0..1000)
            .map(|index| {
                serde_json::json!({
                    "id": format!("node-{index}"), "type": "text", "text": format!("Node {index}"),
                    "x": (index % 40) * 300, "y": (index / 40) * 160, "width": 240, "height": 110
                })
            })
            .collect();
        let edges: Vec<serde_json::Value> = (1..1000)
            .map(|index| {
                serde_json::json!({
                    "id": format!("edge-{index}"), "fromNode": format!("node-{}", index - 1),
                    "toNode": format!("node-{index}"), "fromSide": "right", "toSide": "left"
                })
            })
            .collect();
        let content =
            serde_json::to_string(&serde_json::json!({ "nodes": nodes, "edges": edges })).unwrap();
        let started = std::time::Instant::now();
        assert!(validate_canvas_json(&content).is_ok());
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
    }

    #[test]
    fn markdown_preserves_heading_and_list_hierarchy() {
        let outline = parse_markdown_outline("# 项目\n## 目标\n- 用户体验\n  - 快速\n### 衡量标准\n## 计划\n1. 第一阶段\n```\n# 代码不是标题\n```");
        assert_eq!(outline.len(), 7);
        assert_eq!(outline[1].parent, Some(0));
        assert_eq!(outline[2].parent, Some(1));
        assert_eq!(outline[3].parent, Some(2));
        assert_eq!(outline[4].parent, Some(1));
        assert_eq!(outline[5].parent, Some(0));
        assert_eq!(outline[6].parent, Some(5));
    }

    #[test]
    fn markdown_converts_to_valid_canvas() {
        let canvas = markdown_outline_to_canvas(MINDMAP_MARKDOWN, "mindmap.md").unwrap();
        assert_eq!(canvas["nodes"].as_array().unwrap().len(), 10);
        assert_eq!(canvas["edges"].as_array().unwrap().len(), 9);
        assert!(validate_canvas_json(&serde_json::to_string(&canvas).unwrap()).is_ok());
    }
}
