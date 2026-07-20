use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer, XmlVersion};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

pub const MAX_OPML_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_OPML_NODES: usize = 10_000;
const MAX_OPML_DEPTH: usize = 64;
const MAX_NODE_TEXT: usize = 2_000;
const MAX_NOTE_TEXT: usize = 20_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpmlDocument {
    pub title: String,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
    pub roots: Vec<OpmlNode>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpmlNode {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub attributes: BTreeMap<String, String>,
    #[serde(default)]
    pub children: Vec<OpmlNode>,
}

fn xml_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("解析 OPML 属性失败: {error}"))?;
        if attribute.key.as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("解码 OPML 属性失败: {error}"));
        }
    }
    Ok(None)
}

fn parse_node(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    generated_id: usize,
) -> Result<OpmlNode, String> {
    let text = xml_value(event, b"text", decoder)?
        .or(xml_value(event, b"title", decoder)?)
        .unwrap_or_default();
    let id = xml_value(event, b"_longeditId", decoder)?
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| format!("node-{generated_id}"));
    let note = xml_value(event, b"_note", decoder)?.unwrap_or_default();
    let collapsed = xml_value(event, b"_collapsed", decoder)?
        .is_some_and(|value| value == "true" || value == "1");
    let mut attributes = BTreeMap::new();
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("解析 OPML 属性失败: {error}"))?;
        let key = String::from_utf8_lossy(attribute.key.as_ref()).into_owned();
        if matches!(
            key.as_str(),
            "text" | "title" | "_note" | "_collapsed" | "_longeditId"
        ) {
            continue;
        }
        let value = attribute
            .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
            .map_err(|error| format!("解码 OPML 属性失败: {error}"))?
            .into_owned();
        if key.chars().count() <= 80 && value.chars().count() <= 2_000 {
            attributes.insert(key, value);
        }
    }
    Ok(OpmlNode {
        id,
        text,
        note,
        collapsed,
        attributes,
        children: Vec::new(),
    })
}

fn append_node(stack: &mut [OpmlNode], roots: &mut Vec<OpmlNode>, node: OpmlNode) {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(node);
    } else {
        roots.push(node);
    }
}

