use crate::formats::canvas::validate_canvas_json;
use crate::formats::docx::parse_docx;
use crate::formats::markdown::{
    extract_pdf_reference_mentions, extract_wikilink_mentions, normalize_relation_type,
    WikilinkMention,
};
use crate::formats::odf_content::parse_odf_content;
use crate::formats::opml::{parse_opml, OpmlNode};
use crate::formats::pptx::{parse_pptx, pptx_search_segments, pptx_slide_location_label};
use crate::formats::table::{parse_internal_table, table_search_text};
use crate::services::knowledge_index::build_workbook_index_segments;
use crate::services::pdf_index::load_pdf_index;
use crate::services::reliable_write::write_utf8;
use crate::services::workspace_guard::WorkspaceGuard;
use chardetng::EncodingDetector;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, LazyLock,
};

static RE_TAG: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"(?:^|\s)#([^\s#`\[\](){}.,;:!?，。；：！？、\"'<>]+)"#).unwrap()
});
const MAX_RELATION_SUMMARY_PATHS: usize = 100;
const MAX_RELATION_CONTEXT_ITEMS: usize = 80;
const MAX_RELATION_DECISIONS: usize = 512;
const MAX_RELATION_DECISION_FILE_BYTES: u64 = 512 * 1024;
const RELATION_DECISION_DIRECTORY: &str = ".longedit";
const RELATION_DECISION_FILE: &str = "graph-relation-decisions.json";
const MAX_DOCX_GRAPH_HEADINGS: usize = 512;
const MAX_ODS_GRAPH_SHEETS: usize = 128;

