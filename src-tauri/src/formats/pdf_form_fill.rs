use crate::formats::pdf_forms::{inspect_pdf_forms, MAX_PDF_FORM_INPUT_BYTES};
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

const MAX_TEXT_CHANGES: usize = 128;
const MAX_TEXT_VALUE_CHARS: usize = 1024;
const MAX_FIELD_DEPTH: usize = 64;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFormTextChange {
    pub field_name: String,
    pub value: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFormTextFillReport {
    pub status: String,
    pub engine: String,
    pub source_digest: String,
    pub output_digest: Option<String>,
    pub output_bytes: usize,
    pub changed_fields: Vec<String>,
    pub appearance_streams_written: usize,
    pub field_tree_verified: bool,
    pub widget_appearances_verified: bool,
    pub blockers: Vec<String>,
}

#[derive(Clone)]
struct TextFieldTarget {
    field_id: ObjectId,
    widget_ids: Vec<ObjectId>,
    field_type: String,
    flags: i64,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn dictionary_for(document: &Document, object: &Object) -> Option<(Option<ObjectId>, Dictionary)> {
    let (id, resolved) = document.dereference(object).ok()?;
    Some((id, resolved.as_dict().ok()?.clone()))
}

fn name_value(dictionary: &Dictionary, key: &[u8]) -> Option<String> {
    dictionary
        .get(key)
        .ok()
        .and_then(|value| value.as_name().ok())
        .map(|value| String::from_utf8_lossy(value).into_owned())
}

fn string_value(dictionary: &Dictionary, key: &[u8]) -> String {
    dictionary
        .get(key)
        .ok()
        .and_then(|value| value.as_str().ok())
        .map(|value| String::from_utf8_lossy(value).into_owned())
        .unwrap_or_default()
}

fn is_widget(dictionary: &Dictionary) -> bool {
    name_value(dictionary, b"Subtype").as_deref() == Some("Widget")
}

fn collect_text_fields(
    document: &Document,
    object: &Object,
    parent_name: &str,
    inherited_type: Option<String>,
    inherited_flags: i64,
    depth: usize,
    targets: &mut HashMap<String, TextFieldTarget>,
) -> Result<(), String> {
    if depth > MAX_FIELD_DEPTH {
        return Err("PDF 表单字段树超过 64 层安全上限".into());
    }
    let (object_id, dictionary) =
        dictionary_for(document, object).ok_or("PDF 表单包含无法解析的字段引用")?;
    let partial_name = string_value(&dictionary, b"T");
    let full_name = match (parent_name.is_empty(), partial_name.is_empty()) {
        (true, true) => return Err("PDF 表单包含未命名字段，不能可靠填写".into()),
        (true, false) => partial_name,
        (false, true) => parent_name.to_string(),
        (false, false) => format!("{parent_name}.{partial_name}"),
    };
    let field_type = name_value(&dictionary, b"FT").or(inherited_type);
    let flags = dictionary
        .get(b"Ff")
        .ok()
        .and_then(|value| value.as_i64().ok())
        .unwrap_or(inherited_flags);
    let kids = dictionary
        .get(b"Kids")
        .ok()
        .and_then(|value| document.dereference(value).ok())
        .and_then(|(_, value)| value.as_array().ok())
        .cloned()
        .unwrap_or_default();
    let mut widgets = Vec::new();
    let mut child_fields = Vec::new();
    for kid in kids {
        let (kid_id, kid_dictionary) =
            dictionary_for(document, &kid).ok_or("PDF 表单包含无法解析的子字段引用")?;
        if is_widget(&kid_dictionary) {
            widgets.push(kid_id.ok_or("PDF Widget 必须使用间接对象")?);
        } else {
            child_fields.push(kid);
        }
    }
    if !child_fields.is_empty() {
        for child in child_fields {
            collect_text_fields(
                document,
                &child,
                &full_name,
                field_type.clone(),
                flags,
                depth + 1,
                targets,
            )?;
        }
        return Ok(());
    }
    let field_id = object_id.ok_or("PDF 直接字段字典不能可靠填写")?;
    if is_widget(&dictionary) {
        widgets.push(field_id);
    }
    let target = TextFieldTarget {
        field_id,
        widget_ids: widgets,
        field_type: field_type.unwrap_or_else(|| "Unknown".into()),
        flags,
    };
    if targets.insert(full_name, target).is_some() {
        return Err("PDF 表单字段名重复，不能可靠填写".into());
    }
    Ok(())
}

fn collect_targets(document: &Document) -> Result<HashMap<String, TextFieldTarget>, String> {
    let catalog = document
        .catalog()
        .map_err(|error| format!("PDF Catalog 无效: {error}"))?;
    let acro_form = catalog
        .get(b"AcroForm")
        .map_err(|_| "PDF 没有 AcroForm 表单")?;
    let (_, acro_form) = dictionary_for(document, acro_form).ok_or("PDF AcroForm 无效")?;
    let fields = acro_form
        .get(b"Fields")
        .ok()
        .and_then(|value| document.dereference(value).ok())
        .and_then(|(_, value)| value.as_array().ok())
        .cloned()
        .ok_or("PDF AcroForm 缺少字段树")?;
    let mut targets = HashMap::new();
    for field in fields {
        collect_text_fields(document, &field, "", None, 0, 0, &mut targets)?;
    }
    Ok(targets)
}

fn validate_changes(changes: &[PdfFormTextChange]) -> Result<(), String> {
    if changes.is_empty() || changes.len() > MAX_TEXT_CHANGES {
        return Err("PDF 文本填写必须包含 1～128 个字段".into());
    }
    let mut names = HashSet::new();
    for change in changes {
        if change.field_name.trim().is_empty() || !names.insert(change.field_name.as_str()) {
            return Err("PDF 文本填写字段名不能为空或重复".into());
        }
        if change.value.chars().count() > MAX_TEXT_VALUE_CHARS {
            return Err("PDF 文本字段值超过 1024 字符安全上限".into());
        }
        if !change.value.chars().all(|value| {
            value == '\n' || value == '\r' || value == '\t' || (' '..='~').contains(&value)
        }) {
            return Err(
                "当前可靠外观仅支持基础拉丁文本；中文与其他 Unicode 值将在嵌入字体阶段开放".into(),
            );
        }
    }
    Ok(())
}

fn escaped_literal(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
        .replace('\r', " ")
        .replace('\n', " ")
        .replace('\t', " ")
}

fn widget_size(document: &Document, widget_id: ObjectId) -> (f32, f32) {
    let rect = document
        .get_dictionary(widget_id)
        .ok()
        .and_then(|widget| widget.get(b"Rect").ok())
        .and_then(|value| document.dereference(value).ok())
        .and_then(|(_, value)| value.as_array().ok());
    let number = |object: &Object| match object {
        Object::Integer(value) => Some(*value as f32),
        Object::Real(value) => Some(*value),
        _ => None,
    };
    if let Some(rect) = rect.filter(|rect| rect.len() == 4) {
        if let (Some(x1), Some(y1), Some(x2), Some(y2)) = (
            number(&rect[0]),
            number(&rect[1]),
            number(&rect[2]),
            number(&rect[3]),
        ) {
            return ((x2 - x1).abs().max(1.0), (y2 - y1).abs().max(1.0));
        }
    }
    (200.0, 20.0)
}

pub fn build_pdf_text_form_copy(
    source: &[u8],
    expected_source_digest: &str,
    changes: &[PdfFormTextChange],
) -> Result<(PdfFormTextFillReport, Option<Vec<u8>>), String> {
    if source.is_empty() || source.len() > MAX_PDF_FORM_INPUT_BYTES {
        return Err("PDF 文本填写输入必须在 1 byte～128 MiB 之间".into());
    }
    validate_changes(changes)?;
    let source_digest = digest(source);
    if !source_digest.eq_ignore_ascii_case(expected_source_digest.trim()) {
        return Err("PDF 源摘要已变化，请重新检查表单".into());
    }
    let inspection = inspect_pdf_forms(source)?;
    if !inspection.blockers.is_empty() {
        return Ok((
            PdfFormTextFillReport {
                status: "blocked".into(),
                engine: "lopdf 0.42.0 (MIT)".into(),
                source_digest,
                output_digest: None,
                output_bytes: 0,
                changed_fields: Vec::new(),
                appearance_streams_written: 0,
                field_tree_verified: false,
                widget_appearances_verified: false,
                blockers: inspection.blockers,
            },
            None,
        ));
    }
    let mut document =
        Document::load_mem(source).map_err(|error| format!("无法解析 PDF 表单结构: {error}"))?;
    let targets = collect_targets(&document)?;
    let font_id = document.add_object(Object::Dictionary(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding"
    }));
    let mut appearance_streams_written = 0;
    let mut changed_fields = Vec::new();
    for change in changes {
        let target = targets
            .get(&change.field_name)
            .ok_or_else(|| format!("PDF 字段不存在：{}", change.field_name))?;
        if target.field_type != "Tx"
            || target.flags & 1 != 0
            || target.flags & (1 << 13) != 0
            || target.widget_ids.is_empty()
        {
            return Err(format!(
                "PDF 字段不属于可可靠填写的文本子集：{}",
                change.field_name
            ));
        }
        document
            .get_dictionary_mut(target.field_id)
            .map_err(|_| format!("PDF 字段对象无效：{}", change.field_name))?
            .set("V", Object::string_literal(change.value.as_bytes()));
        for widget_id in &target.widget_ids {
            let (width, height) = widget_size(&document, *widget_id);
            let content = format!(
                "q BT /Helv 10 Tf 0 g 2 {} Td ({}) Tj ET Q",
                (height - 12.0).max(2.0),
                escaped_literal(&change.value)
            );
            let appearance_id = document.add_object(Stream::new(dictionary! {
                "Type" => "XObject", "Subtype" => "Form", "FormType" => 1,
                "BBox" => vec![0.into(), 0.into(), Object::Real(width), Object::Real(height)],
                "Resources" => dictionary! { "Font" => dictionary! { "Helv" => Object::Reference(font_id) } }
            }, content.into_bytes()));
            document
                .get_dictionary_mut(*widget_id)
                .map_err(|_| format!("PDF Widget 对象无效：{}", change.field_name))?
                .set(
                    "AP",
                    dictionary! { "N" => Object::Reference(appearance_id) },
                );
            appearance_streams_written += 1;
        }
        changed_fields.push(change.field_name.clone());
    }
    if let Ok(catalog) = document.catalog().cloned() {
        if let Ok(acro) = catalog.get(b"AcroForm") {
            if let Ok(id) = acro.as_reference() {
                if let Ok(dictionary) = document.get_dictionary_mut(id) {
                    dictionary.set("NeedAppearances", false);
                }
            }
        }
    }
    let mut output = Vec::new();
    document
        .save_to(&mut output)
        .map_err(|error| format!("生成 PDF 表单副本失败: {error}"))?;
    let verified = inspect_pdf_forms(&output)?;
    let field_tree_verified = changes.iter().all(|change| {
        verified.fields.iter().any(|field| {
            field.name == change.field_name && field.value.as_deref() == Some(change.value.as_str())
        })
    });
    let widget_appearances_verified = changes.iter().all(|change| {
        let widgets = verified
            .widgets
            .iter()
            .filter(|widget| widget.field_name == change.field_name)
            .collect::<Vec<_>>();
        !widgets.is_empty() && widgets.iter().all(|widget| widget.has_normal_appearance)
    });
    if !field_tree_verified || !widget_appearances_verified {
        return Err("PDF 表单副本的字段树、Widget 或外观复读不一致".into());
    }
    let output_digest = digest(&output);
    Ok((
        PdfFormTextFillReport {
            status: "isolated_verified".into(),
            engine: "lopdf 0.42.0 (MIT)".into(),
            source_digest,
            output_digest: Some(output_digest),
            output_bytes: output.len(),
            changed_fields,
            appearance_streams_written,
            field_tree_verified,
            widget_appearances_verified,
            blockers: Vec::new(),
        },
        Some(output),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_form_fixture(with_action: bool) -> Vec<u8> {
        let mut document = Document::with_version("1.7");
        let pages_id = document.new_object_id();
        let page_id = document.new_object_id();
        let field_id = document.new_object_id();
        let widget_id = document.new_object_id();
        let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
        let mut field = dictionary! {
            "FT" => "Tx", "T" => Object::string_literal("customer.name"),
            "V" => Object::string_literal("Alice"), "Kids" => vec![Object::Reference(widget_id)]
        };
        if with_action {
            field.set("AA", dictionary! { "K" => dictionary! { "S" => "JavaScript", "JS" => Object::string_literal("noop") } });
        }
        document.objects.insert(field_id, Object::Dictionary(field));
        document.objects.insert(widget_id, Object::Dictionary(dictionary! {
            "Type" => "Annot", "Subtype" => "Widget", "Parent" => Object::Reference(field_id),
            "Rect" => vec![10.into(), 10.into(), 210.into(), 40.into()], "P" => Object::Reference(page_id)
        }));
        document.objects.insert(page_id, Object::Dictionary(dictionary! {
            "Type" => "Page", "Parent" => Object::Reference(pages_id),
            "MediaBox" => vec![0.into(), 0.into(), 300.into(), 300.into()],
            "Contents" => Object::Reference(content_id), "Annots" => vec![Object::Reference(widget_id)]
        }));
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages", "Kids" => vec![Object::Reference(page_id)], "Count" => 1
            }),
        );
        let acro_form_id =
            document.add_object(dictionary! { "Fields" => vec![Object::Reference(field_id)] });
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog", "Pages" => Object::Reference(pages_id), "AcroForm" => Object::Reference(acro_form_id)
        });
        document.trailer.set("Root", Object::Reference(catalog_id));
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn writes_text_value_and_non_empty_widget_appearance_in_isolated_copy() {
        let source = text_form_fixture(false);
        let source_digest = digest(&source);
        let changes = vec![PdfFormTextChange {
            field_name: "customer.name".into(),
            value: "Bob (QA)".into(),
        }];
        let (report, output) = build_pdf_text_form_copy(&source, &source_digest, &changes).unwrap();
        let output = output.unwrap();
        assert_eq!(report.status, "isolated_verified");
        assert!(report.field_tree_verified);
        assert!(report.widget_appearances_verified);
        assert_eq!(report.appearance_streams_written, 1);
        assert_ne!(source, output);
        assert_eq!(digest(&source), source_digest);
        let reopened = inspect_pdf_forms(&output).unwrap();
        assert_eq!(reopened.fields[0].value.as_deref(), Some("Bob (QA)"));
        assert!(reopened.widgets[0].has_normal_appearance);
    }

    #[test]
    fn blocks_actions_stale_digest_and_unrenderable_unicode() {
        let risky = text_form_fixture(true);
        let (report, output) = build_pdf_text_form_copy(
            &risky,
            &digest(&risky),
            &[PdfFormTextChange {
                field_name: "customer.name".into(),
                value: "Bob".into(),
            }],
        )
        .unwrap();
        assert_eq!(report.status, "blocked");
        assert!(output.is_none());
        let source = text_form_fixture(false);
        assert!(build_pdf_text_form_copy(
            &source,
            &"0".repeat(64),
            &[PdfFormTextChange {
                field_name: "customer.name".into(),
                value: "Bob".into()
            }],
        )
        .is_err());
        assert!(build_pdf_text_form_copy(
            &source,
            &digest(&source),
            &[PdfFormTextChange {
                field_name: "customer.name".into(),
                value: "中文".into()
            }],
        )
        .is_err());
    }
}
