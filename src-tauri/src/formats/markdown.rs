use serde::Serialize;
use std::sync::LazyLock;

static WIKILINK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").expect("valid wikilink regex")
});
static PDF_REFERENCE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\[([^\]]*)\]\((longedit://pdf\?[^)\s]+)\)")
        .expect("valid PDF reference regex")
});

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WikilinkMention {
    pub target: String,
    pub alias: Option<String>,
    pub syntax: String,
    pub context: String,
    pub line: usize,
    pub relation_type: String,
}

pub(crate) fn extract_wikilink_mentions(content: &str) -> Vec<WikilinkMention> {
    let mut mentions = Vec::new();
    let mut in_fence = false;
    let mut in_frontmatter = false;
    let mut relations_indent: Option<usize> = None;

    for (line_index, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();
        if line_index == 0 && trimmed == "---" {
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter && trimmed == "---" {
            in_frontmatter = false;
            relations_indent = None;
            continue;
        }
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }

        let relation_type = if in_frontmatter {
            frontmatter_relation_type(line, &mut relations_indent)
        } else {
            None
        };

        for captures in WIKILINK_RE.captures_iter(line) {
            let Some(whole) = captures.get(0) else {
                continue;
            };
            if inside_inline_code(line, whole.start()) {
                continue;
            }
            let target = captures[1].trim().to_string();
            if target.is_empty() {
                continue;
            }
            let alias = captures
                .get(2)
                .map(|value| value.as_str().trim().to_string())
                .filter(|value| !value.is_empty());
            mentions.push(WikilinkMention {
                target,
                alias,
                syntax: whole.as_str().to_string(),
                context: truncate_context(line.trim(), 180),
                line: line_index + 1,
                relation_type: relation_type.clone().unwrap_or_else(|| "links-to".into()),
            });
        }
    }

    mentions
}

pub(crate) fn extract_pdf_reference_mentions(content: &str) -> Vec<WikilinkMention> {
    let mut mentions = Vec::new();
    let mut in_fence = false;
    for (line_index, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        for captures in PDF_REFERENCE_RE.captures_iter(line) {
            let Some(whole) = captures.get(0) else {
                continue;
            };
            if inside_inline_code(line, whole.start()) {
                continue;
            }
            let uri = captures
                .get(2)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let Some(query) = uri.split_once('?').map(|(_, value)| value) else {
                continue;
            };
            let path = query.split('&').find_map(|field| {
                let (key, value) = field.split_once('=')?;
                (key == "path")
                    .then(|| {
                        urlencoding::decode(value)
                            .ok()
                            .map(|value| value.into_owned())
                    })
                    .flatten()
            });
            let Some(path) = path.map(|value| value.replace('\\', "/")) else {
                continue;
            };
            let segments: Vec<&str> = path.split('/').collect();
            if !path.to_lowercase().ends_with(".pdf")
                || path.starts_with('/')
                || path.get(1..2) == Some(":")
                || segments
                    .iter()
                    .any(|segment| segment.is_empty() || matches!(*segment, "." | ".."))
            {
                continue;
            }
            let alias = captures
                .get(1)
                .map(|value| value.as_str().trim().to_string())
                .filter(|value| !value.is_empty());
            mentions.push(WikilinkMention {
                target: path,
                alias,
                syntax: uri.to_string(),
                context: truncate_context(line.trim(), 180),
                line: line_index + 1,
                relation_type: "annotates".into(),
            });
        }
    }
    mentions
}

fn frontmatter_relation_type(line: &str, relations_indent: &mut Option<usize>) -> Option<String> {
    let trimmed = line.trim();
    let indent = line
        .chars()
        .take_while(|character| character.is_whitespace())
        .count();
    if trimmed == "relations:" {
        *relations_indent = Some(indent);
        return None;
    }
    let parent_indent = (*relations_indent)?;
    if trimmed.is_empty() {
        return None;
    }
    if indent <= parent_indent {
        *relations_indent = None;
        return None;
    }
    let (key, _) = trimmed.split_once(':')?;
    normalize_relation_type(key)
}

pub(crate) fn normalize_relation_type(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_lowercase().replace(['_', ' '], "-");
    if normalized.is_empty()
        || normalized.len() > 40
        || !normalized
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        None
    } else {
        Some(normalized)
    }
}

fn inside_inline_code(line: &str, byte_index: usize) -> bool {
    line[..byte_index]
        .chars()
        .filter(|character| *character == '`')
        .count()
        % 2
        == 1
}

fn truncate_context(value: &str, max_chars: usize) -> String {
    let mut characters = value.chars();
    let prefix: String = characters.by_ref().take(max_chars).collect();
    if characters.next().is_some() {
        format!("{}…", prefix)
    } else {
        prefix
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_direction_evidence_alias_and_line() {
        let mentions = extract_wikilink_mentions("# 项目\n参考 [[需求文档|产品需求]] 完成设计。");
        assert_eq!(mentions.len(), 1);
        assert_eq!(mentions[0].target, "需求文档");
        assert_eq!(mentions[0].alias.as_deref(), Some("产品需求"));
        assert_eq!(mentions[0].syntax, "[[需求文档|产品需求]]");
        assert_eq!(mentions[0].line, 2);
        assert_eq!(mentions[0].relation_type, "links-to");
        assert!(mentions[0].context.contains("完成设计"));
    }

    #[test]
    fn ignores_fenced_and_inline_code() {
        let mentions = extract_wikilink_mentions(
            "有效 [[真实笔记]]\n`[[行内示例]]`\n```markdown\n[[代码示例]]\n```",
        );
        assert_eq!(mentions.len(), 1);
        assert_eq!(mentions[0].target, "真实笔记");
    }

    #[test]
    fn unicode_context_truncation_never_splits_characters() {
        let content = format!("{} [[目标]]", "知识图谱".repeat(80));
        let mentions = extract_wikilink_mentions(&content);
        assert_eq!(mentions.len(), 1);
        assert!(mentions[0].context.ends_with('…'));
        assert!(mentions[0].context.chars().count() <= 181);
    }

    #[test]
    fn extracts_typed_relations_from_frontmatter() {
        let content = "---\ntype: project\nrelations:\n  parent: [[知识管理系统]]\n  depends-on: [[索引服务]]\n  related: [[图谱交互设计]]\n---\n正文 [[普通链接]]";
        let mentions = extract_wikilink_mentions(content);
        let types: Vec<_> = mentions
            .iter()
            .map(|mention| mention.relation_type.as_str())
            .collect();
        assert_eq!(types, vec!["parent", "depends-on", "related", "links-to"]);
    }

    #[test]
    fn extracts_safe_pdf_annotation_references() {
        let content = "> 摘录\n> [来源：论文](longedit://pdf?path=research%2Fpaper.pdf&page=3&annotation=a-1)\n`[忽略](longedit://pdf?path=hidden.pdf&page=1&annotation=x)`\n[越界](longedit://pdf?path=..%2Foutside.pdf&page=1&annotation=x)";
        let mentions = extract_pdf_reference_mentions(content);
        assert_eq!(mentions.len(), 1);
        assert_eq!(mentions[0].target, "research/paper.pdf");
        assert_eq!(mentions[0].alias.as_deref(), Some("来源：论文"));
        assert_eq!(mentions[0].line, 2);
        assert_eq!(mentions[0].relation_type, "annotates");
    }
}