#[derive(Serialize, Clone)]
pub struct GraphData {
    pub(crate) nodes: Vec<GraphNode>,
    pub(crate) edges: Vec<GraphEdge>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphRelationSummary {
    pub path: String,
    pub node_id: String,
    pub relation_count: usize,
    pub incoming_count: usize,
    pub outgoing_count: usize,
    pub related_count: usize,
    pub relation_types: Vec<String>,
    pub isolated: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphPulseNode {
    pub id: String,
    pub title: String,
    pub object_type: String,
    pub relation_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphPulseRelationType {
    pub relation_type: String,
    pub count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphGuidance {
    pub code: String,
    pub priority: String,
    pub current_value: usize,
    pub target_value: usize,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphPulse {
    pub object_count: usize,
    pub relation_count: usize,
    pub connected_object_count: usize,
    pub isolated_object_count: usize,
    pub coverage_percent: u8,
    pub relation_types: Vec<KnowledgeGraphPulseRelationType>,
    pub top_nodes: Vec<KnowledgeGraphPulseNode>,
    pub isolated_nodes: Vec<KnowledgeGraphPulseNode>,
    pub guidance: Vec<KnowledgeGraphGuidance>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphObservationCount {
    pub category: String,
    pub count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphDegreeDistribution {
    pub zero: usize,
    pub one: usize,
    pub two_to_four: usize,
    pub five_or_more: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphObservation {
    pub schema_version: u32,
    pub stage: String,
    pub app_version: String,
    pub generated_at: u64,
    pub evidence_level: String,
    pub consent_boundary: String,
    pub source_user_content_included: bool,
    pub object_identifiers_included: bool,
    pub file_names_included: bool,
    pub absolute_paths_included: bool,
    pub object_count: usize,
    pub relation_count: usize,
    pub connected_object_count: usize,
    pub isolated_object_count: usize,
    pub coverage_percent: u8,
    pub object_types: Vec<KnowledgeGraphObservationCount>,
    pub relation_types: Vec<KnowledgeGraphPulseRelationType>,
    pub degree_distribution: KnowledgeGraphDegreeDistribution,
    pub guidance: Vec<KnowledgeGraphGuidance>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphObservationSnapshot {
    pub object_count: usize,
    pub relation_count: usize,
    pub connected_object_count: usize,
    pub isolated_object_count: usize,
    pub coverage_percent: u8,
    pub relation_type_count: usize,
    pub guidance_codes: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphObservationChanges {
    pub object_count: i64,
    pub relation_count: i64,
    pub connected_object_count: i64,
    pub isolated_object_count: i64,
    pub coverage_percent: i16,
    pub relation_type_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphObservationComparison {
    pub schema_version: u32,
    pub stage: String,
    pub app_version: String,
    pub generated_at: u64,
    pub evidence_level: String,
    pub consent_boundary: String,
    pub source_user_content_included: bool,
    pub object_identifiers_included: bool,
    pub file_names_included: bool,
    pub absolute_paths_included: bool,
    pub baseline_generated_at: u64,
    pub elapsed_seconds: u64,
    pub baseline: KnowledgeGraphObservationSnapshot,
    pub current: KnowledgeGraphObservationSnapshot,
    pub changes: KnowledgeGraphObservationChanges,
    pub outcome: String,
    pub achievements: Vec<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphRelationEvidence {
    pub context: String,
    pub line: usize,
    pub syntax: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphContextNode {
    pub id: String,
    pub title: String,
    pub path: String,
    pub object_type: String,
    pub location_label: Option<String>,
    pub locator: Option<GraphObjectLocator>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphContextRelation {
    pub source: GraphContextNode,
    pub target: GraphContextNode,
    pub relation_type: String,
    pub relation_class: String,
    pub direction: String,
    pub directed: bool,
    pub evidence: Vec<GraphRelationEvidence>,
    pub decision_status: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphRelationContext {
    pub path: String,
    pub node: Option<GraphContextNode>,
    pub relations: Vec<GraphContextRelation>,
    pub hidden_relations: Vec<GraphContextRelation>,
    pub indexed: bool,
    pub truncated: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct GraphRelationDecision {
    source_path: String,
    target_path: String,
    relation_type: String,
    status: String,
    updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct GraphRelationDecisionFile {
    version: u32,
    decisions: Vec<GraphRelationDecision>,
}

impl Default for GraphRelationDecisionFile {
    fn default() -> Self {
        Self {
            version: 1,
            decisions: Vec::new(),
        }
    }
}

type GraphRelationDecisionMap = HashMap<(String, String, String), String>;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) path: String,
    pub(crate) size: f64,
    pub(crate) tags: Vec<String>,
    pub(crate) directory: String,
    pub(crate) modified_at: u64,
    pub(crate) object_type: String,
    pub(crate) search_text: String,
    pub(crate) content_signature: Option<String>,
    pub(crate) parent_id: Option<String>,
    pub(crate) locator: Option<GraphObjectLocator>,
    pub(crate) location_label: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphObjectLocator {
    pub(crate) kind: String,
    pub(crate) object_id: String,
    pub(crate) page: Option<u32>,
}

impl GraphNode {
    #[cfg(test)]
    pub(crate) fn test_node(id: &str) -> Self {
        Self {
            id: id.into(),
            title: id.into(),
            path: id.into(),
            size: 8.0,
            tags: Vec::new(),
            directory: String::new(),
            modified_at: 0,
            object_type: "markdown".into(),
            search_text: String::new(),
            content_signature: None,
            parent_id: None,
            locator: None,
            location_label: None,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub(crate) source: String,
    pub(crate) target: String,
    pub(crate) relation_type: String,
    pub(crate) directed: bool,
    pub(crate) mentions: Vec<WikilinkMention>,
}

impl GraphEdge {
    pub(crate) fn wikilink(source: String, target: String, mention: WikilinkMention) -> Self {
        let relation_type = mention.relation_type.clone();
        Self {
            source,
            target,
            directed: relation_type != "related",
            relation_type,
            mentions: vec![mention],
        }
    }

    fn structural(source: String, target: String, relation_type: &str) -> Self {
        Self {
            source,
            target,
            relation_type: relation_type.into(),
            directed: relation_type != "related",
            mentions: Vec::new(),
        }
    }

    #[cfg(test)]
    pub(crate) fn test_edge(source: &str, target: &str) -> Self {
        Self {
            source: source.into(),
            target: target.into(),
            relation_type: "links-to".into(),
            directed: true,
            mentions: Vec::new(),
        }
    }
}

#[tauri::command]
pub async fn build_link_graph(library_root: String) -> Result<GraphData, String> {
    build_link_graph_cancellable(library_root, Arc::new(AtomicBool::new(false))).await
}

pub(crate) async fn build_link_graph_cancellable(
    library_root: String,
    cancelled: Arc<AtomicBool>,
) -> Result<GraphData, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let root = guard.root().to_path_buf();
    let decisions = read_graph_relation_decision_map(&root)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<GraphData, String> {
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut node_ids = HashSet::new();
        let mut name_to_paths = HashMap::new();
        let mut graph_paths = Vec::new();
        build_filename_index(&root, &mut name_to_paths, &mut graph_paths, &cancelled);
        if cancelled.load(Ordering::Relaxed) {
            return Err("knowledge-index-cancelled".into());
        }
        build_graph_paths(
            &root,
            &graph_paths,
            &mut nodes,
            &mut edges,
            &mut node_ids,
            &name_to_paths,
            &cancelled,
        );
        if cancelled.load(Ordering::Relaxed) {
            return Err("knowledge-index-cancelled".into());
        }
        for edge in &mut edges {
            if edge.relation_type != "annotates" || node_ids.contains(&edge.target) {
                continue;
            }
            let Some(mention) = edge.mentions.first() else {
                continue;
            };
            let fallback = root.join(mention.target.replace('/', std::path::MAIN_SEPARATOR_STR));
            let fallback_id = fallback
                .canonicalize()
                .ok()
                .filter(|value| value.starts_with(&root))
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| fallback.to_string_lossy().into_owned());
            if node_ids.contains(&fallback_id) {
                edge.target = fallback_id;
            }
        }
        edges.retain(|edge| node_ids.contains(&edge.source) && node_ids.contains(&edge.target));
        append_confirmed_relation_edges(&nodes, &mut edges, &decisions);
        edges = merge_graph_edges(edges);
        let mut degrees = HashMap::new();
        for edge in &edges {
            *degrees.entry(edge.source.clone()).or_insert(0usize) += 1;
            *degrees.entry(edge.target.clone()).or_insert(0usize) += 1;
        }
        for node in &mut nodes {
            let degree = *degrees.get(&node.id).unwrap_or(&0) as f64;
            node.size = (8.0 + degree.sqrt() * 6.0).clamp(8.0, 32.0);
        }
        Ok(GraphData { nodes, edges })
    })
    .await
    .map_err(|error| format!("知识图谱索引任务失败: {error}"))?
}

pub(crate) fn merge_graph_edges(edges: Vec<GraphEdge>) -> Vec<GraphEdge> {
    let mut merged: Vec<GraphEdge> = Vec::new();
    let mut indexes: HashMap<(String, String, String), usize> = HashMap::new();
    for edge in edges {
        let key = (
            edge.source.clone(),
            edge.target.clone(),
            edge.relation_type.clone(),
        );
        if let Some(index) = indexes.get(&key).copied() {
            merged[index].mentions.extend(edge.mentions);
        } else {
            indexes.insert(key, merged.len());
            merged.push(edge);
        }
    }
    merged
}

pub(crate) fn filter_graph_by_depth(
    graph: GraphData,
    center_path: &str,
    depth: usize,
) -> GraphData {
    if !graph.nodes.iter().any(|node| node.id == center_path) {
        return GraphData {
            nodes: Vec::new(),
            edges: Vec::new(),
        };
    }
    let max_depth = depth.clamp(1, 4);
    let mut included = HashSet::from([center_path.to_string()]);
    let mut frontier = vec![center_path.to_string()];
    for _ in 0..max_depth {
        let mut next = Vec::new();
        for edge in &graph.edges {
            let neighbor = if frontier.contains(&edge.source) {
                Some(&edge.target)
            } else if frontier.contains(&edge.target) {
                Some(&edge.source)
            } else {
                None
            };
            if let Some(id) = neighbor {
                if included.insert(id.clone()) {
                    next.push(id.clone());
                }
            }
        }
        if next.is_empty() {
            break;
        }
        frontier = next;
    }
    GraphData {
        nodes: graph
            .nodes
            .into_iter()
            .filter(|node| included.contains(&node.id))
            .collect(),
        edges: graph
            .edges
            .into_iter()
            .filter(|edge| included.contains(&edge.source) && included.contains(&edge.target))
            .collect(),
    }
}

pub(crate) fn resolve_local_graph_center(
    guard: &WorkspaceGuard,
    center_path: &str,
) -> Result<PathBuf, String> {
    let center =
        guard.resolve_existing_file(center_path, &["md", "pdf", "csv", "tsv", "json"])?;
    if center
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("json"))
        && !center
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.to_ascii_lowercase().ends_with(".table.json"))
    {
        return Err("仅支持开放 Table JSON 作为表格中心对象".into());
    }
    Ok(center)
}

#[tauri::command]
pub async fn build_local_graph(
    library_root: String,
    center_path: String,
    depth: usize,
) -> Result<GraphData, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let center = resolve_local_graph_center(&guard, &center_path)?;
    let graph = build_link_graph(guard.root().to_string_lossy().into_owned()).await?;
    Ok(filter_graph_by_depth(
        graph,
        &center.to_string_lossy(),
        depth,
    ))
}

pub(crate) fn relation_summaries(
    graph: &GraphData,
    selected_paths: &[String],
) -> Vec<GraphRelationSummary> {
    let selected: HashSet<&str> = selected_paths.iter().map(String::as_str).collect();
    graph
        .nodes
        .iter()
        .filter(|node| selected.contains(node.path.as_str()))
        .map(|node| {
            let mut relation_count = 0;
            let mut incoming_count = 0;
            let mut outgoing_count = 0;
            let mut related_count = 0;
            let mut relation_types = BTreeSet::new();
            for edge in graph
                .edges
                .iter()
                .filter(|edge| edge.source == node.id || edge.target == node.id)
            {
                relation_count += 1;
                relation_types.insert(edge.relation_type.clone());
                if edge.directed {
                    if edge.source == node.id {
                        outgoing_count += 1;
                    }
                    if edge.target == node.id {
                        incoming_count += 1;
                    }
                } else {
                    related_count += 1;
                }
            }
            GraphRelationSummary {
                path: node.path.clone(),
                node_id: node.id.clone(),
                relation_count,
                incoming_count,
                outgoing_count,
                related_count,
                relation_types: relation_types.into_iter().collect(),
                isolated: relation_count == 0,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn summarize_graph_relations(
    library_root: String,
    paths: Vec<String>,
) -> Result<Vec<GraphRelationSummary>, String> {
    if paths.len() > MAX_RELATION_SUMMARY_PATHS {
        return Err(format!(
            "单次最多查询 {MAX_RELATION_SUMMARY_PATHS} 个文件的关系摘要"
        ));
    }
    let guard = WorkspaceGuard::new(&library_root)?;
    let mut requested_paths = HashMap::new();
    for path in paths {
        let resolved = guard.resolve_existing(&path)?;
        if !resolved.is_file() {
            return Err("关系摘要目标必须是文件".into());
        }
        requested_paths.insert(resolved.to_string_lossy().into_owned(), path);
    }
    let graph = build_link_graph(guard.root().to_string_lossy().into_owned()).await?;
    let canonical_paths: Vec<String> = requested_paths.keys().cloned().collect();
    let mut summaries = relation_summaries(&graph, &canonical_paths);
    for summary in &mut summaries {
        if let Some(requested) = requested_paths.get(&summary.path) {
            summary.path = requested.clone();
        }
    }
    Ok(summaries)
}

pub(crate) fn knowledge_graph_pulse(graph: &GraphData) -> KnowledgeGraphPulse {
    let mut degrees: HashMap<&str, usize> = HashMap::new();
    let mut relation_type_counts = BTreeMap::new();
    for edge in &graph.edges {
        *degrees.entry(edge.source.as_str()).or_insert(0) += 1;
        *degrees.entry(edge.target.as_str()).or_insert(0) += 1;
        *relation_type_counts
            .entry(edge.relation_type.clone())
            .or_insert(0usize) += 1;
    }

    let connected_object_count = graph
        .nodes
        .iter()
        .filter(|node| degrees.get(node.id.as_str()).copied().unwrap_or(0) > 0)
        .count();
    let object_count = graph.nodes.len();
    let coverage_percent = if object_count == 0 {
        0
    } else {
        ((connected_object_count * 100 + object_count / 2) / object_count).min(100) as u8
    };
    let mut top_nodes: Vec<KnowledgeGraphPulseNode> = graph
        .nodes
        .iter()
        .filter_map(|node| {
            let relation_count = degrees.get(node.id.as_str()).copied().unwrap_or(0);
            (relation_count > 0).then(|| KnowledgeGraphPulseNode {
                id: node.id.clone(),
                title: node.title.clone(),
                object_type: node.object_type.clone(),
                relation_count,
            })
        })
        .collect();
    top_nodes.sort_by(|left, right| {
        right
            .relation_count
            .cmp(&left.relation_count)
            .then_with(|| left.title.cmp(&right.title))
            .then_with(|| left.id.cmp(&right.id))
    });
    top_nodes.truncate(6);

    let mut isolated_nodes: Vec<KnowledgeGraphPulseNode> = graph
        .nodes
        .iter()
        .filter(|node| degrees.get(node.id.as_str()).copied().unwrap_or(0) == 0)
        .map(|node| KnowledgeGraphPulseNode {
            id: node.id.clone(),
            title: node.title.clone(),
            object_type: node.object_type.clone(),
            relation_count: 0,
        })
        .collect();
    isolated_nodes.sort_by(|left, right| {
        left.title
            .cmp(&right.title)
            .then_with(|| left.id.cmp(&right.id))
    });
    isolated_nodes.truncate(6);

    let relation_types: Vec<KnowledgeGraphPulseRelationType> = relation_type_counts
        .into_iter()
        .map(|(relation_type, count)| KnowledgeGraphPulseRelationType {
            relation_type,
            count,
        })
        .collect();
    let isolated_object_count = object_count.saturating_sub(connected_object_count);
    let guidance = knowledge_graph_guidance(
        object_count,
        graph.edges.len(),
        isolated_object_count,
        coverage_percent,
        relation_types.len(),
    );

    KnowledgeGraphPulse {
        object_count,
        relation_count: graph.edges.len(),
        connected_object_count,
        isolated_object_count,
        coverage_percent,
        relation_types,
        top_nodes,
        isolated_nodes,
        guidance,
    }
}

fn knowledge_graph_guidance(
    object_count: usize,
    relation_count: usize,
    isolated_object_count: usize,
    coverage_percent: u8,
    relation_type_count: usize,
) -> Vec<KnowledgeGraphGuidance> {
    if object_count == 0 {
        return vec![KnowledgeGraphGuidance {
            code: "add-first-knowledge-object".into(),
            priority: "high".into(),
            current_value: 0,
            target_value: 1,
        }];
    }

    let mut guidance = Vec::new();
    if relation_count == 0 {
        guidance.push(KnowledgeGraphGuidance {
            code: "create-first-relation".into(),
            priority: "high".into(),
            current_value: 0,
            target_value: 1,
        });
    } else if coverage_percent < 70 {
        guidance.push(KnowledgeGraphGuidance {
            code: "increase-relation-coverage".into(),
            priority: "high".into(),
            current_value: coverage_percent as usize,
            target_value: 70,
        });
    } else if isolated_object_count > 0 {
        guidance.push(KnowledgeGraphGuidance {
            code: "connect-isolated-objects".into(),
            priority: "medium".into(),
            current_value: isolated_object_count,
            target_value: 0,
        });
    }
    if relation_count > 0 && object_count >= 3 && relation_type_count < 3 {
        guidance.push(KnowledgeGraphGuidance {
            code: "diversify-relation-types".into(),
            priority: "medium".into(),
            current_value: relation_type_count,
            target_value: 3,
        });
    }
    if guidance.is_empty() {
        guidance.push(KnowledgeGraphGuidance {
            code: "network-health-on-track".into(),
            priority: "healthy".into(),
            current_value: coverage_percent as usize,
            target_value: 70,
        });
    }
    guidance
}

#[tauri::command]
pub async fn get_knowledge_graph_pulse(
    library_root: String,
) -> Result<KnowledgeGraphPulse, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let graph = build_link_graph(guard.root().to_string_lossy().into_owned()).await?;
    Ok(knowledge_graph_pulse(&graph))
}

fn knowledge_graph_observation(graph: &GraphData, generated_at: u64) -> KnowledgeGraphObservation {
    let pulse = knowledge_graph_pulse(graph);
    let mut object_type_counts = BTreeMap::new();
    let mut degrees: HashMap<&str, usize> = HashMap::new();
    for node in &graph.nodes {
        *object_type_counts
            .entry(node.object_type.clone())
            .or_insert(0usize) += 1;
    }
    for edge in &graph.edges {
        *degrees.entry(edge.source.as_str()).or_insert(0) += 1;
        *degrees.entry(edge.target.as_str()).or_insert(0) += 1;
    }
    let mut degree_distribution = KnowledgeGraphDegreeDistribution {
        zero: 0,
        one: 0,
        two_to_four: 0,
        five_or_more: 0,
    };
    for node in &graph.nodes {
        match degrees.get(node.id.as_str()).copied().unwrap_or(0) {
            0 => degree_distribution.zero += 1,
            1 => degree_distribution.one += 1,
            2..=4 => degree_distribution.two_to_four += 1,
            _ => degree_distribution.five_or_more += 1,
        }
    }

    KnowledgeGraphObservation {
        schema_version: 1,
        stage: "G12".into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        generated_at,
        evidence_level: "local-consented-aggregate-only".into(),
        consent_boundary: "User previews aggregate metrics and explicitly chooses a local JSON destination. LongEdit performs no automatic upload.".into(),
        source_user_content_included: false,
        object_identifiers_included: false,
        file_names_included: false,
        absolute_paths_included: false,
        object_count: pulse.object_count,
        relation_count: pulse.relation_count,
        connected_object_count: pulse.connected_object_count,
        isolated_object_count: pulse.isolated_object_count,
        coverage_percent: pulse.coverage_percent,
        object_types: object_type_counts
            .into_iter()
            .map(|(category, count)| KnowledgeGraphObservationCount { category, count })
            .collect(),
        relation_types: pulse.relation_types,
        degree_distribution,
        guidance: pulse.guidance,
    }
}

fn current_unix_seconds() -> Result<u64, String> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| format!("系统时间无效: {error}"))
}

#[tauri::command]
pub async fn get_knowledge_graph_observation(
    library_root: String,
) -> Result<KnowledgeGraphObservation, String> {
    let graph = build_link_graph(library_root).await?;
    Ok(knowledge_graph_observation(&graph, current_unix_seconds()?))
}

#[tauri::command]
pub async fn export_knowledge_graph_observation(
    library_root: String,
    target_path: String,
) -> Result<KnowledgeGraphObservation, String> {
    let target = Path::new(&target_path);
    if target
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("json"))
    {
        return Err("知识网络观察回执必须保存为 .json 文件".into());
    }
    if target.parent().is_none_or(|parent| !parent.is_dir()) {
        return Err("知识网络观察回执目标目录不存在".into());
    }
    let observation = get_knowledge_graph_observation(library_root).await?;
    let mut bytes = serde_json::to_vec_pretty(&observation)
        .map_err(|error| format!("序列化知识网络观察回执失败: {error}"))?;
    bytes.push(b'\n');
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| format!("创建知识网络观察回执失败: {error}"))?;
    output
        .write_all(&bytes)
        .map_err(|error| format!("写入知识网络观察回执失败: {error}"))?;
    output
        .sync_all()
        .map_err(|error| format!("同步知识网络观察回执失败: {error}"))?;
    Ok(observation)
}

fn observation_snapshot(
    observation: &KnowledgeGraphObservation,
) -> KnowledgeGraphObservationSnapshot {
    KnowledgeGraphObservationSnapshot {
        object_count: observation.object_count,
        relation_count: observation.relation_count,
        connected_object_count: observation.connected_object_count,
        isolated_object_count: observation.isolated_object_count,
        coverage_percent: observation.coverage_percent,
        relation_type_count: observation.relation_types.len(),
        guidance_codes: observation
            .guidance
            .iter()
            .map(|item| item.code.clone())
            .collect(),
    }
}

fn compare_knowledge_graph_observations(
    baseline: &KnowledgeGraphObservation,
    current: &KnowledgeGraphObservation,
) -> KnowledgeGraphObservationComparison {
    let baseline_snapshot = observation_snapshot(baseline);
    let current_snapshot = observation_snapshot(current);
    let changes = KnowledgeGraphObservationChanges {
        object_count: current.object_count as i64 - baseline.object_count as i64,
        relation_count: current.relation_count as i64 - baseline.relation_count as i64,
        connected_object_count: current.connected_object_count as i64
            - baseline.connected_object_count as i64,
        isolated_object_count: current.isolated_object_count as i64
            - baseline.isolated_object_count as i64,
        coverage_percent: current.coverage_percent as i16 - baseline.coverage_percent as i16,
        relation_type_count: current.relation_types.len() as i64
            - baseline.relation_types.len() as i64,
    };
    let mut achievements = Vec::new();
    if changes.coverage_percent > 0 {
        achievements.push("coverage-increased".into());
    }
    if changes.isolated_object_count < 0 {
        achievements.push("isolated-objects-reduced".into());
    }
    if changes.relation_count > 0 {
        achievements.push("relations-added".into());
    }
    if changes.relation_type_count > 0 {
        achievements.push("relation-types-diversified".into());
    }
    if baseline.coverage_percent < 70 && current.coverage_percent >= 70 {
        achievements.push("healthy-coverage-threshold-reached".into());
    }
    let improved = changes.coverage_percent > 0
        || changes.isolated_object_count < 0
        || changes.connected_object_count > 0
        || changes.relation_count > 0
        || changes.relation_type_count > 0;
    let regressed = changes.coverage_percent < 0 || changes.isolated_object_count > 0;
    let outcome = match (improved, regressed) {
        (true, false) => "improved",
        (true, true) => "mixed",
        (false, true) => "regressed",
        (false, false) => "unchanged",
    };

    KnowledgeGraphObservationComparison {
        schema_version: 1,
        stage: "G15B".into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        generated_at: current.generated_at,
        evidence_level: "local-consented-aggregate-comparison-only".into(),
        consent_boundary: "User selects a local aggregate baseline, previews the comparison, and explicitly chooses a new local JSON destination. LongEdit performs no automatic upload.".into(),
        source_user_content_included: false,
        object_identifiers_included: false,
        file_names_included: false,
        absolute_paths_included: false,
        baseline_generated_at: baseline.generated_at,
        elapsed_seconds: current.generated_at.saturating_sub(baseline.generated_at),
        baseline: baseline_snapshot,
        current: current_snapshot,
        changes,
        outcome: outcome.into(),
        achievements,
    }
}

fn load_knowledge_graph_observation(path: &Path) -> Result<KnowledgeGraphObservation, String> {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("json"))
    {
        return Err("知识网络观察基线必须是 .json 文件".into());
    }
    let metadata =
        fs::metadata(path).map_err(|error| format!("读取知识网络观察基线失败: {error}"))?;
    if metadata.len() > 1024 * 1024 {
        return Err("知识网络观察基线超过 1 MiB 安全上限".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取知识网络观察基线失败: {error}"))?;
    let observation: KnowledgeGraphObservation = serde_json::from_slice(&bytes)
        .map_err(|error| format!("解析知识网络观察基线失败: {error}"))?;
    if observation.schema_version != 1
        || observation.stage != "G12"
        || observation.evidence_level != "local-consented-aggregate-only"
        || observation.source_user_content_included
        || observation.object_identifiers_included
        || observation.file_names_included
        || observation.absolute_paths_included
    {
        return Err("知识网络观察基线未通过隐私与版本校验".into());
    }
    Ok(observation)
}

fn require_exact_json_keys(
    value: &serde_json::Value,
    expected: &[&str],
    label: &str,
) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| format!("{label} 必须是 JSON 对象"))?;
    for key in object.keys() {
        if !expected.contains(&key.as_str()) {
            return Err(format!("{label} 包含不允许的字段: {key}"));
        }
    }
    for key in expected {
        if !object.contains_key(*key) {
            return Err(format!("{label} 缺少必需字段: {key}"));
        }
    }
    Ok(())
}

fn checked_count_change(current: usize, baseline: usize, label: &str) -> Result<i64, String> {
    let current = i64::try_from(current).map_err(|_| format!("{label} 当前值超出安全范围"))?;
    let baseline = i64::try_from(baseline).map_err(|_| format!("{label} 基线值超出安全范围"))?;
    current
        .checked_sub(baseline)
        .ok_or_else(|| format!("{label} 变化值超出安全范围"))
}

fn load_knowledge_graph_observation_comparison(
    path: &Path,
) -> Result<KnowledgeGraphObservationComparison, String> {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("json"))
    {
        return Err("知识网络改善对比回执必须是 .json 文件".into());
    }
    let metadata =
        fs::metadata(path).map_err(|error| format!("读取知识网络改善对比回执失败: {error}"))?;
    if metadata.len() > 1024 * 1024 {
        return Err("知识网络改善对比回执超过 1 MiB 安全上限".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取知识网络改善对比回执失败: {error}"))?;
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("解析知识网络改善对比回执失败: {error}"))?;
    require_exact_json_keys(
        &value,
        &[
            "schemaVersion",
            "stage",
            "appVersion",
            "generatedAt",
            "evidenceLevel",
            "consentBoundary",
            "sourceUserContentIncluded",
            "objectIdentifiersIncluded",
            "fileNamesIncluded",
            "absolutePathsIncluded",
            "baselineGeneratedAt",
            "elapsedSeconds",
            "baseline",
            "current",
            "changes",
            "outcome",
            "achievements",
        ],
        "知识网络改善对比回执",
    )?;
    for key in ["baseline", "current"] {
        require_exact_json_keys(
            &value[key],
            &[
                "objectCount",
                "relationCount",
                "connectedObjectCount",
                "isolatedObjectCount",
                "coveragePercent",
                "relationTypeCount",
                "guidanceCodes",
            ],
            if key == "baseline" {
                "基线摘要"
            } else {
                "当前摘要"
            },
        )?;
    }
    require_exact_json_keys(
        &value["changes"],
        &[
            "objectCount",
            "relationCount",
            "connectedObjectCount",
            "isolatedObjectCount",
            "coveragePercent",
            "relationTypeCount",
        ],
        "聚合变化",
    )?;
    let comparison: KnowledgeGraphObservationComparison = serde_json::from_value(value)
        .map_err(|error| format!("解析知识网络改善对比回执失败: {error}"))?;
    if comparison.schema_version != 1
        || comparison.stage != "G15B"
        || comparison.evidence_level != "local-consented-aggregate-comparison-only"
        || comparison.source_user_content_included
        || comparison.object_identifiers_included
        || comparison.file_names_included
        || comparison.absolute_paths_included
    {
        return Err("知识网络改善对比回执未通过隐私与版本校验".into());
    }
    if !matches!(
        comparison.outcome.as_str(),
        "improved" | "mixed" | "regressed" | "unchanged"
    ) {
        return Err("知识网络改善对比回执包含未知结论".into());
    }
    const ALLOWED_ACHIEVEMENTS: [&str; 5] = [
        "coverage-increased",
        "isolated-objects-reduced",
        "relations-added",
        "relation-types-diversified",
        "healthy-coverage-threshold-reached",
    ];
    if comparison.achievements.len() > ALLOWED_ACHIEVEMENTS.len()
        || comparison
            .achievements
            .iter()
            .any(|item| !ALLOWED_ACHIEVEMENTS.contains(&item.as_str()))
    {
        return Err("知识网络改善对比回执包含未知成就".into());
    }
    for (label, snapshot) in [
        ("基线", &comparison.baseline),
        ("当前", &comparison.current),
    ] {
        if snapshot.coverage_percent > 100
            || snapshot.connected_object_count > snapshot.object_count
            || snapshot.isolated_object_count > snapshot.object_count
            || snapshot
                .connected_object_count
                .checked_add(snapshot.isolated_object_count)
                != Some(snapshot.object_count)
        {
            return Err(format!("{label}摘要的聚合计数不一致"));
        }
    }
    if comparison.generated_at < comparison.baseline_generated_at
        || comparison.generated_at - comparison.baseline_generated_at != comparison.elapsed_seconds
        || comparison.changes.object_count
            != checked_count_change(
                comparison.current.object_count,
                comparison.baseline.object_count,
                "对象数量",
            )?
        || comparison.changes.relation_count
            != checked_count_change(
                comparison.current.relation_count,
                comparison.baseline.relation_count,
                "关系数量",
            )?
        || comparison.changes.connected_object_count
            != checked_count_change(
                comparison.current.connected_object_count,
                comparison.baseline.connected_object_count,
                "已连接对象",
            )?
        || comparison.changes.isolated_object_count
            != checked_count_change(
                comparison.current.isolated_object_count,
                comparison.baseline.isolated_object_count,
                "孤立对象",
            )?
        || comparison.changes.coverage_percent
            != i16::from(comparison.current.coverage_percent)
                - i16::from(comparison.baseline.coverage_percent)
        || comparison.changes.relation_type_count
            != checked_count_change(
                comparison.current.relation_type_count,
                comparison.baseline.relation_type_count,
                "关系类型",
            )?
    {
        return Err("知识网络改善对比回执的时间或变化值不一致".into());
    }
    Ok(comparison)
}

#[tauri::command]
pub async fn review_knowledge_graph_observation_comparison(
    receipt_path: String,
) -> Result<KnowledgeGraphObservationComparison, String> {
    load_knowledge_graph_observation_comparison(Path::new(&receipt_path))
}

async fn build_knowledge_graph_observation_comparison(
    library_root: String,
    baseline_path: String,
) -> Result<KnowledgeGraphObservationComparison, String> {
    let baseline = load_knowledge_graph_observation(Path::new(&baseline_path))?;
    let current = get_knowledge_graph_observation(library_root).await?;
    Ok(compare_knowledge_graph_observations(&baseline, &current))
}

#[tauri::command]
pub async fn get_knowledge_graph_observation_comparison(
    library_root: String,
    baseline_path: String,
) -> Result<KnowledgeGraphObservationComparison, String> {
    build_knowledge_graph_observation_comparison(library_root, baseline_path).await
}

#[tauri::command]
pub async fn export_knowledge_graph_observation_comparison(
    library_root: String,
    baseline_path: String,
    target_path: String,
) -> Result<KnowledgeGraphObservationComparison, String> {
    let target = Path::new(&target_path);
    if target
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("json"))
    {
        return Err("知识网络改善对比回执必须保存为 .json 文件".into());
    }
    if target.parent().is_none_or(|parent| !parent.is_dir()) {
        return Err("知识网络改善对比回执目标目录不存在".into());
    }
    let comparison =
        build_knowledge_graph_observation_comparison(library_root, baseline_path).await?;
    let mut bytes = serde_json::to_vec_pretty(&comparison)
        .map_err(|error| format!("序列化知识网络改善对比回执失败: {error}"))?;
    bytes.push(b'\n');
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| format!("创建知识网络改善对比回执失败: {error}"))?;
    output
        .write_all(&bytes)
        .map_err(|error| format!("写入知识网络改善对比回执失败: {error}"))?;
    output
        .sync_all()
        .map_err(|error| format!("同步知识网络改善对比回执失败: {error}"))?;
    Ok(comparison)
}

fn context_node(node: &GraphNode, center_path: &str, requested_path: &str) -> GraphContextNode {
    GraphContextNode {
        id: node.id.clone(),
        title: node.title.clone(),
        path: if node.path == center_path {
            requested_path.to_string()
        } else {
            node.path.clone()
        },
        object_type: node.object_type.clone(),
        location_label: node.location_label.clone(),
        locator: node.locator.clone(),
    }
}

fn relation_class(edge: &GraphEdge, source: &GraphNode, target: &GraphNode) -> String {
    if source.object_type.starts_with("opml") || target.object_type.starts_with("opml") {
        "planning".into()
    } else if matches!(edge.relation_type.as_str(), "contains" | "embeds") {
        "structure".into()
    } else if !edge.mentions.is_empty() {
        "fact".into()
    } else {
        "semantic".into()
    }
}

#[cfg(test)]
pub(crate) fn relation_context(
    graph: &GraphData,
    center_path: &str,
    requested_path: &str,
) -> GraphRelationContext {
    relation_context_for_locator(
        graph,
        center_path,
        requested_path,
        None,
        None,
        None,
        &GraphRelationDecisionMap::new(),
    )
}

fn append_confirmed_relation_edges(
    nodes: &[GraphNode],
    edges: &mut Vec<GraphEdge>,
    decisions: &GraphRelationDecisionMap,
) {
    let node_by_path: HashMap<&str, &GraphNode> = nodes
        .iter()
        .filter(|node| node.parent_id.is_none())
        .map(|node| (node.path.as_str(), node))
        .collect();
    for ((source_path, target_path, relation_type), status) in decisions {
        if status != "confirmed" || relation_type != "shares-tag" {
            continue;
        }
        let (Some(source), Some(target)) = (
            node_by_path.get(source_path.as_str()),
            node_by_path.get(target_path.as_str()),
        ) else {
            continue;
        };
        let source_tags: HashSet<String> =
            source.tags.iter().map(|tag| tag.to_lowercase()).collect();
        if !target
            .tags
            .iter()
            .any(|tag| source_tags.contains(&tag.to_lowercase()))
        {
            continue;
        }
        edges.push(GraphEdge {
            source: source.id.clone(),
            target: target.id.clone(),
            relation_type: relation_type.clone(),
            directed: false,
            mentions: Vec::new(),
        });
    }
}

fn relation_context_for_locator(
    graph: &GraphData,
    center_path: &str,
    requested_path: &str,
    focus_locator_kind: Option<&str>,
    focus_locator_object_id: Option<&str>,
    focus_locator_page: Option<u32>,
    decisions: &GraphRelationDecisionMap,
) -> GraphRelationContext {
    let node_by_id: HashMap<&str, &GraphNode> = graph
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect();
    let focus = graph.nodes.iter().find(|node| {
        if node.path != center_path {
            return false;
        }
        let Some(locator) = node.locator.as_ref() else {
            return false;
        };
        let exact = focus_locator_kind.is_some_and(|kind| locator.kind == kind)
            && focus_locator_object_id.is_some_and(|object_id| locator.object_id == object_id);
        let page_fallback = node.object_type == "pptx_slide"
            && focus_locator_page.is_some()
            && locator.page == focus_locator_page;
        exact || page_fallback
    });
    let root = focus.or_else(|| {
        graph
            .nodes
            .iter()
            .find(|node| node.id == center_path && node.parent_id.is_none())
    });
    let scope: HashSet<&str> = if let Some(focus) = focus {
        HashSet::from([focus.id.as_str()])
    } else {
        graph
            .nodes
            .iter()
            .filter(|node| node.path == center_path)
            .map(|node| node.id.as_str())
            .collect()
    };
    let mut relations = Vec::new();
    let mut truncated = false;
    for edge in graph.edges.iter().filter(|edge| {
        edge.relation_type != "shares-tag"
            && (scope.contains(edge.source.as_str()) || scope.contains(edge.target.as_str()))
    }) {
        if relations.len() >= MAX_RELATION_CONTEXT_ITEMS {
            truncated = true;
            break;
        }
        let (Some(source), Some(target)) = (
            node_by_id.get(edge.source.as_str()).copied(),
            node_by_id.get(edge.target.as_str()).copied(),
        ) else {
            continue;
        };
        let direction = if !edge.directed {
            "related"
        } else if scope.contains(edge.source.as_str()) && scope.contains(edge.target.as_str()) {
            "internal"
        } else if scope.contains(edge.source.as_str()) {
            "outgoing"
        } else {
            "incoming"
        };
        relations.push(GraphContextRelation {
            source: context_node(source, center_path, requested_path),
            target: context_node(target, center_path, requested_path),
            relation_type: edge.relation_type.clone(),
            relation_class: relation_class(edge, source, target),
            direction: direction.into(),
            directed: edge.directed,
            evidence: edge
                .mentions
                .iter()
                .take(3)
                .map(|mention| GraphRelationEvidence {
                    context: mention.context.clone(),
                    line: mention.line,
                    syntax: mention.syntax.clone(),
                })
                .collect(),
            decision_status: "explicit".into(),
        });
    }
    let mut hidden_relations = Vec::new();
    if let Some(root) = root {
        let root_tags: HashMap<String, String> = root
            .tags
            .iter()
            .map(|tag| (tag.to_lowercase(), tag.clone()))
            .collect();
        if !root_tags.is_empty() {
            for peer in graph.nodes.iter().filter(|node| {
                node.parent_id.is_none() && node.id != root.id && !node.tags.is_empty()
            }) {
                let shared: Vec<String> = peer
                    .tags
                    .iter()
                    .filter_map(|tag| root_tags.get(&tag.to_lowercase()).cloned())
                    .collect();
                if shared.is_empty() {
                    continue;
                }
                if relations.len() + hidden_relations.len() >= MAX_RELATION_CONTEXT_ITEMS {
                    truncated = true;
                    break;
                }
                let syntax = shared
                    .iter()
                    .map(|tag| format!("#{tag}"))
                    .collect::<Vec<_>>()
                    .join(" ");
                let decision_status = decisions
                    .get(&relation_decision_key(
                        root.path.as_str(),
                        peer.path.as_str(),
                        "shares-tag",
                    ))
                    .cloned()
                    .unwrap_or_else(|| "inferred".into());
                let relation = GraphContextRelation {
                    source: context_node(root, center_path, requested_path),
                    target: context_node(peer, center_path, requested_path),
                    relation_type: "shares-tag".into(),
                    relation_class: "semantic".into(),
                    direction: "related".into(),
                    directed: false,
                    evidence: vec![GraphRelationEvidence {
                        context: format!("共同标签：{syntax}"),
                        line: 0,
                        syntax,
                    }],
                    decision_status: decision_status.clone(),
                };
                if decision_status == "hidden" {
                    hidden_relations.push(relation);
                } else {
                    relations.push(relation);
                }
            }
        }
    }
    GraphRelationContext {
        path: requested_path.to_string(),
        node: root.map(|node| context_node(node, center_path, requested_path)),
        relations,
        hidden_relations,
        indexed: root.is_some(),
        truncated,
    }
}

#[tauri::command]
pub async fn get_graph_relation_context(
    library_root: String,
    path: String,
    focus_locator_kind: Option<String>,
    focus_locator_object_id: Option<String>,
    focus_locator_page: Option<u32>,
) -> Result<GraphRelationContext, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let resolved = guard.resolve_existing(&path)?;
    if !resolved.is_file() {
        return Err("关系上下文目标必须是文件".into());
    }
    let canonical_path = resolved.to_string_lossy().into_owned();
    let graph = build_link_graph(guard.root().to_string_lossy().into_owned()).await?;
    let decisions = read_graph_relation_decision_map(guard.root())?;
    Ok(relation_context_for_locator(
        &graph,
        &canonical_path,
        &path,
        focus_locator_kind.as_deref(),
        focus_locator_object_id.as_deref(),
        focus_locator_page,
        &decisions,
    ))
}

fn relation_decision_key(
    source_path: &str,
    target_path: &str,
    relation_type: &str,
) -> (String, String, String) {
    let mut paths = [source_path.to_string(), target_path.to_string()];
    paths.sort();
    (
        paths[0].clone(),
        paths[1].clone(),
        relation_type.to_string(),
    )
}

fn relation_decision_path(root: &Path) -> PathBuf {
    root.join(RELATION_DECISION_DIRECTORY)
        .join(RELATION_DECISION_FILE)
}

fn safe_relation_decision_relative_path(path: &str) -> bool {
    let value = Path::new(path);
    !path.trim().is_empty()
        && path.chars().count() <= 4096
        && !value.is_absolute()
        && !value.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
        && value
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

fn read_graph_relation_decision_file(root: &Path) -> Result<GraphRelationDecisionFile, String> {
    let path = relation_decision_path(root);
    if !path.exists() {
        return Ok(GraphRelationDecisionFile::default());
    }
    let metadata =
        fs::metadata(&path).map_err(|error| format!("读取关系判断元数据失败: {error}"))?;
    if metadata.len() > MAX_RELATION_DECISION_FILE_BYTES {
        return Err("关系判断元数据超过 512 KiB 安全上限".into());
    }
    let content =
        fs::read_to_string(&path).map_err(|error| format!("读取关系判断元数据失败: {error}"))?;
    let file: GraphRelationDecisionFile = serde_json::from_str(&content)
        .map_err(|error| format!("关系判断元数据格式无效: {error}"))?;
    if file.version != 1 || file.decisions.len() > MAX_RELATION_DECISIONS {
        return Err("关系判断元数据版本或数量无效".into());
    }
    Ok(file)
}

fn read_graph_relation_decision_map(root: &Path) -> Result<GraphRelationDecisionMap, String> {
    let guard = WorkspaceGuard::new(root)?;
    let mut result = GraphRelationDecisionMap::new();
    for decision in read_graph_relation_decision_file(guard.root())?.decisions {
        if decision.relation_type != "shares-tag"
            || !matches!(decision.status.as_str(), "confirmed" | "hidden")
            || !safe_relation_decision_relative_path(&decision.source_path)
            || !safe_relation_decision_relative_path(&decision.target_path)
        {
            return Err("关系判断元数据包含无效记录".into());
        }
        let (Ok(source), Ok(target)) = (
            guard.resolve_existing_file(&decision.source_path, &["md"]),
            guard.resolve_existing_file(&decision.target_path, &["md"]),
        ) else {
            continue;
        };
        if source == target {
            return Err("关系判断不能指向同一文件".into());
        }
        let key = relation_decision_key(
            source.to_string_lossy().as_ref(),
            target.to_string_lossy().as_ref(),
            &decision.relation_type,
        );
        if result.insert(key, decision.status).is_some() {
            return Err("关系判断元数据包含重复记录".into());
        }
    }
    Ok(result)
}

fn relative_decision_path(root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .map_err(|_| "无法计算关系判断相对路径".into())
}

#[tauri::command]
pub async fn update_graph_relation_decision(
    library_root: String,
    source_path: String,
    target_path: String,
    relation_type: String,
    status: String,
) -> Result<(), String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let source = guard.resolve_existing_file(&source_path, &["md"])?;
    let target = guard.resolve_existing_file(&target_path, &["md"])?;
    if source == target {
        return Err("关系判断不能指向同一文件".into());
    }
    if relation_type != "shares-tag" {
        return Err("当前仅支持管理共同标签推断关系".into());
    }
    if !matches!(status.as_str(), "confirmed" | "hidden" | "inferred") {
        return Err("关系判断状态无效".into());
    }

    let source_relative = relative_decision_path(guard.root(), &source)?;
    let target_relative = relative_decision_path(guard.root(), &target)?;
    let key = relation_decision_key(&source_relative, &target_relative, &relation_type);
    let mut file = read_graph_relation_decision_file(guard.root())?;
    file.decisions.retain(|decision| {
        relation_decision_key(
            &decision.source_path,
            &decision.target_path,
            &decision.relation_type,
        ) != key
    });
    if status != "inferred" {
        if file.decisions.len() >= MAX_RELATION_DECISIONS {
            return Err(format!("关系判断不能超过 {MAX_RELATION_DECISIONS} 条"));
        }
        file.decisions.push(GraphRelationDecision {
            source_path: source_relative,
            target_path: target_relative,
            relation_type,
            status,
            updated_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        });
        file.decisions.sort_by(|left, right| {
            (&left.source_path, &left.target_path, &left.relation_type).cmp(&(
                &right.source_path,
                &right.target_path,
                &right.relation_type,
            ))
        });
    }
    let directory = guard.resolve_directory(RELATION_DECISION_DIRECTORY, true)?;
    fs::create_dir_all(&directory).map_err(|error| format!("创建关系判断目录失败: {error}"))?;
    let content = serde_json::to_string_pretty(&file)
        .map_err(|error| format!("序列化关系判断失败: {error}"))?;
    write_utf8(
        relation_decision_path(guard.root()),
        &format!("{content}\n"),
    )
}

fn build_filename_index(
    dir: &Path,
    index: &mut HashMap<String, Vec<String>>,
    graph_paths: &mut Vec<PathBuf>,
    cancelled: &AtomicBool,
) {
    if cancelled.load(Ordering::Relaxed) {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if cancelled.load(Ordering::Relaxed) {
            return;
        }
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            build_filename_index(&path, index, graph_paths, cancelled);
        } else {
            if name.ends_with(".md") {
                index
                    .entry(name.trim_end_matches(".md").to_string())
                    .or_default()
                    .push(path.to_string_lossy().into_owned());
            }
            graph_paths.push(path);
        }
    }
}

fn build_graph_paths(
    library_root: &Path,
    paths: &[PathBuf],
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
    name_to_paths: &HashMap<String, Vec<String>>,
    cancelled: &AtomicBool,
) {
    if cancelled.load(Ordering::Relaxed) {
        return;
    }
    for path in paths {
        if cancelled.load(Ordering::Relaxed) {
            return;
        }
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.ends_with(".md") {
            add_markdown_node(
                library_root,
                path.parent().unwrap_or(library_root),
                path,
                &name,
                nodes,
                edges,
                node_ids,
                name_to_paths,
            );
        } else if name.to_lowercase().ends_with(".pdf") {
            add_pdf_node(library_root, path, &name, nodes, edges, node_ids);
        } else if name.to_lowercase().ends_with(".csv")
            || name.to_lowercase().ends_with(".tsv")
            || name.to_lowercase().ends_with(".table.json")
        {
            add_table_node(library_root, path, &name, nodes, edges, node_ids);
        } else if name.to_lowercase().ends_with(".canvas") {
            add_canvas_document(library_root, path, &name, nodes, edges, node_ids);
        } else if name.to_lowercase().ends_with(".opml") {
            add_opml_document(library_root, path, &name, nodes, edges, node_ids);
        } else if name.to_lowercase().ends_with(".pptx") {
            add_pptx_document(library_root, path, &name, nodes, edges, node_ids);
        } else if name.to_lowercase().ends_with(".odp") {
            add_odp_document(library_root, path, &name, nodes, edges, node_ids);
        } else if name.to_lowercase().ends_with(".xlsx") {
            add_workbook_document(library_root, path, &name, nodes, edges, node_ids);
        } else if name.to_lowercase().ends_with(".docx") {
            add_docx_document(library_root, path, &name, nodes, edges, node_ids);
        } else if name.to_lowercase().ends_with(".ods") {
            add_ods_document(library_root, path, &name, nodes, edges, node_ids);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn add_markdown_node(
    library_root: &Path,
    current_dir: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
    name_to_paths: &HashMap<String, Vec<String>>,
) {
    let path_string = path.to_string_lossy().into_owned();
    let id = path_string.clone();
    let bytes = fs::read(path).unwrap_or_default();
    let content = String::from_utf8(bytes.clone()).unwrap_or_default();
    if node_ids.insert(id.clone()) {
        let metadata = fs::metadata(path).ok();
        let size = metadata.as_ref().map(|value| value.len()).unwrap_or(0) as f64;
        let mut tags: Vec<String> = RE_TAG
            .captures_iter(&content)
            .map(|capture| capture[1].to_string())
            .collect();
        tags.sort_by_key(|value| value.to_lowercase());
        tags.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
        nodes.push(GraphNode {
            id: id.clone(),
            title: name.trim_end_matches(".md").to_string(),
            path: path_string,
            size: (size / 100.0).clamp(5.0, 30.0),
            tags,
            directory: relative_directory(path, library_root),
            modified_at: modified_timestamp(metadata),
            object_type: "markdown".into(),
            search_text: content.chars().take(8_000).collect(),
            content_signature: Some(format!("{:x}", md5::compute(&bytes))),
            parent_id: None,
            locator: None,
            location_label: None,
        });
    }
    for mention in extract_wikilink_mentions(&content) {
        let target = resolve_wikilink(&mention.target, name_to_paths, current_dir);
        edges.push(GraphEdge::wikilink(id.clone(), target, mention));
    }
    for mention in extract_pdf_reference_mentions(&content) {
        let target = library_root.join(mention.target.replace('/', std::path::MAIN_SEPARATOR_STR));
        let target_id = target
            .canonicalize()
            .ok()
            .filter(|value| value.starts_with(library_root))
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| target.to_string_lossy().into_owned());
        let target_id = query_parameter(&mention.syntax, "annotation")
            .filter(|annotation_id| !annotation_id.is_empty())
            .map(|annotation_id| knowledge_object_id(&target_id, "pdf_annotation", &annotation_id))
            .unwrap_or(target_id);
        edges.push(GraphEdge::wikilink(id.clone(), target_id, mention));
    }
}

fn add_pdf_node(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let index = load_pdf_index(path);
    let mut search_text = String::new();
    for page in &index.pages {
        if search_text.chars().count() >= 8_000 {
            break;
        }
        search_text.push_str(page);
        search_text.push('\n');
    }
    for page in &index.ocr_pages {
        search_text.push_str(&page.text);
        search_text.push('\n');
    }
    for annotation in &index.annotations {
        search_text.push_str(&annotation.text);
        search_text.push('\n');
    }
    let metadata = fs::metadata(path).ok();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title: name[..name.len().saturating_sub(4)].to_string(),
        path: path_string.clone(),
        size: 8.0,
        tags: Vec::new(),
        directory: relative_directory(path, library_root),
        modified_at: modified_timestamp(metadata),
        object_type: "pdf".into(),
        search_text: search_text.chars().take(12_000).collect(),
        content_signature: None,
        parent_id: None,
        locator: None,
        location_label: None,
    });
    for annotation in index.annotations {
        let annotation_id = knowledge_object_id(&path_string, "pdf_annotation", &annotation.id);
        if !node_ids.insert(annotation_id.clone()) {
            continue;
        }
        let title = if annotation.text.trim().is_empty() {
            format!("第 {} 页批注", annotation.page)
        } else {
            truncate_text(annotation.text.trim(), 80)
        };
        nodes.push(GraphNode {
            id: annotation_id.clone(),
            title,
            path: path_string.clone(),
            size: 8.0,
            tags: Vec::new(),
            directory: relative_directory(path, library_root),
            modified_at: modified_timestamp(fs::metadata(path).ok()),
            object_type: "pdf_annotation".into(),
            search_text: annotation.text,
            content_signature: None,
            parent_id: Some(path_string.clone()),
            locator: Some(GraphObjectLocator {
                kind: "pdf_annotation".into(),
                object_id: annotation.id,
                page: Some(annotation.page),
            }),
            location_label: Some(format!("第 {} 页", annotation.page)),
        });
        edges.push(GraphEdge::structural(
            path_string.clone(),
            annotation_id,
            "contains",
        ));
    }
}

fn add_table_node(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let metadata = fs::metadata(path).ok();
    let size = metadata.as_ref().map(|value| value.len()).unwrap_or(0);
    let bytes = fs::read(path).unwrap_or_default();
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (content, _, _) = encoding.decode(&bytes);
    let table = if name.to_ascii_lowercase().ends_with(".table.json") {
        parse_internal_table(content.strip_prefix('\u{feff}').unwrap_or(&content)).ok()
    } else {
        None
    };
    let search_text = table
        .as_ref()
        .map(|table| table_search_text(table, 12_000))
        .unwrap_or_else(|| content.chars().take(12_000).collect());
    let title = name
        .strip_suffix(".table.json")
        .or_else(|| name.rsplit_once('.').map(|(stem, _)| stem))
        .unwrap_or(name)
        .to_string();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title,
        path: path_string.clone(),
        size: ((size as f64 / 20_000.0) + 8.0).clamp(8.0, 20.0),
        tags: Vec::new(),
        directory: relative_directory(path, library_root),
        modified_at: modified_timestamp(metadata),
        object_type: "table".into(),
        search_text,
        content_signature: None,
        parent_id: None,
        locator: None,
        location_label: None,
    });
    let Some(table) = table else { return };
    for view in &table.views {
        let view_id = knowledge_object_id(&path_string, "table_view", &view.id);
        if !node_ids.insert(view_id.clone()) {
            continue;
        }
        nodes.push(GraphNode {
            id: view_id.clone(),
            title: view.name.clone(),
            path: path_string.clone(),
            size: 8.0,
            tags: Vec::new(),
            directory: relative_directory(path, library_root),
            modified_at: modified_timestamp(fs::metadata(path).ok()),
            object_type: "table_view".into(),
            search_text: format!("{} {}", view.name, view.kind),
            content_signature: None,
            parent_id: Some(path_string.clone()),
            locator: Some(GraphObjectLocator {
                kind: "table_view".into(),
                object_id: view.id.clone(),
                page: None,
            }),
            location_label: Some(table_view_label(&view.kind)),
        });
        edges.push(GraphEdge::structural(
            path_string.clone(),
            view_id,
            "contains",
        ));
    }
    for view in &table.views {
        if view.kind != "dashboard" {
            continue;
        }
        let source = knowledge_object_id(&path_string, "table_view", &view.id);
        for item in &view.config.dashboard_items {
            let target = knowledge_object_id(&path_string, "table_view", &item.chart_view_id);
            edges.push(GraphEdge::structural(source.clone(), target, "embeds"));
        }
    }
}

fn add_canvas_document(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    if validate_canvas_json(&content).is_err() {
        return;
    }
    let Ok(document) = serde_json::from_str::<serde_json::Value>(&content) else {
        return;
    };
    let Some(canvas_nodes) = document.get("nodes").and_then(|value| value.as_array()) else {
        return;
    };
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let metadata = fs::metadata(path).ok();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title: name.strip_suffix(".canvas").unwrap_or(name).to_string(),
        path: path_string.clone(),
        size: 8.0,
        tags: Vec::new(),
        directory: relative_directory(path, library_root),
        modified_at: modified_timestamp(metadata),
        object_type: "canvas".into(),
        search_text: canvas_nodes
            .iter()
            .filter_map(|node| node.get("text").and_then(|value| value.as_str()))
            .collect::<Vec<_>>()
            .join("\n")
            .chars()
            .take(12_000)
            .collect(),
        content_signature: Some(format!("{:x}", md5::compute(content.as_bytes()))),
        parent_id: None,
        locator: None,
        location_label: None,
    });
    for node in canvas_nodes.iter().take(5_000) {
        let Some(local_id) = node.get("id").and_then(|value| value.as_str()) else {
            continue;
        };
        let object_id = knowledge_object_id(&path_string, "canvas_node", local_id);
        if !node_ids.insert(object_id.clone()) {
            continue;
        }
        let node_type = node
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or("text");
        let title = canvas_node_title(node, local_id);
        nodes.push(GraphNode {
            id: object_id.clone(),
            title: title.clone(),
            path: path_string.clone(),
            size: 8.0,
            tags: Vec::new(),
            directory: relative_directory(path, library_root),
            modified_at: modified_timestamp(fs::metadata(path).ok()),
            object_type: "canvas_node".into(),
            search_text: title,
            content_signature: None,
            parent_id: Some(path_string.clone()),
            locator: Some(GraphObjectLocator {
                kind: "canvas_node".into(),
                object_id: local_id.to_string(),
                page: None,
            }),
            location_label: Some(canvas_node_label(node_type)),
        });
        edges.push(GraphEdge::structural(
            path_string.clone(),
            object_id.clone(),
            "contains",
        ));
        if node_type == "file" {
            if let Some(file) = node.get("file").and_then(|value| value.as_str()) {
                if let Some(target_path) = resolve_workspace_reference(library_root, file) {
                    let target = node
                        .get("longeditViewId")
                        .and_then(|value| value.as_str())
                        .map(|view_id| knowledge_object_id(&target_path, "table_view", view_id))
                        .unwrap_or(target_path);
                    edges.push(GraphEdge::structural(object_id, target, "embeds"));
                }
            }
        }
    }
    if let Some(canvas_edges) = document.get("edges").and_then(|value| value.as_array()) {
        for edge in canvas_edges.iter().take(5_000) {
            let Some(from) = edge.get("fromNode").and_then(|value| value.as_str()) else {
                continue;
            };
            let Some(to) = edge.get("toNode").and_then(|value| value.as_str()) else {
                continue;
            };
            let relation = edge
                .get("relationType")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .and_then(normalize_relation_type)
                .unwrap_or_else(|| "links-to".into());
            edges.push(GraphEdge::structural(
                knowledge_object_id(&path_string, "canvas_node", from),
                knowledge_object_id(&path_string, "canvas_node", to),
                &relation,
            ));
        }
    }
}

fn add_opml_document(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    let Ok(document) = parse_opml(&content) else {
        return;
    };
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let title = if document.title.trim().is_empty() {
        name.strip_suffix(".opml").unwrap_or(name).to_string()
    } else {
        document.title.clone()
    };
    nodes.push(GraphNode {
        id: path_string.clone(),
        title,
        path: path_string.clone(),
        size: 8.0,
        tags: Vec::new(),
        directory: relative_directory(path, library_root),
        modified_at: modified_timestamp(fs::metadata(path).ok()),
        object_type: "opml".into(),
        search_text: content.chars().take(12_000).collect(),
        content_signature: Some(format!("{:x}", md5::compute(content.as_bytes()))),
        parent_id: None,
        locator: None,
        location_label: None,
    });
    for root in &document.roots {
        add_opml_node(
            root,
            0,
            &path_string,
            &path_string,
            library_root,
            path,
            nodes,
            edges,
            node_ids,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn add_opml_node(
    node: &OpmlNode,
    depth: usize,
    parent_id: &str,
    document_path: &str,
    library_root: &Path,
    path: &Path,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let object_id = knowledge_object_id(document_path, "opml_node", &node.id);
    if !node_ids.insert(object_id.clone()) {
        return;
    }
    nodes.push(GraphNode {
        id: object_id.clone(),
        title: truncate_text(&node.text, 100),
        path: document_path.to_string(),
        size: 8.0,
        tags: Vec::new(),
        directory: relative_directory(path, library_root),
        modified_at: modified_timestamp(fs::metadata(path).ok()),
        object_type: "opml_node".into(),
        search_text: format!("{} {}", node.text, node.note),
        content_signature: None,
        parent_id: Some(document_path.to_string()),
        locator: Some(GraphObjectLocator {
            kind: "opml_node".into(),
            object_id: node.id.clone(),
            page: None,
        }),
        location_label: Some(format!("第 {} 层主题", depth + 1)),
    });
    edges.push(GraphEdge::structural(
        parent_id.to_string(),
        object_id.clone(),
        "contains",
    ));
    for child in &node.children {
        add_opml_node(
            child,
            depth + 1,
            &object_id,
            document_path,
            library_root,
            path,
            nodes,
            edges,
            node_ids,
        );
    }
}

fn add_pptx_document(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let Ok(bytes) = fs::read(path) else {
        return;
    };
    let Ok(model) = parse_pptx(&bytes) else {
        return;
    };
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let metadata = fs::metadata(path).ok();
    let modified_at = modified_timestamp(metadata);
    let directory = relative_directory(path, library_root);
    let title = name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(name)
        .to_string();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title,
        path: path_string.clone(),
        size: ((bytes.len() as f64 / 100_000.0) + 8.0).clamp(8.0, 24.0),
        tags: Vec::new(),
        directory: directory.clone(),
        modified_at,
        object_type: "pptx".into(),
        search_text: model.plain_text.chars().take(12_000).collect(),
        content_signature: Some(format!("{:x}", md5::compute(&bytes))),
        parent_id: None,
        locator: None,
        location_label: None,
    });

    let mut search_text_by_slide: HashMap<u32, Vec<String>> = HashMap::new();
    for segment in pptx_search_segments(&model) {
        search_text_by_slide
            .entry(segment.slide_number)
            .or_default()
            .push(segment.text);
    }
    for (index, slide) in model.slides.iter().enumerate() {
        let slide_number = (index + 1) as u32;
        let object_id = knowledge_object_id(&path_string, "pptx_slide", &slide.id);
        if !node_ids.insert(object_id.clone()) {
            continue;
        }
        let title = if slide.title.trim().is_empty() {
            format!("幻灯片 {slide_number}")
        } else {
            slide.title.clone()
        };
        let location_label = pptx_slide_location_label(slide, slide_number);
        let search_text = search_text_by_slide
            .remove(&slide_number)
            .unwrap_or_default()
            .join("\n")
            .chars()
            .take(12_000)
            .collect();
        nodes.push(GraphNode {
            id: object_id.clone(),
            title,
            path: path_string.clone(),
            size: 8.0,
            tags: Vec::new(),
            directory: directory.clone(),
            modified_at,
            object_type: "pptx_slide".into(),
            search_text,
            content_signature: None,
            parent_id: Some(path_string.clone()),
            locator: Some(GraphObjectLocator {
                kind: "pptx-slide".into(),
                object_id: slide.id.clone(),
                page: Some(slide_number),
            }),
            location_label: Some(location_label),
        });
        edges.push(GraphEdge::structural(
            path_string.clone(),
            object_id,
            "contains",
        ));
    }
}

fn add_odp_document(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let Ok(bytes) = fs::read(path) else {
        return;
    };
    let Ok(model) = parse_odf_content(&bytes, "odp") else {
        return;
    };
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let metadata = fs::metadata(path).ok();
    let modified_at = modified_timestamp(metadata);
    let directory = relative_directory(path, library_root);
    let title = name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(name)
        .to_string();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title,
        path: path_string.clone(),
        size: ((bytes.len() as f64 / 100_000.0) + 8.0).clamp(8.0, 24.0),
        tags: Vec::new(),
        directory: directory.clone(),
        modified_at,
        object_type: "odp".into(),
        search_text: model.plain_text.chars().take(12_000).collect(),
        content_signature: Some(format!("{:x}", md5::compute(&bytes))),
        parent_id: None,
        locator: None,
        location_label: None,
    });
    for slide in &model.slides {
        let object_id = knowledge_object_id(&path_string, "odp_slide", &slide.id);
        if !node_ids.insert(object_id.clone()) {
            continue;
        }
        let title = if slide.name.trim().is_empty() {
            format!("幻灯片 {}", slide.index)
        } else {
            slide.name.clone()
        };
        nodes.push(GraphNode {
            id: object_id.clone(),
            title,
            path: path_string.clone(),
            size: 8.0,
            tags: Vec::new(),
            directory: directory.clone(),
            modified_at,
            object_type: "odp_slide".into(),
            search_text: format!("{}\n{}", slide.text, slide.notes)
                .chars()
                .take(12_000)
                .collect(),
            content_signature: None,
            parent_id: Some(path_string.clone()),
            locator: Some(GraphObjectLocator {
                kind: "odp-slide".into(),
                object_id: slide.id.clone(),
                page: Some(slide.index as u32),
            }),
            location_label: Some(format!("幻灯片 {}", slide.index)),
        });
        edges.push(GraphEdge::structural(
            path_string.clone(),
            object_id,
            "contains",
        ));
    }
}

fn add_workbook_document(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let Ok(bytes) = fs::read(path) else {
        return;
    };
    let path_string = path.to_string_lossy().into_owned();
    let title = name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(name)
        .to_string();
    let Ok(segments) = build_workbook_index_segments(&title, &path_string, "workbook", &bytes)
    else {
        return;
    };
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let metadata = fs::metadata(path).ok();
    let modified_at = modified_timestamp(metadata);
    let directory = relative_directory(path, library_root);
    let search_text = segments
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(12_000)
        .collect();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title,
        path: path_string.clone(),
        size: ((bytes.len() as f64 / 100_000.0) + 8.0).clamp(8.0, 24.0),
        tags: Vec::new(),
        directory: directory.clone(),
        modified_at,
        object_type: "workbook".into(),
        search_text,
        content_signature: Some(format!("{:x}", md5::compute(&bytes))),
        parent_id: None,
        locator: None,
        location_label: None,
    });
    for segment in segments
        .into_iter()
        .filter(|segment| segment.locator_kind.as_deref() == Some("workbook-sheet"))
    {
        let Some(sheet) = segment.locator_object_id else {
            continue;
        };
        let object_id = knowledge_object_id(&path_string, "workbook_sheet", &sheet);
        if !node_ids.insert(object_id.clone()) {
            continue;
        }
        nodes.push(GraphNode {
            id: object_id.clone(),
            title: sheet.clone(),
            path: path_string.clone(),
            size: 8.0,
            tags: Vec::new(),
            directory: directory.clone(),
            modified_at,
            object_type: "workbook_sheet".into(),
            search_text: segment.text.chars().take(12_000).collect(),
            content_signature: None,
            parent_id: Some(path_string.clone()),
            locator: Some(GraphObjectLocator {
                kind: "workbook-sheet".into(),
                object_id: sheet,
                page: None,
            }),
            location_label: segment.location_label,
        });
        edges.push(GraphEdge::structural(
            path_string.clone(),
            object_id,
            "contains",
        ));
    }
}