pub fn parse_opml(content: &str) -> Result<OpmlDocument, String> {
    if content.len() > MAX_OPML_BYTES {
        return Err("OPML 文件不能超过 8 MB".into());
    }
    let mut reader = Reader::from_str(content.trim_start_matches('\u{feff}'));
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut roots = Vec::new();
    let mut stack = Vec::<OpmlNode>::new();
    let mut title = String::new();
    let mut metadata = BTreeMap::new();
    let mut head_field: Option<String> = None;
    let mut head_text = String::new();
    let mut in_head = false;
    let mut saw_opml = false;
    let mut saw_body = false;
    let mut node_count = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 OPML XML 失败: {error}"))?;
        match event {
            Event::Start(ref event) if event.local_name().as_ref() == b"opml" => saw_opml = true,
            Event::Start(ref event) if event.local_name().as_ref() == b"head" => in_head = true,
            Event::End(ref event) if event.local_name().as_ref() == b"head" => in_head = false,
            Event::Start(ref event) if event.local_name().as_ref() == b"body" => saw_body = true,
            Event::Start(ref event) if event.local_name().as_ref() == b"outline" => {
                node_count += 1;
                if node_count > MAX_OPML_NODES || stack.len() >= MAX_OPML_DEPTH {
                    return Err("OPML 节点数量或层级超过限制".into());
                }
                stack.push(parse_node(event, reader.decoder(), node_count)?);
            }
            Event::Empty(ref event) if event.local_name().as_ref() == b"outline" => {
                node_count += 1;
                if node_count > MAX_OPML_NODES || stack.len() >= MAX_OPML_DEPTH {
                    return Err("OPML 节点数量或层级超过限制".into());
                }
                let node = parse_node(event, reader.decoder(), node_count)?;
                append_node(&mut stack, &mut roots, node);
            }
            Event::End(ref event) if event.local_name().as_ref() == b"outline" => {
                let node = stack.pop().ok_or("OPML outline 结束标签不匹配")?;
                append_node(&mut stack, &mut roots, node);
            }
            Event::Start(ref event) if in_head => {
                head_field =
                    Some(String::from_utf8_lossy(event.local_name().as_ref()).into_owned());
                head_text.clear();
            }
            Event::Text(ref event) if head_field.is_some() => {
                let decoded = event
                    .decode()
                    .map_err(|error| format!("解码 OPML 文本失败: {error}"))?;
                let unescaped = quick_xml::escape::unescape(&decoded)
                    .map_err(|error| format!("还原 OPML 实体失败: {error}"))?;
                head_text.push_str(&unescaped);
            }
            Event::End(ref event)
                if in_head
                    && head_field
                        .as_deref()
                        .is_some_and(|name| name.as_bytes() == event.local_name().as_ref()) =>
            {
                let field = head_field.take().unwrap();
                let value = head_text.trim().to_string();
                if field == "title" {
                    title = value;
                } else if !value.is_empty()
                    && field.chars().count() <= 80
                    && value.chars().count() <= 4_000
                {
                    metadata.insert(field, value);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    if !saw_opml || !saw_body || !stack.is_empty() {
        return Err("OPML 缺少有效的 opml/body 结构".into());
    }
    let document = OpmlDocument {
        title: if title.is_empty() {
            "未命名思维导图".into()
        } else {
            title
        },
        metadata,
        roots,
    };
    validate_opml(&document)?;
    Ok(document)
}

fn validate_node(
    node: &OpmlNode,
    depth: usize,
    count: &mut usize,
    ids: &mut HashSet<String>,
) -> Result<(), String> {
    *count += 1;
    if *count > MAX_OPML_NODES || depth > MAX_OPML_DEPTH {
        return Err("OPML 节点数量或层级超过限制".into());
    }
    if node.id.is_empty() || node.id.chars().count() > 128 || !ids.insert(node.id.clone()) {
        return Err("OPML 节点 ID 为空、过长或重复".into());
    }
    if node.text.trim().is_empty() || node.text.chars().count() > MAX_NODE_TEXT {
        return Err("OPML 节点标题为空或过长".into());
    }
    if node.note.chars().count() > MAX_NOTE_TEXT {
        return Err("OPML 节点备注过长".into());
    }
    for child in &node.children {
        validate_node(child, depth + 1, count, ids)?;
    }
    Ok(())
}

pub fn validate_opml(document: &OpmlDocument) -> Result<(), String> {
    if document.title.chars().count() > 500 || document.title.chars().any(char::is_control) {
        return Err("OPML 标题无效".into());
    }
    let mut count = 0;
    let mut ids = HashSet::new();
    for root in &document.roots {
        validate_node(root, 1, &mut count, &mut ids)?;
    }
    if document.roots.is_empty() {
        return Err("思维导图至少需要一个根节点".into());
    }
    Ok(())
}

fn write_node(writer: &mut Writer<Vec<u8>>, node: &OpmlNode, depth: usize) -> Result<(), String> {
    let indent = "  ".repeat(depth);
    writer
        .write_event(Event::Text(BytesText::new(&indent)))
        .map_err(|error| error.to_string())?;
    let mut event = BytesStart::new("outline");
    event.push_attribute(("text", node.text.as_str()));
    event.push_attribute(("_longeditId", node.id.as_str()));
    if !node.note.is_empty() {
        event.push_attribute(("_note", node.note.as_str()));
    }
    if node.collapsed {
        event.push_attribute(("_collapsed", "true"));
    }
    for (key, value) in &node.attributes {
        if !key.contains(':')
            && !key
                .chars()
                .any(|character| character.is_whitespace() || character.is_control())
        {
            event.push_attribute((key.as_str(), value.as_str()));
        }
    }
    if node.children.is_empty() {
        writer
            .write_event(Event::Empty(event))
            .map_err(|error| error.to_string())?;
        writer
            .write_event(Event::Text(BytesText::new("\n")))
            .map_err(|error| error.to_string())?;
    } else {
        writer
            .write_event(Event::Start(event))
            .map_err(|error| error.to_string())?;
        writer
            .write_event(Event::Text(BytesText::new("\n")))
            .map_err(|error| error.to_string())?;
        for child in &node.children {
            write_node(writer, child, depth + 1)?;
        }
        writer
            .write_event(Event::Text(BytesText::new(&indent)))
            .map_err(|error| error.to_string())?;
        writer
            .write_event(Event::End(BytesEnd::new("outline")))
            .map_err(|error| error.to_string())?;
        writer
            .write_event(Event::Text(BytesText::new("\n")))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn serialize_opml(document: &OpmlDocument) -> Result<String, String> {
    validate_opml(document)?;
    let mut writer = Writer::new(Vec::new());
    writer
        .write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Text(BytesText::new("\n")))
        .map_err(|error| error.to_string())?;
    let mut opml = BytesStart::new("opml");
    opml.push_attribute(("version", "2.0"));
    writer
        .write_event(Event::Start(opml))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Text(BytesText::new("\n  ")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Start(BytesStart::new("head")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Start(BytesStart::new("title")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Text(BytesText::new(&document.title)))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::End(BytesEnd::new("title")))
        .map_err(|error| error.to_string())?;
    for (key, value) in &document.metadata {
        if key == "title"
            || key.contains(':')
            || key
                .chars()
                .any(|character| character.is_whitespace() || character.is_control())
        {
            continue;
        }
        writer
            .write_event(Event::Start(BytesStart::new(key)))
            .map_err(|error| error.to_string())?;
        writer
            .write_event(Event::Text(BytesText::new(value)))
            .map_err(|error| error.to_string())?;
        writer
            .write_event(Event::End(BytesEnd::new(key)))
            .map_err(|error| error.to_string())?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("head")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Text(BytesText::new("\n  ")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Start(BytesStart::new("body")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Text(BytesText::new("\n")))
        .map_err(|error| error.to_string())?;
    for root in &document.roots {
        write_node(&mut writer, root, 2)?;
    }
    writer
        .write_event(Event::Text(BytesText::new("  ")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::End(BytesEnd::new("body")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Text(BytesText::new("\n")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::End(BytesEnd::new("opml")))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::Text(BytesText::new("\n")))
        .map_err(|error| error.to_string())?;
    String::from_utf8(writer.into_inner()).map_err(|error| format!("生成 OPML UTF-8 失败: {error}"))
}

pub fn opml_search_text(document: &OpmlDocument) -> String {
    fn visit(node: &OpmlNode, output: &mut String) {
        output.push_str(&node.text);
        output.push('\n');
        if !node.note.is_empty() {
            output.push_str(&node.note);
            output.push('\n');
        }
        for child in &node.children {
            visit(child, output);
        }
    }
    let mut output = format!("{}\n", document.title);
    for root in &document.roots {
        visit(root, &mut output);
    }
    output
}

pub fn opml_to_canvas(document: &OpmlDocument, source_file: &str) -> serde_json::Value {
    fn flatten<'a>(
        nodes: &'a [OpmlNode],
        parent: Option<&'a str>,
        depth: usize,
        output: &mut Vec<(&'a OpmlNode, Option<&'a str>, usize)>,
    ) {
        for node in nodes {
            output.push((node, parent, depth));
            flatten(&node.children, Some(&node.id), depth + 1, output);
        }
    }
    let mut flat = Vec::new();
    flatten(&document.roots, None, 1, &mut flat);
    let mut counts = BTreeMap::new();
    for (_, _, depth) in &flat {
        *counts.entry(*depth).or_insert(0usize) += 1;
    }
    let mut indexes = BTreeMap::new();
    let mut nodes = vec![
        serde_json::json!({"id":"opml-source","type":"file","file":source_file,"x":0,"y":0,"width":280,"height":120,"color":"6"}),
    ];
    for (node, _, depth) in &flat {
        let index = indexes.entry(*depth).or_insert(0usize);
        let count = counts[depth];
        let y = (*index as f64 - count.saturating_sub(1) as f64 / 2.0) * 150.0;
        *index += 1;
        nodes.push(serde_json::json!({"id":format!("opml-{}",node.id),"type":"text","text":if node.note.is_empty(){node.text.clone()}else{format!("{}\n\n{}",node.text,node.note)},"x":*depth as f64*330.0,"y":y,"width":260,"height":110,"color":match depth {1=>"6",2=>"5",3=>"4",_=>"3"}}));
    }
    let edges = flat.iter().enumerate().map(|(index,(node,parent,_))| serde_json::json!({"id":format!("opml-edge-{index}"),"fromNode":parent.map(|id|format!("opml-{id}")).unwrap_or_else(||"opml-source".into()),"toNode":format!("opml-{}",node.id),"fromSide":"right","toSide":"left","relationType":"contains"})).collect::<Vec<_>>();
    serde_json::json!({"nodes":nodes,"edges":edges})
}