fn docx_heading_parent_id(outline: &mut Vec<(u8, String)>, level: u8, document_id: &str) -> String {
    while outline
        .last()
        .is_some_and(|(parent_level, _)| *parent_level >= level)
    {
        outline.pop();
    }
    outline
        .last()
        .map(|(_, id)| id.clone())
        .unwrap_or_else(|| document_id.to_string())
}

fn add_docx_document(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let Ok(bytes) = fs::read(path) else {
        return;
    };
    let Ok(model) = parse_docx(&bytes) else {
        return;
    };
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let metadata = fs::metadata(path).ok();
    let modified_at = modified_timestamp(metadata);
    let directory = relative_directory(path, library_root);
    let title = name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(name)
        .to_string();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title,
        path: path_string.clone(),
        size: ((bytes.len() as f64 / 100_000.0) + 8.0).clamp(8.0, 24.0),
        tags: Vec::new(),
        directory: directory.clone(),
        modified_at,
        object_type: "docx".into(),
        search_text: model.plain_text.chars().take(12_000).collect(),
        content_signature: Some(format!("{:x}", md5::compute(&bytes))),
        parent_id: None,
        locator: None,
        location_label: None,
    });

    let mut outline = Vec::<(u8, String)>::new();
    for heading in model
        .headings
        .iter()
        .filter(|heading| !heading.text.trim().is_empty())
        .take(MAX_DOCX_GRAPH_HEADINGS)
    {
        let object_id = knowledge_object_id(&path_string, "docx_heading", &heading.block_id);
        if !node_ids.insert(object_id.clone()) {
            continue;
        }
        let parent_id = docx_heading_parent_id(&mut outline, heading.level, &path_string);
        let title = heading.text.trim().chars().take(160).collect::<String>();
        nodes.push(GraphNode {
            id: object_id.clone(),
            title: title.clone(),
            path: path_string.clone(),
            size: 8.0,
            tags: Vec::new(),
            directory: directory.clone(),
            modified_at,
            object_type: "docx_heading".into(),
            search_text: heading.text.chars().take(12_000).collect(),
            content_signature: None,
            parent_id: Some(parent_id.clone()),
            locator: Some(GraphObjectLocator {
                kind: "docx-block".into(),
                object_id: heading.block_id.clone(),
                page: None,
            }),
            location_label: Some(format!("标题：{title}")),
        });
        edges.push(GraphEdge::structural(
            parent_id,
            object_id.clone(),
            "contains",
        ));
        outline.push((heading.level, object_id));
    }
}

fn add_ods_document(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
) {
    let Ok(bytes) = fs::read(path) else {
        return;
    };
    let Ok(model) = parse_odf_content(&bytes, "ods") else {
        return;
    };
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let metadata = fs::metadata(path).ok();
    let modified_at = modified_timestamp(metadata);
    let directory = relative_directory(path, library_root);
    let title = name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(name)
        .to_string();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title,
        path: path_string.clone(),
        size: ((bytes.len() as f64 / 100_000.0) + 8.0).clamp(8.0, 24.0),
        tags: Vec::new(),
        directory: directory.clone(),
        modified_at,
        object_type: "ods".into(),
        search_text: model.plain_text.chars().take(12_000).collect(),
        content_signature: Some(format!("{:x}", md5::compute(&bytes))),
        parent_id: None,
        locator: None,
        location_label: None,
    });

    for (index, sheet) in model.sheets.iter().take(MAX_ODS_GRAPH_SHEETS).enumerate() {
        let object_id = knowledge_object_id(&path_string, "ods_sheet", &sheet.id);
        if !node_ids.insert(object_id.clone()) {
            continue;
        }
        let title = if sheet.name.trim().is_empty() {
            format!("工作表 {}", index + 1)
        } else {
            sheet.name.trim().to_string()
        };
        let search_text = sheet
            .rows
            .iter()
            .flat_map(|row| row.cells.iter())
            .map(|cell| cell.text.as_str())
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n")
            .chars()
            .take(12_000)
            .collect();
        nodes.push(GraphNode {
            id: object_id.clone(),
            title: title.clone(),
            path: path_string.clone(),
            size: 8.0,
            tags: Vec::new(),
            directory: directory.clone(),
            modified_at,
            object_type: "ods_sheet".into(),
            search_text,
            content_signature: None,
            parent_id: Some(path_string.clone()),
            locator: Some(GraphObjectLocator {
                kind: "ods-sheet".into(),
                object_id: sheet.id.clone(),
                page: None,
            }),
            location_label: Some(format!("工作表：{title}")),
        });
        edges.push(GraphEdge::structural(
            path_string.clone(),
            object_id,
            "contains",
        ));
    }
}

fn knowledge_object_id(path: &str, kind: &str, local_id: &str) -> String {
    format!(
        "longedit-object:{kind}:{:x}:{}",
        md5::compute(path.as_bytes()),
        urlencoding::encode(local_id)
    )
}

fn query_parameter(uri: &str, key: &str) -> Option<String> {
    let query = uri.split_once('?')?.1;
    query.split('&').find_map(|field| {
        let (field_key, value) = field.split_once('=')?;
        (field_key == key)
            .then(|| {
                urlencoding::decode(value)
                    .ok()
                    .map(|value| value.into_owned())
            })
            .flatten()
    })
}

fn resolve_workspace_reference(library_root: &Path, reference: &str) -> Option<String> {
    if reference.starts_with('/') || reference.starts_with('\\') || reference.get(1..2) == Some(":")
    {
        return None;
    }
    let candidate = library_root.join(reference.replace('/', std::path::MAIN_SEPARATOR_STR));
    candidate
        .canonicalize()
        .ok()
        .filter(|value| value.starts_with(library_root))
        .map(|value| value.to_string_lossy().into_owned())
}

fn truncate_text(value: &str, limit: usize) -> String {
    let trimmed = value.trim();
    let mut result: String = trimmed.chars().take(limit).collect();
    if trimmed.chars().count() > limit {
        result.push_str("...");
    }
    result
}

fn table_view_label(kind: &str) -> String {
    match kind {
        "grid" => "表格视图",
        "board" => "看板视图",
        "chart" => "图表视图",
        "dashboard" => "仪表盘视图",
        _ => "数据视图",
    }
    .into()
}

fn canvas_node_label(kind: &str) -> String {
    match kind {
        "file" => "文件节点",
        "link" => "链接节点",
        "group" => "分组节点",
        _ => "文本节点",
    }
    .into()
}

fn canvas_node_title(node: &serde_json::Value, fallback: &str) -> String {
    for field in ["text", "label", "file", "url"] {
        if let Some(value) = node.get(field).and_then(|value| value.as_str()) {
            let first_line = value
                .lines()
                .next()
                .unwrap_or(value)
                .trim_start_matches('#')
                .trim();
            if !first_line.is_empty() {
                return truncate_text(first_line, 100);
            }
        }
    }
    fallback.to_string()
}

fn relative_directory(path: &Path, library_root: &Path) -> String {
    path.parent()
        .and_then(|parent| parent.strip_prefix(library_root).ok())
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

fn modified_timestamp(metadata: Option<fs::Metadata>) -> u64 {
    metadata
        .and_then(|value| value.modified().ok())
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn resolve_wikilink(
    link: &str,
    name_to_paths: &HashMap<String, Vec<String>>,
    current_dir: &Path,
) -> String {
    if link.contains(':') || link.starts_with('/') || link.starts_with('\\') {
        return link.to_string();
    }
    if link.contains('/') || link.contains('\\') {
        let normalized = link.replace('\\', "/");
        let file_name = normalized.rsplit('/').next().unwrap_or(link);
        if let Some(paths) = name_to_paths.get(file_name) {
            for path in paths {
                if path
                    .replace('\\', "/")
                    .ends_with(&format!("/{normalized}.md"))
                {
                    return path.clone();
                }
            }
            return paths[0].clone();
        }
        return format!("{link}.md");
    }
    if let Some(paths) = name_to_paths.get(link) {
        if paths.len() == 1 {
            return paths[0].clone();
        }
        let current_dir = current_dir.to_string_lossy();
        if let Some(path) = paths
            .iter()
            .find(|path| path.starts_with(current_dir.as_ref()))
        {
            return path.clone();
        }
        return paths[0].clone();
    }
    format!("{}/{}.md", current_dir.to_string_lossy(), link)
}

#[derive(Clone, Debug)]
struct NoteRecord {
    path: PathBuf,
    title: String,
    relative_path: String,
    replacement_target: String,
    directory: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphHealthCandidate {
    title: String,
    path: String,
    relative_path: String,
    replacement_target: String,
    confidence: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphLinkIssue {
    id: String,
    kind: String,
    source_path: String,
    source_title: String,
    target_text: String,
    syntax: String,
    context: String,
    line: usize,
    relation_type: String,
    candidates: Vec<GraphHealthCandidate>,
    recommended_candidate: Option<GraphHealthCandidate>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OrphanNote {
    path: String,
    title: String,
    relative_path: String,
    directory: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphHealthReport {
    broken_links: Vec<GraphLinkIssue>,
    ambiguous_links: Vec<GraphLinkIssue>,
    orphan_notes: Vec<OrphanNote>,
    scanned_notes: usize,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphLinkRepair {
    source_path: String,
    target_path: String,
    line: usize,
    expected_syntax: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphRepairResult {
    repaired_links: usize,
    changed_files: usize,
}

enum LinkResolution {
    Resolved(PathBuf),
    Broken(Vec<GraphHealthCandidate>, Option<GraphHealthCandidate>),
    Ambiguous(Vec<GraphHealthCandidate>),
}

#[tauri::command]
pub async fn analyze_graph_health(library_root: String) -> Result<GraphHealthReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let mut report = analyze_workspace(guard.root())?;
    let graph = build_link_graph(guard.root().to_string_lossy().into_owned()).await?;
    let confirmed_paths: HashSet<&str> = graph
        .edges
        .iter()
        .filter(|edge| edge.relation_type == "shares-tag")
        .flat_map(|edge| [edge.source.as_str(), edge.target.as_str()])
        .collect();
    report
        .orphan_notes
        .retain(|note| !confirmed_paths.contains(note.path.as_str()));
    Ok(report)
}

fn analyze_workspace(root: &Path) -> Result<GraphHealthReport, String> {
    let mut notes = Vec::new();
    collect_notes(root, root, &mut notes)?;
    notes.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    let mut by_title: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, note) in notes.iter().enumerate() {
        by_title
            .entry(note.title.to_lowercase())
            .or_default()
            .push(index);
    }

    let mut report = GraphHealthReport {
        scanned_notes: notes.len(),
        ..Default::default()
    };
    let mut connected = HashSet::new();
    for note in &notes {
        let content = fs::read_to_string(&note.path)
            .map_err(|error| format!("读取图谱治理文件失败 {}: {}", note.relative_path, error))?;
        for mention in extract_wikilink_mentions(&content) {
            match resolve_mention(note, &mention.target, &notes, &by_title) {
                LinkResolution::Resolved(target) => {
                    connected.insert(note.path.clone());
                    connected.insert(target);
                }
                LinkResolution::Broken(candidates, recommended_candidate) => {
                    report.broken_links.push(issue_from(
                        "broken",
                        note,
                        mention,
                        candidates,
                        recommended_candidate,
                    ));
                }
                LinkResolution::Ambiguous(candidates) => {
                    report.ambiguous_links.push(issue_from(
                        "ambiguous",
                        note,
                        mention,
                        candidates,
                        None,
                    ));
                }
            }
        }
    }

    report.orphan_notes = notes
        .iter()
        .filter(|note| !connected.contains(&note.path))
        .map(|note| OrphanNote {
            path: note.path.to_string_lossy().into_owned(),
            title: note.title.clone(),
            relative_path: note.relative_path.clone(),
            directory: note.directory.clone(),
        })
        .collect();
    Ok(report)
}

fn collect_notes(root: &Path, directory: &Path, notes: &mut Vec<NoteRecord>) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("扫描图谱治理目录失败 {}: {}", directory.display(), error))?;
    for entry in entries.flatten() {
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            collect_notes(root, &path, notes)?;
        } else if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("md"))
        {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "无法计算治理文件相对路径")?;
            let relative_path = relative.to_string_lossy().replace('\\', "/");
            let replacement_target = relative
                .with_extension("")
                .to_string_lossy()
                .replace('\\', "/");
            let directory = relative
                .parent()
                .map(|value| value.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            notes.push(NoteRecord {
                path,
                title: name.trim_end_matches(".md").to_string(),
                relative_path,
                replacement_target,
                directory,
            });
        }
    }
    Ok(())
}

fn resolve_mention(
    source: &NoteRecord,
    target: &str,
    notes: &[NoteRecord],
    by_title: &HashMap<String, Vec<usize>>,
) -> LinkResolution {
    let normalized = normalize_target(target);
    let target_title = normalized
        .rsplit('/')
        .next()
        .unwrap_or(&normalized)
        .to_lowercase();
    let title_matches = by_title.get(&target_title).cloned().unwrap_or_default();
    if title_matches.is_empty() {
        let candidates = fuzzy_candidates(&target_title, notes);
        let recommended = recommended_candidate(&candidates);
        return LinkResolution::Broken(candidates, recommended);
    }

    if normalized.contains('/') {
        let source_relative = Path::new(&source.directory)
            .join(&normalized)
            .to_string_lossy()
            .replace('\\', "/");
        let exact: Vec<_> = title_matches
            .iter()
            .filter(|index| {
                notes[**index]
                    .replacement_target
                    .eq_ignore_ascii_case(&normalized)
                    || notes[**index]
                        .replacement_target
                        .eq_ignore_ascii_case(&source_relative)
            })
            .collect();
        if exact.len() == 1 {
            return LinkResolution::Resolved(notes[*exact[0]].path.clone());
        }
    }

    if title_matches.len() == 1 {
        return LinkResolution::Resolved(notes[title_matches[0]].path.clone());
    }
    let same_directory: Vec<_> = title_matches
        .iter()
        .filter(|index| {
            notes[**index]
                .directory
                .eq_ignore_ascii_case(&source.directory)
        })
        .collect();
    if same_directory.len() == 1 {
        return LinkResolution::Resolved(notes[*same_directory[0]].path.clone());
    }
    LinkResolution::Ambiguous(
        title_matches
            .into_iter()
            .map(|index| candidate_from(&notes[index], 1.0))
            .collect(),
    )
}

fn normalize_target(target: &str) -> String {
    target
        .trim()
        .replace('\\', "/")
        .trim_end_matches(".md")
        .trim_start_matches("./")
        .to_string()
}

fn fuzzy_candidates(target_title: &str, notes: &[NoteRecord]) -> Vec<GraphHealthCandidate> {
    let mut candidates: Vec<_> = notes
        .iter()
        .filter_map(|note| {
            let candidate = note.title.to_lowercase();
            let maximum = target_title.chars().count().max(candidate.chars().count());
            if maximum == 0 {
                return None;
            }
            let confidence = 1.0 - levenshtein(target_title, &candidate) as f64 / maximum as f64;
            (confidence >= 0.45).then(|| candidate_from(note, confidence))
        })
        .collect();
    candidates.sort_by(|left, right| {
        right
            .confidence
            .total_cmp(&left.confidence)
            .then(left.relative_path.cmp(&right.relative_path))
    });
    candidates.truncate(3);
    candidates
}

fn recommended_candidate(candidates: &[GraphHealthCandidate]) -> Option<GraphHealthCandidate> {
    let first = candidates.first()?;
    let gap = first.confidence
        - candidates
            .get(1)
            .map(|value| value.confidence)
            .unwrap_or(0.0);
    (first.confidence >= 0.72 && gap >= 0.12).then(|| first.clone())
}

fn candidate_from(note: &NoteRecord, confidence: f64) -> GraphHealthCandidate {
    GraphHealthCandidate {
        title: note.title.clone(),
        path: note.path.to_string_lossy().into_owned(),
        relative_path: note.relative_path.clone(),
        replacement_target: note.replacement_target.clone(),
        confidence,
    }
}

fn issue_from(
    kind: &str,
    note: &NoteRecord,
    mention: WikilinkMention,
    candidates: Vec<GraphHealthCandidate>,
    recommended_candidate: Option<GraphHealthCandidate>,
) -> GraphLinkIssue {
    let id_source = format!("{}:{}:{}", note.relative_path, mention.line, mention.syntax);
    GraphLinkIssue {
        id: format!("{:x}", md5::compute(id_source.as_bytes())),
        kind: kind.into(),
        source_path: note.path.to_string_lossy().into_owned(),
        source_title: note.title.clone(),
        target_text: mention.target,
        syntax: mention.syntax,
        context: mention.context,
        line: mention.line,
        relation_type: mention.relation_type,
        candidates,
        recommended_candidate,
    }
}

fn levenshtein(left: &str, right: &str) -> usize {
    let right_chars: Vec<char> = right.chars().collect();
    let mut costs: Vec<usize> = (0..=right_chars.len()).collect();
    for (left_index, left_char) in left.chars().enumerate() {
        let mut previous = costs[0];
        costs[0] = left_index + 1;
        for (right_index, right_char) in right_chars.iter().enumerate() {
            let old = costs[right_index + 1];
            costs[right_index + 1] = if left_char == *right_char {
                previous
            } else {
                1 + previous.min(costs[right_index]).min(old)
            };
            previous = old;
        }
    }
    costs[right_chars.len()]
}

#[tauri::command]
pub async fn repair_graph_links(
    library_root: String,
    repairs: Vec<GraphLinkRepair>,
) -> Result<GraphRepairResult, String> {
    if repairs.is_empty() {
        return Ok(GraphRepairResult {
            repaired_links: 0,
            changed_files: 0,
        });
    }
    if repairs.len() > 100 {
        return Err("单次最多修复 100 条链接".into());
    }
    let guard = WorkspaceGuard::new(&library_root)?;
    let mut changes: HashMap<PathBuf, (String, usize)> = HashMap::new();

    for repair in repairs {
        if repair.line == 0 || repair.expected_syntax.len() > 500 {
            return Err("修复请求的行号或链接语法无效".into());
        }
        let source = guard.resolve_existing_file(&repair.source_path, &["md"])?;
        let target = guard.resolve_existing_file(&repair.target_path, &["md"])?;
        let replacement_target = target
            .strip_prefix(guard.root())
            .map_err(|_| "修复目标超出知识库范围")?
            .with_extension("")
            .to_string_lossy()
            .replace('\\', "/");
        if !changes.contains_key(&source) {
            let content = fs::read_to_string(&source)
                .map_err(|error| format!("读取待修复笔记失败: {error}"))?;
            changes.insert(source.clone(), (content, 0));
        }
        let entry = changes
            .get_mut(&source)
            .ok_or("无法创建待修复文件的内存副本")?;
        entry.0 = replace_at_line(
            &entry.0,
            repair.line,
            &repair.expected_syntax,
            &replacement_target,
        )?;
        entry.1 += 1;
    }

    let repaired_links = changes.values().map(|(_, count)| *count).sum();
    let changed_files = changes.len();
    for (path, (content, _)) in changes {
        write_utf8(path, &content)?;
    }
    Ok(GraphRepairResult {
        repaired_links,
        changed_files,
    })
}

const EDITABLE_RELATION_TYPES: &[&str] = &[
    "parent",
    "child",
    "depends-on",
    "related",
    "contains",
    "cites",
    "derived-from",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRelationMutation {
    source_path: String,
    target_path: String,
    relation_type: String,
    action: String,
    expected_signature: String,
    expected_line: Option<usize>,
    expected_syntax: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRelationMutationResult {
    content_signature: String,
}

#[tauri::command]
pub async fn update_graph_relation(
    library_root: String,
    mutation: GraphRelationMutation,
) -> Result<GraphRelationMutationResult, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let source = guard.resolve_existing_file(&mutation.source_path, &["md"])?;
    let target = guard.resolve_existing_file(&mutation.target_path, &["md"])?;
    if source == target {
        return Err("不能创建指向自身的图谱关系".into());
    }
    let relation_type = normalize_relation_type(&mutation.relation_type)
        .filter(|value| EDITABLE_RELATION_TYPES.contains(&value.as_str()))
        .ok_or("不支持的图谱关系类型")?;
    if mutation.expected_signature.len() != 32
        || !mutation
            .expected_signature
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("图谱关系写回签名无效，请刷新图谱后重试".into());
    }
    let target_reference = target
        .strip_prefix(guard.root())
        .map_err(|_| "关系目标超出知识库范围")?
        .with_extension("")
        .to_string_lossy()
        .replace('\\', "/");
    if target_reference.contains(['[', ']', '"', '\r', '\n']) {
        return Err("关系目标文件名无法安全写入 Wikilink".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(&source).map_err(|error| format!("读取关系源笔记失败: {error}"))?;
        let current_signature = format!("{:x}", md5::compute(&bytes));
        if !current_signature.eq_ignore_ascii_case(&mutation.expected_signature) {
            return Err("源笔记已被修改，请刷新图谱后再编辑关系".into());
        }
        let content = String::from_utf8(bytes).map_err(|_| "关系源笔记不是 UTF-8 文本")?;
        let updated = match mutation.action.as_str() {
            "add" => add_frontmatter_relation(&content, &relation_type, &target_reference)?,
            "remove" => remove_frontmatter_relation(
                &content,
                &relation_type,
                mutation.expected_line.ok_or("删除关系缺少原始行号")?,
                mutation
                    .expected_syntax
                    .as_deref()
                    .ok_or("删除关系缺少原始链接语法")?,
            )?,
            _ => return Err("不支持的图谱关系操作".into()),
        };
        write_utf8(&source, &updated)?;
        Ok(GraphRelationMutationResult {
            content_signature: format!("{:x}", md5::compute(updated.as_bytes())),
        })
    })
    .await
    .map_err(|error| format!("图谱关系写回任务失败: {error}"))?
}

fn split_markdown_lines(content: &str) -> (Vec<String>, &'static str, bool) {
    let newline = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let trailing_newline = content.ends_with('\n');
    let lines = content.lines().map(str::to_string).collect();
    (lines, newline, trailing_newline)
}

fn join_markdown_lines(lines: &[String], newline: &str, trailing_newline: bool) -> String {
    let mut result = lines.join(newline);
    if trailing_newline {
        result.push_str(newline);
    }
    result
}

fn add_frontmatter_relation(
    content: &str,
    relation_type: &str,
    target_reference: &str,
) -> Result<String, String> {
    let (mut lines, newline, trailing_newline) = split_markdown_lines(content);
    let syntax = format!("[[{target_reference}]]");
    if extract_wikilink_mentions(content)
        .iter()
        .any(|mention| mention.relation_type == relation_type && mention.target == target_reference)
    {
        return Err("该语义关系已经存在".into());
    }

    let frontmatter_end = if lines.first().is_some_and(|line| line.trim() == "---") {
        lines
            .iter()
            .enumerate()
            .skip(1)
            .find_map(|(index, line)| (line.trim() == "---").then_some(index))
            .ok_or("Markdown Frontmatter 未闭合，无法安全写入关系")?
    } else {
        lines.splice(
            0..0,
            [
                "---".to_string(),
                "relations:".to_string(),
                format!("  {relation_type}: \"{syntax}\""),
                "---".to_string(),
            ],
        );
        return Ok(join_markdown_lines(&lines, newline, trailing_newline));
    };

    let relations_index = lines[1..frontmatter_end]
        .iter()
        .position(|line| line == "relations:")
        .map(|index| index + 1);
    let Some(relations_index) = relations_index else {
        let has_unsupported_relations = lines[1..frontmatter_end].iter().any(|line| {
            if line.starts_with([' ', '\t']) {
                return false;
            }
            line.split_once(':')
                .is_some_and(|(key, _)| key.trim().trim_matches(['\'', '"']) == "relations")
        });
        if has_unsupported_relations {
            return Err("现有 relations Frontmatter 结构无法安全编辑，请先转换为块映射".into());
        }
        lines.insert(frontmatter_end, "relations:".into());
        lines.insert(
            frontmatter_end + 1,
            format!("  {relation_type}: \"{syntax}\""),
        );
        return Ok(join_markdown_lines(&lines, newline, trailing_newline));
    };

    let block_end = ((relations_index + 1)..frontmatter_end)
        .find(|index| {
            let line = &lines[*index];
            !line.trim().is_empty() && !line.starts_with(' ') && !line.starts_with('\t')
        })
        .unwrap_or(frontmatter_end);
    let relation_line = ((relations_index + 1)..block_end).find(|index| {
        lines[*index]
            .trim()
            .split_once(':')
            .and_then(|(key, _)| normalize_relation_type(key))
            .is_some_and(|value| value == relation_type)
    });
    if let Some(index) = relation_line {
        let mut syntaxes: Vec<String> = extract_wikilink_mentions(content)
            .into_iter()
            .filter(|mention| mention.line == index + 1 && mention.relation_type == relation_type)
            .map(|mention| mention.syntax)
            .collect();
        syntaxes.push(syntax);
        lines[index] = format!("  {relation_type}: \"{}\"", syntaxes.join(" "));
    } else {
        lines.insert(block_end, format!("  {relation_type}: \"{syntax}\""));
    }
    Ok(join_markdown_lines(&lines, newline, trailing_newline))
}

fn remove_frontmatter_relation(
    content: &str,
    relation_type: &str,
    expected_line: usize,
    expected_syntax: &str,
) -> Result<String, String> {
    if expected_line == 0
        || expected_syntax.len() > 500
        || !expected_syntax.starts_with("[[")
        || !expected_syntax.ends_with("]]")
    {
        return Err("待删除关系的证据无效".into());
    }
    let (mut lines, newline, trailing_newline) = split_markdown_lines(content);
    let index = expected_line - 1;
    let line = lines.get(index).ok_or("关系位置已变化，请刷新图谱")?;
    let key_matches = line
        .trim()
        .split_once(':')
        .and_then(|(key, _)| normalize_relation_type(key))
        .is_some_and(|value| value == relation_type);
    if !key_matches || !line.contains(expected_syntax) {
        return Err("关系内容已被修改，请刷新图谱后重试".into());
    }
    lines[index] = line.replacen(expected_syntax, "", 1);
    let value_empty = lines[index].split_once(':').is_some_and(|(_, value)| {
        value
            .trim()
            .trim_matches(|character: char| matches!(character, '"' | '\''))
            .trim()
            .is_empty()
    });
    if value_empty {
        lines.remove(index);
    } else {
        lines[index] = lines[index].trim_end().to_string();
    }
    Ok(join_markdown_lines(&lines, newline, trailing_newline))
}

fn replace_at_line(
    content: &str,
    line_number: usize,
    expected_syntax: &str,
    replacement_target: &str,
) -> Result<String, String> {
    let mut lines: Vec<String> = content.split_inclusive('\n').map(str::to_string).collect();
    if !content.is_empty() && lines.is_empty() {
        lines.push(content.to_string());
    }
    let line = lines
        .get_mut(line_number - 1)
        .ok_or("修复位置已变化，请重新扫描")?;
    if !line.contains(expected_syntax) {
        return Err("链接内容已被修改，请重新扫描后再修复".into());
    }
    let alias = expected_syntax
        .strip_prefix("[[")
        .and_then(|value| value.strip_suffix("]]"))
        .and_then(|value| value.split_once('|').map(|(_, alias)| alias.trim()))
        .filter(|value| !value.is_empty());
    let replacement = alias
        .map(|value| format!("[[{}|{}]]", replacement_target, value))
        .unwrap_or_else(|| format!("[[{}]]", replacement_target));
    *line = line.replacen(expected_syntax, &replacement, 1);
    Ok(lines.concat())
}

#[derive(Serialize, Clone)]
pub struct Backlink {
    title: String,
    path: String,
    context: String,
}

#[tauri::command]
pub async fn extract_wikilinks(content: String) -> Result<Vec<String>, String> {
    Ok(extract_wikilink_mentions(&content)
        .into_iter()
        .map(|mention| mention.target)
        .collect())
}

#[tauri::command]
pub async fn find_backlinks(
    file_path: String,
    library_root: String,
) -> Result<Vec<Backlink>, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let target = guard.resolve_existing_file(file_path, &["md"])?;
    let target_stem = target
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let mut results = Vec::new();
    find_backlinks_recursive(guard.root(), &target_stem, &mut results);
    Ok(results)
}

fn find_backlinks_recursive(dir: &Path, target: &str, results: &mut Vec<Backlink>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            find_backlinks_recursive(&path, target, results);
        } else if name.ends_with(".md") {
            let Some(mention) = fs::read_to_string(&path).ok().and_then(|content| {
                extract_wikilink_mentions(&content)
                    .into_iter()
                    .find(|mention| wikilink_matches_stem(&mention.target, target))
            }) else {
                continue;
            };
            results.push(Backlink {
                title: name.trim_end_matches(".md").to_string(),
                path: path.to_string_lossy().into_owned(),
                context: mention.context,
            });
        }
    }
}

fn wikilink_matches_stem(link: &str, target_stem: &str) -> bool {
    let normalized = link.replace('\\', "/");
    let file_name = normalized.rsplit('/').next().unwrap_or(&normalized);
    file_name
        .strip_suffix(".md")
        .unwrap_or(file_name)
        .eq_ignore_ascii_case(target_stem)
}

#[derive(Serialize)]
pub struct LibraryStats {
    file_count: usize,
    total_chars: usize,
    total_words: usize,
}

#[tauri::command]
pub async fn get_library_stats(path: String) -> Result<LibraryStats, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Ok(LibraryStats {
            file_count: 0,
            total_chars: 0,
            total_words: 0,
        });
    }
    let mut stats = LibraryStats {
        file_count: 0,
        total_chars: 0,
        total_words: 0,
    };
    count_stats(root, &mut stats);
    Ok(stats)
}

fn count_stats(dir: &Path, stats: &mut LibraryStats) {
    count_stats_impl(dir, stats, &mut HashSet::new())
}

fn count_stats_impl(dir: &Path, stats: &mut LibraryStats, visited: &mut HashSet<PathBuf>) {
    let canonical = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    if !visited.insert(canonical) {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            count_stats_impl(&path, stats, visited);
        } else if name.ends_with(".md") {
            stats.file_count += 1;
            if let Ok(content) = fs::read_to_string(path) {
                stats.total_chars += content.chars().count();
                stats.total_words += content.split_whitespace().count();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-graph-health-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("workspace");
        fs::create_dir_all(&root).unwrap();
        (base, root)
    }

    #[test]
    fn detects_broken_ambiguous_and_orphan_notes() {
        let (base, root) = fixture("analysis");
        fs::create_dir_all(root.join("one")).unwrap();
        fs::create_dir_all(root.join("two")).unwrap();
        fs::write(root.join("Source.md"), "[[Missing]]\n[[Dup]]").unwrap();
        fs::write(root.join("one/Dup.md"), "duplicate one").unwrap();
        fs::write(root.join("two/Dup.md"), "duplicate two").unwrap();
        fs::write(root.join("Orphan.md"), "standalone").unwrap();

        let report = analyze_workspace(&root).unwrap();
        assert_eq!(report.broken_links.len(), 1);
        assert_eq!(report.ambiguous_links.len(), 1);
        assert_eq!(report.ambiguous_links[0].candidates.len(), 2);
        assert!(report
            .orphan_notes
            .iter()
            .any(|note| note.title == "Orphan"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn post_v115_m0_graph_baseline_builds_real_markdown_tiers() {
        let fixed_workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("fixtures")
            .join("post-v115-m0")
            .join("workspace")
            .canonicalize()
            .unwrap();
        let health = analyze_workspace(&fixed_workspace).unwrap();
        assert_eq!(health.broken_links.len(), 1);
        assert_eq!(health.ambiguous_links.len(), 1);

        let tiers = [100usize, 1_000, 5_000];
        let mut results = Vec::new();
        for node_count in tiers {
            let (base, root) = fixture(&format!("m0-tier-{node_count}"));
            for index in 0..node_count {
                let name = format!("Node-{index:05}");
                let body = if index + 1 < node_count {
                    format!("# {name}\n\n[[Node-{:05}]]\n", index + 1)
                } else {
                    format!("# {name}\n")
                };
                fs::write(root.join(format!("{name}.md")), body).unwrap();
            }
            let started = std::time::Instant::now();
            let graph = tauri::async_runtime::block_on(build_link_graph(
                root.to_string_lossy().into_owned(),
            ))
            .unwrap();
            let duration_ms = started.elapsed().as_millis();
            assert_eq!(graph.nodes.len(), node_count);
            assert_eq!(graph.edges.len(), node_count - 1);
            results.push(serde_json::json!({
                "tier": node_count,
                "expectedNodes": node_count,
                "actualNodes": graph.nodes.len(),
                "expectedEdges": node_count - 1,
                "actualEdges": graph.edges.len(),
                "durationMs": duration_ms,
                "passed": true
            }));
            fs::remove_dir_all(base).unwrap();
        }

        if let Some(output) = std::env::var_os("LONGEDIT_M0_GRAPH_EVIDENCE") {
            let output = PathBuf::from(output);
            fs::create_dir_all(output.parent().unwrap()).unwrap();
            let evidence = serde_json::json!({
                "schemaVersion": 1,
                "stage": "M0-graph-baseline",
                "fixture": "generated real Markdown files with directed wikilink chains",
                "expectedTiers": tiers,
                "fixedWorkspace": {
                    "expectedBrokenLinks": 1,
                    "actualBrokenLinks": health.broken_links.len(),
                    "expectedAmbiguousLinks": 1,
                    "actualAmbiguousLinks": health.ambiguous_links.len()
                },
                "actual": results,
                "sourceUserContentIncluded": false,
                "passed": true
            });
            fs::write(
                output,
                format!("{}\n", serde_json::to_string_pretty(&evidence).unwrap()),
            )
            .unwrap();
        }
    }

    #[test]
    fn cancelled_graph_build_stops_before_publishing_results() {
        let (base, root) = fixture("cancelled-build");
        fs::write(root.join("Note.md"), "# Note\n").unwrap();
        let cancelled = Arc::new(AtomicBool::new(true));

        let result = tauri::async_runtime::block_on(build_link_graph_cancellable(
            root.to_string_lossy().into_owned(),
            cancelled,
        ));

        assert!(matches!(result, Err(error) if error == "knowledge-index-cancelled"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn repairs_link_safely_and_preserves_alias() {
        let (base, root) = fixture("repair");
        let source = root.join("Source.md");
        let target = root.join("Target.md");
        fs::write(&source, "中文上下文 [[Targt|目标笔记]]\n").unwrap();
        fs::write(&target, "target").unwrap();
        let result = tauri::async_runtime::block_on(repair_graph_links(
            root.to_string_lossy().into_owned(),
            vec![GraphLinkRepair {
                source_path: source.to_string_lossy().into_owned(),
                target_path: target.to_string_lossy().into_owned(),
                line: 1,
                expected_syntax: "[[Targt|目标笔记]]".into(),
            }],
        ))
        .unwrap();
        assert_eq!(result.repaired_links, 1);
        assert_eq!(
            fs::read_to_string(&source).unwrap(),
            "中文上下文 [[Target|目标笔记]]\n"
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn repair_rejects_outside_target_and_stale_syntax() {
        let (base, root) = fixture("guard");
        let source = root.join("Source.md");
        let outside = base.join("Outside.md");
        fs::write(&source, "[[Missing]]").unwrap();
        fs::write(&outside, "outside").unwrap();
        let outside_result = tauri::async_runtime::block_on(repair_graph_links(
            root.to_string_lossy().into_owned(),
            vec![GraphLinkRepair {
                source_path: source.to_string_lossy().into_owned(),
                target_path: outside.to_string_lossy().into_owned(),
                line: 1,
                expected_syntax: "[[Missing]]".into(),
            }],
        ));
        assert!(outside_result.is_err());
        assert!(replace_at_line("[[Changed]]", 1, "[[Missing]]", "Target").is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn graph_relation_editor_adds_removes_and_preserves_markdown() {
        let original = "---\r\ntype: project\r\n---\r\n# 项目\r\n正文\r\n";
        let added = add_frontmatter_relation(original, "depends-on", "docs/Target").unwrap();
        assert!(added.contains("relations:\r\n  depends-on: \"[[docs/Target]]\""));
        assert!(added.ends_with("# 项目\r\n正文\r\n"));
        let with_second = add_frontmatter_relation(&added, "depends-on", "docs/Other").unwrap();
        assert!(with_second.contains("depends-on: \"[[docs/Target]] [[docs/Other]]\""));
        let mention = extract_wikilink_mentions(&added)
            .into_iter()
            .find(|item| item.relation_type == "depends-on")
            .unwrap();
        let removed =
            remove_frontmatter_relation(&added, "depends-on", mention.line, &mention.syntax)
                .unwrap();
        assert!(!removed.contains("depends-on:"));
        assert!(removed.contains("type: project"));
        assert!(add_frontmatter_relation(&added, "depends-on", "docs/Target").is_err());
    }

    #[test]
    fn graph_relation_editor_rejects_unsupported_frontmatter() {
        let inline = "---\nrelations: { related: '[[Existing]]' }\ntype: note\n---\nBody\n";
        assert!(add_frontmatter_relation(inline, "related", "Target").is_err());
    }

    #[test]
    fn graph_relation_command_rejects_stale_signature_and_outside_target() {
        let (base, root) = fixture("relation-edit");
        let source = root.join("Source.md");
        let target = root.join("Target.md");
        let outside = base.join("Outside.md");
        fs::write(&source, "# Source\n").unwrap();
        fs::write(&target, "# Target\n").unwrap();
        fs::write(&outside, "# Outside\n").unwrap();
        let stale = tauri::async_runtime::block_on(update_graph_relation(
            root.to_string_lossy().into_owned(),
            GraphRelationMutation {
                source_path: source.to_string_lossy().into_owned(),
                target_path: target.to_string_lossy().into_owned(),
                relation_type: "related".into(),
                action: "add".into(),
                expected_signature: "00000000000000000000000000000000".into(),
                expected_line: None,
                expected_syntax: None,
            },
        ));
        assert!(stale.is_err());
        let outside_result = tauri::async_runtime::block_on(update_graph_relation(
            root.to_string_lossy().into_owned(),
            GraphRelationMutation {
                source_path: source.to_string_lossy().into_owned(),
                target_path: outside.to_string_lossy().into_owned(),
                relation_type: "related".into(),
                action: "add".into(),
                expected_signature: format!("{:x}", md5::compute(b"# Source\n")),
                expected_line: None,
                expected_syntax: None,
            },
        ));
        assert!(outside_result.is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn backlink_matching_handles_paths_extensions_and_case() {
        assert!(wikilink_matches_stem("folder/Target.md", "target"));
        assert!(wikilink_matches_stem("folder\\Target", "TARGET"));
        assert!(!wikilink_matches_stem("Target copy", "Target"));
    }

    #[test]
    fn library_stats_ignore_hidden_workspaces_and_non_markdown_files() {
        let (base, root) = fixture("stats");
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::write(root.join("One.md"), "one two").unwrap();
        fs::write(root.join("data.csv"), "one,two").unwrap();
        fs::write(root.join(".hidden/Secret.md"), "hidden words").unwrap();
        let mut stats = LibraryStats {
            file_count: 0,
            total_chars: 0,
            total_words: 0,
        };
        count_stats(&root, &mut stats);
        assert_eq!(stats.file_count, 1);
        assert_eq!(stats.total_words, 2);
        fs::remove_dir_all(base).unwrap();
    }

    fn graph_node(id: &str) -> GraphNode {
        GraphNode::test_node(id)
    }

    #[test]
    fn local_graph_respects_requested_depth_and_unknown_centers() {
        let graph = GraphData {
            nodes: vec![
                graph_node("a"),
                graph_node("b"),
                graph_node("c"),
                graph_node("d"),
            ],
            edges: vec![
                GraphEdge::test_edge("a", "b"),
                GraphEdge::test_edge("b", "c"),
                GraphEdge::test_edge("c", "d"),
            ],
        };
        let one_hop = filter_graph_by_depth(graph.clone(), "a", 1);
        assert_eq!(one_hop.nodes.len(), 2);
        assert_eq!(one_hop.edges.len(), 1);
        let two_hops = filter_graph_by_depth(graph.clone(), "a", 2);
        assert_eq!(two_hops.nodes.len(), 3);
        assert_eq!(two_hops.edges.len(), 2);
        let missing = filter_graph_by_depth(graph, "missing", 2);
        assert!(missing.nodes.is_empty());
        assert!(missing.edges.is_empty());
    }

    #[test]
    fn local_graph_center_supports_graph_canvas_file_types_only() {
        let (base, root) = fixture("local-graph-centers");
        for name in [
            "Center.md",
            "Center.pdf",
            "Center.csv",
            "Center.tsv",
            "Center.table.json",
        ] {
            fs::write(
                root.join(name),
                if name.ends_with(".table.json") {
                    "{}"
                } else {
                    "fixture"
                },
            )
            .unwrap();
        }
        fs::write(root.join("Other.json"), "{}").unwrap();
        fs::write(root.join("Outline.opml"), "<opml version=\"2.0\"/>").unwrap();
        let guard = WorkspaceGuard::new(&root).unwrap();

        for name in [
            "Center.md",
            "Center.pdf",
            "Center.csv",
            "Center.tsv",
            "Center.table.json",
        ] {
            assert!(
                resolve_local_graph_center(&guard, &root.join(name).to_string_lossy()).is_ok(),
                "{name}"
            );
        }
        assert_eq!(
            resolve_local_graph_center(&guard, &root.join("Other.json").to_string_lossy())
                .unwrap_err(),
            "仅支持开放 Table JSON 作为表格中心对象"
        );
        assert!(
            resolve_local_graph_center(&guard, &root.join("Outline.opml").to_string_lossy())
                .is_err()
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn repeated_relations_merge_without_losing_evidence() {
        let mentions = extract_wikilink_mentions("第一处 [[目标]]\n第二处 [[目标|别名]]");
        let merged = merge_graph_edges(vec![
            GraphEdge::wikilink("source".into(), "target".into(), mentions[0].clone()),
            GraphEdge::wikilink("source".into(), "target".into(), mentions[1].clone()),
        ]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].mentions.len(), 2);
        assert_eq!(merged[0].mentions[1].alias.as_deref(), Some("别名"));
        let value = serde_json::to_value(&merged[0]).unwrap();
        assert_eq!(value["relationType"], "links-to");
        assert_eq!(value["mentions"][0]["line"], 1);
    }

    #[test]
    fn relation_summary_distinguishes_direction_types_and_isolation() {
        let graph = GraphData {
            nodes: vec![
                graph_node("source"),
                graph_node("target"),
                graph_node("peer"),
                graph_node("isolated"),
            ],
            edges: vec![
                GraphEdge::test_edge("source", "target"),
                GraphEdge {
                    source: "source".into(),
                    target: "peer".into(),
                    relation_type: "related".into(),
                    directed: false,
                    mentions: Vec::new(),
                },
            ],
        };
        let paths = vec![
            "source".to_string(),
            "target".to_string(),
            "isolated".to_string(),
        ];
        let summaries = relation_summaries(&graph, &paths);
        let source = summaries.iter().find(|item| item.path == "source").unwrap();
        assert_eq!(source.relation_count, 2);
        assert_eq!(source.outgoing_count, 1);
        assert_eq!(source.incoming_count, 0);
        assert_eq!(source.related_count, 1);
        assert_eq!(source.relation_types, vec!["links-to", "related"]);
        assert!(!source.isolated);

        let target = summaries.iter().find(|item| item.path == "target").unwrap();
        assert_eq!(target.relation_count, 1);
        assert_eq!(target.incoming_count, 1);
        assert_eq!(target.outgoing_count, 0);

        let isolated = summaries
            .iter()
            .find(|item| item.path == "isolated")
            .unwrap();
        assert_eq!(isolated.relation_count, 0);
        assert!(isolated.isolated);
    }

    #[test]
    fn relation_summary_only_returns_requested_graph_nodes() {
        let graph = GraphData {
            nodes: vec![graph_node("one"), graph_node("two")],
            edges: vec![GraphEdge::test_edge("one", "two")],
        };
        let summaries = relation_summaries(&graph, &["two".to_string(), "outside".to_string()]);
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].path, "two");
    }

    #[test]
    fn knowledge_graph_pulse_exposes_coverage_relation_types_and_top_nodes() {
        let graph = GraphData {
            nodes: vec![
                graph_node("alpha"),
                graph_node("beta"),
                graph_node("gamma"),
                graph_node("isolated"),
            ],
            edges: vec![
                GraphEdge::test_edge("alpha", "beta"),
                GraphEdge::test_edge("alpha", "gamma"),
                GraphEdge {
                    source: "beta".into(),
                    target: "gamma".into(),
                    relation_type: "related".into(),
                    directed: false,
                    mentions: Vec::new(),
                },
            ],
        };
        let pulse = knowledge_graph_pulse(&graph);
        assert_eq!(pulse.object_count, 4);
        assert_eq!(pulse.relation_count, 3);
        assert_eq!(pulse.connected_object_count, 3);
        assert_eq!(pulse.isolated_object_count, 1);
        assert_eq!(pulse.coverage_percent, 75);
        assert_eq!(pulse.relation_types.len(), 2);
        assert_eq!(pulse.relation_types[0].relation_type, "links-to");
        assert_eq!(pulse.relation_types[0].count, 2);
        assert_eq!(pulse.top_nodes[0].id, "alpha");
        assert_eq!(pulse.top_nodes[0].relation_count, 2);
        assert_eq!(pulse.isolated_nodes.len(), 1);
        assert_eq!(pulse.isolated_nodes[0].id, "isolated");
        assert_eq!(pulse.isolated_nodes[0].relation_count, 0);
        assert_eq!(pulse.guidance.len(), 2);
        assert_eq!(pulse.guidance[0].code, "connect-isolated-objects");
        assert_eq!(pulse.guidance[0].current_value, 1);
        assert_eq!(pulse.guidance[0].target_value, 0);
        assert_eq!(pulse.guidance[1].code, "diversify-relation-types");
    }

    #[test]
    fn knowledge_graph_pulse_bounds_and_orders_isolated_action_queue() {
        let graph = GraphData {
            nodes: [
                "zeta", "eta", "theta", "beta", "delta", "alpha", "gamma", "epsilon",
            ]
            .into_iter()
            .map(graph_node)
            .collect(),
            edges: Vec::new(),
        };
        let pulse = knowledge_graph_pulse(&graph);
        assert_eq!(pulse.isolated_nodes.len(), 6);
        assert_eq!(
            pulse
                .isolated_nodes
                .iter()
                .map(|node| node.id.as_str())
                .collect::<Vec<_>>(),
            vec!["alpha", "beta", "delta", "epsilon", "eta", "gamma"]
        );
        assert!(pulse
            .isolated_nodes
            .iter()
            .all(|node| node.relation_count == 0));
    }

    #[test]
    fn knowledge_graph_guidance_covers_empty_disconnected_and_healthy_networks() {
        let empty = knowledge_graph_guidance(0, 0, 0, 0, 0);
        assert_eq!(empty[0].code, "add-first-knowledge-object");

        let disconnected = knowledge_graph_guidance(4, 0, 4, 0, 0);
        assert_eq!(
            disconnected
                .iter()
                .map(|item| item.code.as_str())
                .collect::<Vec<_>>(),
            vec!["create-first-relation"]
        );

        let low_coverage = knowledge_graph_guidance(10, 2, 6, 40, 3);
        assert_eq!(low_coverage[0].code, "increase-relation-coverage");
        assert_eq!(low_coverage[0].target_value, 70);

        let healthy = knowledge_graph_guidance(10, 12, 0, 100, 4);
        assert_eq!(healthy[0].code, "network-health-on-track");
        assert_eq!(healthy[0].priority, "healthy");
    }

    #[test]
    fn relation_context_explains_fact_structure_and_planning_relations() {
        let mut source = graph_node("source");
        let target = graph_node("target");
        let mut opml = graph_node("outline");
        opml.object_type = "opml".into();
        let mut topic = graph_node("topic");
        topic.path = "outline".into();
        topic.object_type = "opml_node".into();
        topic.parent_id = Some("outline".into());
        let mention = extract_wikilink_mentions("Evidence: [[target]]").remove(0);
        source.search_text = "Evidence".into();
        let graph = GraphData {
            nodes: vec![source, target, opml, topic],
            edges: vec![
                GraphEdge::wikilink("source".into(), "target".into(), mention),
                GraphEdge::structural("outline".into(), "topic".into(), "contains"),
            ],
        };
        let source_context = relation_context(&graph, "source", "Source.md");
        assert!(source_context.indexed);
        assert_eq!(source_context.path, "Source.md");
        assert_eq!(source_context.relations[0].relation_class, "fact");
        assert_eq!(source_context.relations[0].direction, "outgoing");
        assert_eq!(source_context.relations[0].evidence[0].line, 1);

        let outline_context = relation_context(&graph, "outline", "Outline.opml");
        assert_eq!(outline_context.relations[0].relation_class, "planning");
        assert_eq!(outline_context.relations[0].direction, "internal");
    }

    #[test]
    fn relation_context_returns_safe_unindexed_state_for_managed_formats() {
        let context = relation_context(
            &GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
            "Config.json",
            "Config.json",
        );
        assert!(!context.indexed);
        assert!(context.node.is_none());
        assert!(context.relations.is_empty());
        assert!(!context.truncated);
    }

    #[test]
    fn relation_context_adds_case_insensitive_shared_tag_peers() {
        let mut source = graph_node("source");
        source.tags = vec!["Research".into(), "图谱".into()];
        let mut peer = graph_node("peer");
        peer.tags = vec!["research".into()];
        let unrelated = graph_node("unrelated");
        let context = relation_context(
            &GraphData {
                nodes: vec![source, peer, unrelated],
                edges: Vec::new(),
            },
            "source",
            "Source.md",
        );
        assert_eq!(context.relations.len(), 1);
        assert_eq!(context.relations[0].relation_type, "shares-tag");
        assert_eq!(context.relations[0].relation_class, "semantic");
        assert_eq!(context.relations[0].decision_status, "inferred");
        assert_eq!(context.relations[0].target.id, "peer");
        assert_eq!(context.relations[0].evidence[0].syntax, "#Research");
        assert!(context.hidden_relations.is_empty());
    }

    #[test]
    fn shared_tag_relation_decisions_confirm_hide_and_restore() {
        let (base, root) = fixture("relation-decisions");
        let source = root.join("Source.md");
        let target = root.join("Target.md");
        fs::write(&source, "# Source\n\n#Research\n").unwrap();
        fs::write(&target, "# Target\n\n#research\n").unwrap();
        let root_text = root.to_string_lossy().into_owned();
        let source_text = source.to_string_lossy().into_owned();
        let target_text = target.to_string_lossy().into_owned();

        tauri::async_runtime::block_on(update_graph_relation_decision(
            root_text.clone(),
            source_text.clone(),
            target_text.clone(),
            "shares-tag".into(),
            "confirmed".into(),
        ))
        .unwrap();
        let confirmed = tauri::async_runtime::block_on(get_graph_relation_context(
            root_text.clone(),
            source_text.clone(),
            None,
            None,
            None,
        ))
        .unwrap();
        assert_eq!(confirmed.relations.len(), 1);
        assert_eq!(confirmed.relations[0].decision_status, "confirmed");
        assert!(confirmed.hidden_relations.is_empty());
        let confirmed_graph =
            tauri::async_runtime::block_on(build_link_graph(root_text.clone())).unwrap();
        assert!(confirmed_graph
            .edges
            .iter()
            .any(|edge| edge.relation_type == "shares-tag" && !edge.directed));
        let confirmed_health =
            tauri::async_runtime::block_on(analyze_graph_health(root_text.clone())).unwrap();
        assert!(confirmed_health.orphan_notes.is_empty());

        tauri::async_runtime::block_on(update_graph_relation_decision(
            root_text.clone(),
            source_text.clone(),
            target_text.clone(),
            "shares-tag".into(),
            "hidden".into(),
        ))
        .unwrap();
        let hidden = tauri::async_runtime::block_on(get_graph_relation_context(
            root_text.clone(),
            source_text.clone(),
            None,
            None,
            None,
        ))
        .unwrap();
        assert!(hidden.relations.is_empty());
        assert_eq!(hidden.hidden_relations.len(), 1);
        assert_eq!(hidden.hidden_relations[0].decision_status, "hidden");
        let hidden_graph =
            tauri::async_runtime::block_on(build_link_graph(root_text.clone())).unwrap();
        assert!(!hidden_graph
            .edges
            .iter()
            .any(|edge| edge.relation_type == "shares-tag"));
        let hidden_health =
            tauri::async_runtime::block_on(analyze_graph_health(root_text.clone())).unwrap();
        assert_eq!(hidden_health.orphan_notes.len(), 2);

        tauri::async_runtime::block_on(update_graph_relation_decision(
            root_text.clone(),
            source_text.clone(),
            target_text,
            "shares-tag".into(),
            "inferred".into(),
        ))
        .unwrap();
        let restored = tauri::async_runtime::block_on(get_graph_relation_context(
            root_text,
            source_text,
            None,
            None,
            None,
        ))
        .unwrap();
        assert_eq!(restored.relations[0].decision_status, "inferred");
        assert!(read_graph_relation_decision_file(&root)
            .unwrap()
            .decisions
            .is_empty());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn relation_summary_command_normalizes_workspace_paths_and_preserves_requested_identity() {
        let (base, root) = fixture("relation-summary-command");
        let source = root.join("Source.md");
        let target = root.join("Target.md");
        fs::write(&source, "# Source\n\n[[Target]]\n").unwrap();
        fs::write(&target, "# Target\n").unwrap();
        let summaries = tauri::async_runtime::block_on(summarize_graph_relations(
            root.to_string_lossy().into_owned(),
            vec![source.to_string_lossy().into_owned()],
        ))
        .unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].path, source.to_string_lossy());
        assert_eq!(summaries[0].relation_count, 1);
        assert_eq!(summaries[0].outgoing_count, 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn related_frontmatter_relation_is_undirected() {
        let mention =
            extract_wikilink_mentions("---\nrelations:\n  related: [[图谱交互设计]]\n---")
                .remove(0);
        let edge = GraphEdge::wikilink("source".into(), "target".into(), mention);
        assert_eq!(edge.relation_type, "related");
        assert!(!edge.directed);
    }

    #[test]
    fn graph_nodes_include_filter_metadata() {
        let (base, root) = fixture("metadata");
        let sub = root.join("research");
        fs::create_dir_all(&sub).unwrap();
        fs::write(root.join("Target.md"), "# Target").unwrap();
        fs::write(sub.join("Paper.pdf"), b"%PDF fixture without text").unwrap();
        fs::write(
            sub.join("Paper.pdf.annotations.json"),
            r#"{"schemaVersion":1,"source":{"pdfFile":"Paper.pdf","size":25,"modifiedAt":1},"annotations":[{"id":"a-1","kind":"comment","page":2,"color":"yellow","rects":[],"quote":"","comment":"Key evidence","createdAt":1,"updatedAt":1}]}"#,
        )
        .unwrap();
        fs::write(
            sub.join("Metrics.csv"),
            "metric,value\nKnowledge coverage,92\n",
        )
        .unwrap();
        fs::write(
            sub.join("Planning.table.json"),
            r#"{"schemaVersion":1,"kind":"longedit.table","data":{"columns":[{"id":"topic","name":"主题","type":"text"}],"rows":[{"id":"row-1","values":{"topic":"Roadmap"}}]},"views":[{"id":"grid","name":"表格","kind":"grid","config":{"filter":"","frozenColumns":1,"columnWidths":{"topic":160}}},{"id":"chart","name":"Roadmap chart","kind":"chart","config":{"categoryColumn":"topic"}},{"id":"dashboard","name":"Executive dashboard","kind":"dashboard","config":{"dashboardItems":[{"chartViewId":"chart","width":6}]}}],"activeView":"grid"}"#,
        )
        .unwrap();
        fs::write(
            sub.join("Workspace.canvas"),
            r#"{"nodes":[{"id":"idea","type":"text","text":"Roadmap idea","x":0,"y":0,"width":240,"height":120},{"id":"chart-ref","type":"file","file":"research/Planning.table.json","longeditViewId":"chart","x":320,"y":0,"width":240,"height":120}],"edges":[{"id":"edge-1","fromNode":"idea","toNode":"chart-ref","relationType":"supports"}]}"#,
        )
        .unwrap();
        fs::write(
            sub.join("Outline.opml"),
            r#"<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Research outline</title></head><body><outline text="Evidence" _longeditId="evidence"><outline text="Conclusion" _longeditId="conclusion"/></outline></body></opml>"#,
        )
        .unwrap();
        fs::write(
            sub.join("Topic.md"),
            "---\nrelations:\n  depends-on: [[Target]]\n---\n# Topic\n#研究 #图谱\n[来源](longedit://pdf?path=research%2FPaper.pdf&page=2&annotation=a-1)\n[旧批注](longedit://pdf?path=research%2FPaper.pdf&page=3&annotation=removed)",
        )
        .unwrap();
        let graph =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        let topic = graph
            .nodes
            .iter()
            .find(|node| node.title == "Topic")
            .unwrap();
        assert_eq!(topic.directory, "research");
        assert_eq!(topic.tags, vec!["图谱", "研究"]);
        assert!(topic.modified_at > 0);
        let pdf = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "pdf")
            .unwrap();
        let annotation = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "pdf_annotation")
            .unwrap();
        let table = graph
            .nodes
            .iter()
            .find(|node| node.title == "Planning")
            .unwrap();
        assert_eq!(table.search_text, "主题\nRoadmap");
        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.source == topic.id && edge.relation_type == "depends-on"));
        assert_eq!(annotation.parent_id.as_deref(), Some(pdf.id.as_str()));
        assert_eq!(annotation.locator.as_ref().unwrap().object_id, "a-1");
        assert!(graph.edges.iter().any(|edge| edge.source == topic.id
            && edge.target == annotation.id
            && edge.relation_type == "annotates"));
        assert!(graph.edges.iter().any(|edge| edge.source == topic.id
            && edge.target == pdf.id
            && edge.relation_type == "annotates"));
        let chart = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "table_view" && node.title == "Roadmap chart")
            .unwrap();
        let dashboard = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "table_view" && node.title == "Executive dashboard")
            .unwrap();
        let chart_reference = graph
            .nodes
            .iter()
            .find(|node| {
                node.object_type == "canvas_node" && node.title == "research/Planning.table.json"
            })
            .unwrap();
        assert!(graph.edges.iter().any(|edge| edge.source == dashboard.id
            && edge.target == chart.id
            && edge.relation_type == "embeds"));
        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.source == chart_reference.id
                && edge.target == chart.id
                && edge.relation_type == "embeds"));
        let evidence = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "opml_node" && node.title == "Evidence")
            .unwrap();
        let conclusion = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "opml_node" && node.title == "Conclusion")
            .unwrap();
        assert!(graph.edges.iter().any(|edge| edge.source == evidence.id
            && edge.target == conclusion.id
            && edge.relation_type == "contains"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn pptx_file_and_slides_are_stable_graph_and_index_objects() {
        let (base, root) = fixture("pptx-objects");
        let source =
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx");
        let path = root.join("Roadmap.pptx");
        fs::write(&path, source).unwrap();

        let graph =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        let document = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "pptx")
            .unwrap();
        let slides = graph
            .nodes
            .iter()
            .filter(|node| node.object_type == "pptx_slide")
            .collect::<Vec<_>>();
        assert_eq!(slides.len(), 3);
        assert!(document.search_text.contains("PowerPoint Producer Fixture"));
        assert!(slides.iter().all(|slide| {
            slide.parent_id.as_deref() == Some(document.id.as_str())
                && slide.locator.as_ref().is_some_and(|locator| {
                    locator.kind == "pptx-slide"
                        && locator.page.is_some()
                        && !locator.object_id.is_empty()
                })
                && slide
                    .location_label
                    .as_deref()
                    .is_some_and(|label| label.starts_with("幻灯片 "))
        }));
        assert_eq!(
            graph
                .edges
                .iter()
                .filter(|edge| {
                    edge.source == document.id
                        && edge.relation_type == "contains"
                        && slides.iter().any(|slide| slide.id == edge.target)
                })
                .count(),
            3
        );

        let first_locator = slides[0].locator.as_ref().unwrap();
        let focused = relation_context_for_locator(
            &graph,
            &document.path,
            &document.path,
            Some(&first_locator.kind),
            Some(&first_locator.object_id),
            first_locator.page,
            &GraphRelationDecisionMap::new(),
        );
        assert_eq!(focused.node.as_ref().unwrap().id, slides[0].id);
        assert_eq!(focused.relations.len(), 1);
        assert_eq!(focused.relations[0].relation_type, "contains");
        assert_eq!(focused.relations[0].direction, "incoming");

        let snapshot = crate::services::knowledge_index::snapshot_from_graph(&root, graph.clone());
        for node in std::iter::once(document).chain(slides.iter().copied()) {
            assert!(snapshot.objects.iter().any(|object| {
                object.id == node.id
                    && object.object_type == node.object_type
                    && object.locator_object_id
                        == node
                            .locator
                            .as_ref()
                            .map(|locator| locator.object_id.clone())
            }));
        }
        assert_eq!(
            snapshot
                .relations
                .iter()
                .filter(|relation| {
                    relation.source == document.id && relation.relation_type == "contains"
                })
                .count(),
            3
        );
        assert_eq!(fs::read(&path).unwrap(), source);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn workbook_sheets_and_odp_slides_are_stable_graph_and_index_objects() {
        let (base, root) = fixture("m4a3-workbook-odp-objects");
        let workbook_source =
            include_bytes!("../../tests/fixtures/workbook/compatibility-baseline.xlsx");
        let odp_source =
            include_bytes!("../../tests/fixtures/odf-content/longedit-e1c-presentation.odp");
        let workbook_path = root.join("Planning.xlsx");
        let odp_path = root.join("Review.odp");
        fs::write(&workbook_path, workbook_source).unwrap();
        fs::write(&odp_path, odp_source).unwrap();

        let graph =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        let workbook = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "workbook")
            .unwrap();
        let workbook_sheets = graph
            .nodes
            .iter()
            .filter(|node| node.object_type == "workbook_sheet")
            .collect::<Vec<_>>();
        let odp = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "odp")
            .unwrap();
        let odp_slides = graph
            .nodes
            .iter()
            .filter(|node| node.object_type == "odp_slide")
            .collect::<Vec<_>>();

        assert_eq!(workbook_sheets.len(), 4);
        assert_eq!(odp_slides.len(), 2);
        assert!(workbook.search_text.contains("Keyboard"));
        assert!(odp
            .search_text
            .to_ascii_lowercase()
            .contains("search and precise location"));
        assert!(workbook_sheets.iter().all(|sheet| {
            sheet.parent_id.as_deref() == Some(workbook.id.as_str())
                && sheet.locator.as_ref().is_some_and(|locator| {
                    locator.kind == "workbook-sheet"
                        && locator.page.is_none()
                        && !locator.object_id.is_empty()
                })
                && sheet
                    .location_label
                    .as_deref()
                    .is_some_and(|label| label.starts_with("工作表："))
        }));
        assert!(odp_slides.iter().all(|slide| {
            slide.parent_id.as_deref() == Some(odp.id.as_str())
                && slide.locator.as_ref().is_some_and(|locator| {
                    locator.kind == "odp-slide"
                        && locator.page.is_some()
                        && !locator.object_id.is_empty()
                })
                && slide
                    .location_label
                    .as_deref()
                    .is_some_and(|label| label.starts_with("幻灯片 "))
        }));

        let children = workbook_sheets
            .iter()
            .copied()
            .chain(odp_slides.iter().copied())
            .collect::<Vec<_>>();
        let structural_edges = graph
            .edges
            .iter()
            .filter(|edge| {
                edge.relation_type == "contains"
                    && children.iter().any(|child| child.id == edge.target)
            })
            .collect::<Vec<_>>();
        assert_eq!(structural_edges.len(), 6);
        assert!(structural_edges.iter().all(|edge| edge.mentions.is_empty()));

        for child in &children {
            let locator = child.locator.as_ref().unwrap();
            let focused = relation_context_for_locator(
                &graph,
                &child.path,
                &child.path,
                Some(&locator.kind),
                Some(&locator.object_id),
                locator.page,
                &GraphRelationDecisionMap::new(),
            );
            assert_eq!(focused.node.as_ref().unwrap().id, child.id);
            assert_eq!(focused.relations.len(), 1);
            assert_eq!(focused.relations[0].relation_type, "contains");
            assert_eq!(focused.relations[0].direction, "incoming");
        }

        let snapshot = crate::services::knowledge_index::snapshot_from_graph(&root, graph.clone());
        for node in std::iter::once(workbook)
            .chain(std::iter::once(odp))
            .chain(children.iter().copied())
        {
            assert!(snapshot.objects.iter().any(|object| {
                object.id == node.id
                    && object.object_type == node.object_type
                    && object.locator_object_id
                        == node
                            .locator
                            .as_ref()
                            .map(|locator| locator.object_id.clone())
            }));
        }
        assert_eq!(
            snapshot
                .relations
                .iter()
                .filter(|relation| relation.relation_type == "contains"
                    && children.iter().any(|child| child.id == relation.target))
                .count(),
            6
        );
        assert_eq!(fs::read(&workbook_path).unwrap(), workbook_source);
        assert_eq!(fs::read(&odp_path).unwrap(), odp_source);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn docx_outline_uses_nearest_preceding_smaller_numeric_heading_level() {
        let document = "document";
        let mut outline = Vec::new();
        let mut parents = Vec::new();
        for (index, level) in [1_u8, 2, 3, 2, 4, 1, 3].into_iter().enumerate() {
            let parent = docx_heading_parent_id(&mut outline, level, document);
            parents.push(parent);
            outline.push((level, format!("heading-{index}")));
        }
        assert_eq!(
            parents,
            [
                "document",
                "heading-0",
                "heading-1",
                "heading-0",
                "heading-3",
                "document",
                "heading-5",
            ]
        );
    }

    #[test]
    fn docx_headings_and_ods_sheets_are_bounded_stable_graph_objects() {
        let (base, root) = fixture("m4a5-docx-ods-objects");
        let docx_source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let ods_source =
            include_bytes!("../../tests/fixtures/odf-content/longedit-e1c-spreadsheet.ods");
        let docx_path = root.join("Research.docx");
        let ods_path = root.join("Evidence.ods");
        fs::write(&docx_path, docx_source).unwrap();
        fs::write(&ods_path, ods_source).unwrap();

        let graph =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        let rebuilt =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        let docx = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "docx")
            .unwrap();
        let headings = graph
            .nodes
            .iter()
            .filter(|node| node.object_type == "docx_heading")
            .collect::<Vec<_>>();
        let ods = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "ods")
            .unwrap();
        let sheets = graph
            .nodes
            .iter()
            .filter(|node| node.object_type == "ods_sheet")
            .collect::<Vec<_>>();

        assert_eq!(MAX_DOCX_GRAPH_HEADINGS, 512);
        assert_eq!(MAX_ODS_GRAPH_SHEETS, 128);
        assert_eq!(headings.len(), 1);
        assert_eq!(sheets.len(), 2);
        assert!(docx.search_text.contains("Microsoft Word Producer Fixture"));
        assert!(ods.search_text.contains("LongEdit E1C ODS fixture"));
        assert!(headings.iter().all(|heading| {
            heading.parent_id.as_deref() == Some(docx.id.as_str())
                && heading.locator.as_ref().is_some_and(|locator| {
                    locator.kind == "docx-block"
                        && locator.page.is_none()
                        && !locator.object_id.is_empty()
                })
                && heading
                    .location_label
                    .as_deref()
                    .is_some_and(|label| label.starts_with("标题："))
        }));
        assert!(sheets.iter().all(|sheet| {
            sheet.parent_id.as_deref() == Some(ods.id.as_str())
                && sheet.locator.as_ref().is_some_and(|locator| {
                    locator.kind == "ods-sheet"
                        && locator.page.is_none()
                        && locator.object_id.starts_with("ods-sheet-")
                })
                && sheet
                    .location_label
                    .as_deref()
                    .is_some_and(|label| label.starts_with("工作表："))
        }));

        let children = headings
            .iter()
            .copied()
            .chain(sheets.iter().copied())
            .collect::<Vec<_>>();
        let structural_edges = graph
            .edges
            .iter()
            .filter(|edge| {
                edge.relation_type == "contains"
                    && children.iter().any(|child| child.id == edge.target)
            })
            .collect::<Vec<_>>();
        assert_eq!(structural_edges.len(), 3);
        assert!(structural_edges.iter().all(|edge| edge.mentions.is_empty()));
        assert!(!graph
            .nodes
            .iter()
            .any(|node| matches!(node.object_type.as_str(), "docx_block" | "ods_cell")));

        for child in &children {
            let locator = child.locator.as_ref().unwrap();
            let focused = relation_context_for_locator(
                &graph,
                &child.path,
                &child.path,
                Some(&locator.kind),
                Some(&locator.object_id),
                locator.page,
                &GraphRelationDecisionMap::new(),
            );
            assert_eq!(focused.node.as_ref().unwrap().id, child.id);
            assert_eq!(focused.relations.len(), 1);
            assert_eq!(focused.relations[0].relation_type, "contains");
            assert_eq!(focused.relations[0].direction, "incoming");
        }

        let mut identities = children
            .iter()
            .map(|node| (node.id.clone(), node.parent_id.clone()))
            .collect::<Vec<_>>();
        let mut rebuilt_identities = rebuilt
            .nodes
            .iter()
            .filter(|node| matches!(node.object_type.as_str(), "docx_heading" | "ods_sheet"))
            .map(|node| (node.id.clone(), node.parent_id.clone()))
            .collect::<Vec<_>>();
        identities.sort();
        rebuilt_identities.sort();
        assert_eq!(identities, rebuilt_identities);

        let snapshot = crate::services::knowledge_index::snapshot_from_graph(&root, graph.clone());
        for node in std::iter::once(docx)
            .chain(std::iter::once(ods))
            .chain(children.iter().copied())
        {
            assert!(snapshot.objects.iter().any(|object| {
                object.id == node.id
                    && object.object_type == node.object_type
                    && object.locator_object_id
                        == node
                            .locator
                            .as_ref()
                            .map(|locator| locator.object_id.clone())
            }));
        }
        assert_eq!(fs::read(&docx_path).unwrap(), docx_source);
        assert_eq!(fs::read(&ods_path).unwrap(), ods_source);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn representative_cross_format_library_produces_a_useful_knowledge_pulse() {
        let (base, root) = fixture("g10-cross-format-pulse");
        let research = root.join("research");
        fs::create_dir_all(&research).unwrap();
        fs::write(root.join("NorthStar.md"), "# North Star\n").unwrap();
        fs::write(
            research.join("Evidence.pdf"),
            b"%PDF representative fixture",
        )
        .unwrap();
        fs::write(
            research.join("Evidence.pdf.annotations.json"),
            r#"{"schemaVersion":1,"source":{"pdfFile":"Evidence.pdf","size":27,"modifiedAt":1},"annotations":[{"id":"evidence-1","kind":"comment","page":1,"color":"yellow","rects":[],"quote":"retention","comment":"Supports the roadmap","createdAt":1,"updatedAt":1}]}"#,
        )
        .unwrap();
        fs::write(
            research.join("Roadmap.table.json"),
            r#"{"schemaVersion":1,"kind":"longedit.table","data":{"columns":[{"id":"topic","name":"Topic","type":"text"}],"rows":[{"id":"row-1","values":{"topic":"Knowledge network"}}]},"views":[{"id":"chart","name":"Coverage chart","kind":"chart","config":{"categoryColumn":"topic"}},{"id":"dashboard","name":"Management dashboard","kind":"dashboard","config":{"dashboardItems":[{"chartViewId":"chart","width":6}]}}],"activeView":"dashboard"}"#,
        )
        .unwrap();
        fs::write(
            research.join("System.canvas"),
            r#"{"nodes":[{"id":"north-star","type":"file","file":"NorthStar.md","x":0,"y":0,"width":240,"height":120},{"id":"roadmap-chart","type":"file","file":"research/Roadmap.table.json","longeditViewId":"chart","x":320,"y":0,"width":240,"height":120}],"edges":[{"id":"supports-roadmap","fromNode":"north-star","toNode":"roadmap-chart","relationType":"supports"}]}"#,
        )
        .unwrap();
        fs::write(
            research.join("Outline.opml"),
            r#"<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Delivery outline</title></head><body><outline text="Discover" _longeditId="discover"><outline text="Deliver" _longeditId="deliver"/></outline></body></opml>"#,
        )
        .unwrap();
        fs::write(
            research.join("Brief.md"),
            "---\nrelations:\n  depends-on: [[NorthStar]]\n---\n# Brief\n[Evidence](longedit://pdf?path=research%2FEvidence.pdf&page=1&annotation=evidence-1)",
        )
        .unwrap();
        fs::write(
            research.join("Review.pptx"),
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx"),
        )
        .unwrap();

        let graph =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        let pulse = knowledge_graph_pulse(&graph);
        let object_types = graph
            .nodes
            .iter()
            .map(|node| node.object_type.as_str())
            .collect::<HashSet<_>>();
        for required in [
            "markdown",
            "pdf",
            "pdf_annotation",
            "table",
            "table_view",
            "canvas",
            "canvas_node",
            "opml",
            "opml_node",
            "pptx",
            "pptx_slide",
        ] {
            assert!(
                object_types.contains(required),
                "missing {required} graph object"
            );
        }
        for required in ["annotates", "contains", "depends-on", "embeds", "supports"] {
            assert!(
                pulse
                    .relation_types
                    .iter()
                    .any(|relation| relation.relation_type == required),
                "missing {required} relation in pulse"
            );
        }
        assert!(pulse.object_count >= 16, "unexpected pulse: {pulse:?}");
        assert!(pulse.relation_count >= 12, "unexpected pulse: {pulse:?}");
        assert!(pulse.connected_object_count > pulse.isolated_object_count);
        assert!(pulse.coverage_percent >= 75);
        assert!(!pulse.top_nodes.is_empty());
        assert!(pulse.top_nodes.len() <= 6);
        assert!(pulse
            .top_nodes
            .windows(2)
            .all(|pair| pair[0].relation_count >= pair[1].relation_count));

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn consented_observation_contains_only_aggregate_graph_metrics() {
        let mut secret_a = GraphNode::test_node("secret-object-a");
        secret_a.title = "Confidential Acquisition".into();
        secret_a.path = "C:\\Users\\Alice\\SecretVault\\acquisition.md".into();
        secret_a.object_type = "markdown".into();
        let mut secret_b = GraphNode::test_node("secret-object-b");
        secret_b.title = "Private Customer List".into();
        secret_b.path = "C:\\Users\\Alice\\SecretVault\\customers.pdf".into();
        secret_b.object_type = "pdf".into();
        let mut isolated = GraphNode::test_node("secret-object-c");
        isolated.title = "Unannounced Roadmap".into();
        isolated.path = "C:\\Users\\Alice\\SecretVault\\roadmap.md".into();
        let graph = GraphData {
            nodes: vec![secret_a, secret_b, isolated],
            edges: vec![GraphEdge::test_edge("secret-object-a", "secret-object-b")],
        };

        let observation = knowledge_graph_observation(&graph, 100);
        assert_eq!(observation.object_count, 3);
        assert_eq!(observation.relation_count, 1);
        assert_eq!(observation.connected_object_count, 2);
        assert_eq!(observation.isolated_object_count, 1);
        assert_eq!(observation.coverage_percent, 67);
        assert_eq!(observation.degree_distribution.zero, 1);
        assert_eq!(observation.degree_distribution.one, 2);
        assert_eq!(observation.object_types.len(), 2);
        assert_eq!(observation.guidance[0].code, "increase-relation-coverage");
        assert!(!observation.source_user_content_included);
        assert!(!observation.object_identifiers_included);
        assert!(!observation.file_names_included);
        assert!(!observation.absolute_paths_included);

        let serialized = serde_json::to_string(&observation).unwrap();
        for secret in [
            "secret-object-a",
            "Confidential Acquisition",
            "Private Customer List",
            "Unannounced Roadmap",
            "Alice",
            "SecretVault",
            "acquisition.md",
        ] {
            assert!(!serialized.contains(secret), "observation leaked {secret}");
        }
    }

    #[test]
    fn consented_observation_comparison_reports_improvement_without_identifiers() {
        let baseline_graph = GraphData {
            nodes: vec![
                GraphNode::test_node("C:\\Secret\\baseline-a.md"),
                GraphNode::test_node("C:\\Secret\\baseline-b.md"),
                GraphNode::test_node("C:\\Secret\\baseline-c.md"),
            ],
            edges: vec![GraphEdge::test_edge(
                "C:\\Secret\\baseline-a.md",
                "C:\\Secret\\baseline-b.md",
            )],
        };
        let mut current_graph = baseline_graph.clone();
        current_graph.edges.push(GraphEdge::structural(
            "C:\\Secret\\baseline-b.md".into(),
            "C:\\Secret\\baseline-c.md".into(),
            "supports",
        ));
        let baseline = knowledge_graph_observation(&baseline_graph, 100);
        let current = knowledge_graph_observation(&current_graph, 160);
        let comparison = compare_knowledge_graph_observations(&baseline, &current);

        assert_eq!(comparison.stage, "G15B");
        assert_eq!(comparison.elapsed_seconds, 60);
        assert_eq!(comparison.changes.relation_count, 1);
        assert_eq!(comparison.changes.isolated_object_count, -1);
        assert_eq!(comparison.changes.coverage_percent, 33);
        assert_eq!(comparison.outcome, "improved");
        assert!(comparison
            .achievements
            .contains(&"isolated-objects-reduced".to_string()));
        assert!(comparison
            .achievements
            .contains(&"relations-added".to_string()));

        let serialized = serde_json::to_string(&comparison).unwrap();
        for secret in [
            "C:\\Secret",
            "baseline-a.md",
            "baseline-b.md",
            "baseline-c.md",
        ] {
            assert!(!serialized.contains(secret), "comparison leaked {secret}");
        }
    }

    #[test]
    fn comparison_receipt_review_rejects_unknown_and_inconsistent_fields() {
        let baseline_graph = GraphData {
            nodes: vec![
                GraphNode::test_node("C:\\Private\\a.md"),
                GraphNode::test_node("C:\\Private\\b.md"),
            ],
            edges: Vec::new(),
        };
        let mut current_graph = baseline_graph.clone();
        current_graph.edges.push(GraphEdge::structural(
            "C:\\Private\\a.md".into(),
            "C:\\Private\\b.md".into(),
            "supports",
        ));
        let comparison = compare_knowledge_graph_observations(
            &knowledge_graph_observation(&baseline_graph, 100),
            &knowledge_graph_observation(&current_graph, 160),
        );
        let path = std::env::temp_dir().join(format!(
            "longedit-g15f-comparison-review-{}-{}.json",
            std::process::id(),
            current_unix_seconds().unwrap()
        ));
        fs::write(&path, serde_json::to_vec_pretty(&comparison).unwrap()).unwrap();
        let reviewed = load_knowledge_graph_observation_comparison(&path).unwrap();
        assert_eq!(reviewed, comparison);

        let mut value = serde_json::to_value(&comparison).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .insert("libraryPath".into(), serde_json::json!("C:\\Private"));
        fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();
        assert!(load_knowledge_graph_observation_comparison(&path)
            .unwrap_err()
            .contains("不允许的字段"));

        let mut value = serde_json::to_value(&comparison).unwrap();
        value["changes"]["relationCount"] = serde_json::json!(99);
        fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();
        assert!(load_knowledge_graph_observation_comparison(&path)
            .unwrap_err()
            .contains("变化值不一致"));

        let mut value = serde_json::to_value(&comparison).unwrap();
        value["baselineGeneratedAt"] = serde_json::json!(200);
        value["generatedAt"] = serde_json::json!(100);
        fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();
        assert!(load_knowledge_graph_observation_comparison(&path)
            .unwrap_err()
            .contains("变化值不一致"));

        let mut value = serde_json::to_value(&comparison).unwrap();
        value["baseline"]["objectCount"] = serde_json::json!(usize::MAX);
        value["baseline"]["connectedObjectCount"] = serde_json::json!(usize::MAX);
        value["baseline"]["isolatedObjectCount"] = serde_json::json!(usize::MAX);
        fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();
        assert!(load_knowledge_graph_observation_comparison(&path)
            .unwrap_err()
            .contains("聚合计数不一致"));
        let _ = fs::remove_file(path);
    }
}
