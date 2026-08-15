use lopdf::{Dictionary, Document, Object, ObjectId};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

pub const MAX_PDF_FORM_INPUT_BYTES: usize = 128 * 1024 * 1024;
const MAX_FORM_FIELDS: usize = 10_000;
const MAX_FORM_WIDGETS: usize = 20_000;
const MAX_FIELD_DEPTH: usize = 64;
const MAX_FIELD_STRING_CHARS: usize = 4_096;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfChoiceOptionSummary {
    pub export_value: String,
    pub display_value: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFormFieldSummary {
    pub name: String,
    pub field_type: String,
    pub value: Option<String>,
    pub default_value: Option<String>,
    pub option_count: usize,
    pub button_kind: Option<String>,
    pub button_export_values: Vec<String>,
    pub choice_kind: Option<String>,
    pub choice_editable: bool,
    pub choice_multi_select: bool,
    pub choice_options: Vec<PdfChoiceOptionSummary>,
    pub selected_indices: Vec<usize>,
    pub widget_count: usize,
    pub read_only: bool,
    pub required: bool,
    pub multiline: bool,
    pub password: bool,
    pub has_actions: bool,
    pub fillable_candidate: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFormWidgetSummary {
    pub object_id: Option<String>,
    pub page: u32,
    pub field_name: String,
    pub field_type: String,
    pub linked_to_canonical_field: bool,
    pub has_normal_appearance: bool,
    pub appearance_states: Vec<String>,
    pub appearance_state: Option<String>,
    pub has_actions: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFormInspectionReport {
    pub status: String,
    pub source_digest: String,
    pub source_bytes: usize,
    pub page_count: usize,
    pub has_acro_form: bool,
    pub need_appearances: bool,
    pub field_count: usize,
    pub widget_count: usize,
    pub field_type_counts: HashMap<String, usize>,
    pub duplicate_field_names: Vec<String>,
    pub orphan_widget_count: usize,
    pub missing_appearance_count: usize,
    pub fillable_candidate_count: usize,
    pub blockers: Vec<String>,
    pub diagnostics: Vec<String>,
    pub fields: Vec<PdfFormFieldSummary>,
    pub widgets: Vec<PdfFormWidgetSummary>,
}

#[derive(Clone, Default)]
struct InheritedField {
    field_type: Option<String>,
    flags: i64,
}

struct InspectionState<'a> {
    document: &'a Document,
    fields: Vec<PdfFormFieldSummary>,
    canonical_ids: HashSet<ObjectId>,
    linked_widget_ids: HashSet<ObjectId>,
    field_names_by_id: HashMap<ObjectId, String>,
    visited_fields: HashSet<ObjectId>,
    diagnostics: HashSet<String>,
    field_actions_detected: bool,
}

fn object_id_label(id: ObjectId) -> String {
    format!("{} {} R", id.0, id.1)
}

fn pdf_string(object: &Object) -> Option<String> {
    let text = match object {
        Object::String(bytes, _) => decode_pdf_text_string(bytes),
        Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        Object::Integer(value) => value.to_string(),
        Object::Real(value) => value.to_string(),
        Object::Boolean(value) => value.to_string(),
        Object::Null => return None,
        _ => return Some("[复杂值]".into()),
    };
    Some(text.chars().take(MAX_FIELD_STRING_CHARS).collect())
}

fn decode_pdf_text_string(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xfe, 0xff]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]));
        String::from_utf16_lossy(&units.collect::<Vec<_>>())
    } else if bytes.starts_with(&[0xff, 0xfe]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]));
        String::from_utf16_lossy(&units.collect::<Vec<_>>())
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
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

fn field_flags(dictionary: &Dictionary, inherited: i64) -> i64 {
    dictionary
        .get(b"Ff")
        .ok()
        .and_then(|value| value.as_i64().ok())
        .unwrap_or(inherited)
}

fn has_actions(dictionary: &Dictionary) -> bool {
    dictionary.has(b"A") || dictionary.has(b"AA")
}

fn has_normal_appearance(document: &Document, dictionary: &Dictionary) -> bool {
    let Ok(appearance) = dictionary.get(b"AP") else {
        return false;
    };
    let Some((_, appearance)) = dictionary_for(document, appearance) else {
        return false;
    };
    let Ok(normal) = appearance.get(b"N") else {
        return false;
    };
    let Ok((_, resolved)) = document.dereference(normal) else {
        return false;
    };
    match resolved {
        Object::Stream(stream) => !stream.content.is_empty(),
        Object::Dictionary(states) => !states.is_empty(),
        _ => false,
    }
}

fn normal_appearance_states(document: &Document, dictionary: &Dictionary) -> Vec<String> {
    let mut states = dictionary
        .get(b"AP")
        .ok()
        .and_then(|appearance| dictionary_for(document, appearance))
        .and_then(|(_, appearance)| appearance.get(b"N").ok().cloned())
        .and_then(|normal| dictionary_for(document, &normal))
        .map(|(_, states)| {
            states
                .iter()
                .map(|(name, _)| String::from_utf8_lossy(name).into_owned())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    states.sort();
    states.dedup();
    states
}

fn choice_options(
    document: &Document,
    dictionary: &Dictionary,
) -> (usize, Vec<PdfChoiceOptionSummary>) {
    let Ok(options) = dictionary.get(b"Opt") else {
        return (0, Vec::new());
    };
    let values = document
        .dereference(options)
        .ok()
        .and_then(|(_, value)| value.as_array().ok())
        .cloned()
        .unwrap_or_default();
    let count = values.len().min(MAX_FORM_FIELDS);
    let parsed = values
        .into_iter()
        .take(MAX_FORM_FIELDS)
        .filter_map(|option| {
            let (_, option) = document.dereference(&option).ok()?;
            if let Ok(pair) = option.as_array() {
                if pair.len() != 2 {
                    return None;
                }
                return Some(PdfChoiceOptionSummary {
                    export_value: pdf_string(&pair[0])?,
                    display_value: pdf_string(&pair[1])?,
                });
            }
            let value = pdf_string(option)?;
            Some(PdfChoiceOptionSummary {
                export_value: value.clone(),
                display_value: value,
            })
        })
        .collect();
    (count, parsed)
}

fn selected_indices(document: &Document, dictionary: &Dictionary) -> Vec<usize> {
    dictionary
        .get(b"I")
        .ok()
        .and_then(|value| document.dereference(value).ok())
        .and_then(|(_, value)| value.as_array().ok())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_i64().ok())
                .filter_map(|value| usize::try_from(value).ok())
                .take(MAX_FORM_FIELDS)
                .collect()
        })
        .unwrap_or_default()
}

fn is_widget(dictionary: &Dictionary) -> bool {
    name_value(dictionary, b"Subtype").as_deref() == Some("Widget")
}

impl InspectionState<'_> {
    fn walk_field(
        &mut self,
        object: &Object,
        parent_name: &str,
        inherited: InheritedField,
        depth: usize,
    ) -> Result<(), String> {
        if depth > MAX_FIELD_DEPTH {
            return Err("PDF 表单字段树超过 64 层安全上限".into());
        }
        if self.fields.len() >= MAX_FORM_FIELDS {
            return Err("PDF 表单字段超过 10000 项安全上限".into());
        }
        let Some((object_id, dictionary)) = dictionary_for(self.document, object) else {
            self.diagnostics.insert("invalid_field_reference".into());
            return Ok(());
        };
        if let Some(id) = object_id {
            if !self.visited_fields.insert(id) {
                self.diagnostics.insert("field_tree_cycle_or_reuse".into());
                return Ok(());
            }
        }
        let partial_name = dictionary
            .get(b"T")
            .ok()
            .and_then(pdf_string)
            .unwrap_or_default();
        let full_name = match (parent_name.is_empty(), partial_name.is_empty()) {
            (true, true) => format!("未命名字段#{}", self.fields.len() + 1),
            (true, false) => partial_name,
            (false, true) => parent_name.to_string(),
            (false, false) => format!("{parent_name}.{partial_name}"),
        };
        let field_type = name_value(&dictionary, b"FT").or(inherited.field_type.clone());
        let flags = field_flags(&dictionary, inherited.flags);
        self.field_actions_detected |= has_actions(&dictionary);
        let kids = dictionary
            .get(b"Kids")
            .ok()
            .and_then(|value| self.document.dereference(value).ok())
            .and_then(|(_, value)| value.as_array().ok())
            .cloned()
            .unwrap_or_default();
        let mut widget_count = usize::from(is_widget(&dictionary));
        let mut child_fields = Vec::new();
        for kid in &kids {
            let Some((kid_id, kid_dictionary)) = dictionary_for(self.document, kid) else {
                self.diagnostics.insert("invalid_kid_reference".into());
                continue;
            };
            if is_widget(&kid_dictionary) {
                widget_count += 1;
                if let Some(id) = kid_id {
                    self.linked_widget_ids.insert(id);
                }
            } else {
                child_fields.push(kid.clone());
            }
        }
        let next_inherited = InheritedField {
            field_type: field_type.clone(),
            flags,
        };
        if !child_fields.is_empty() {
            for child in child_fields {
                self.walk_field(&child, &full_name, next_inherited.clone(), depth + 1)?;
            }
            return Ok(());
        }
        if let Some(id) = object_id {
            self.canonical_ids.insert(id);
            self.field_names_by_id.insert(id, full_name.clone());
        } else {
            self.diagnostics.insert("direct_field_dictionary".into());
        }
        let kind = field_type.unwrap_or_else(|| "Unknown".into());
        let supported_type = matches!(kind.as_str(), "Tx" | "Btn" | "Ch");
        let read_only = flags & 1 != 0;
        let password = flags & (1 << 13) != 0;
        let button_kind = (kind == "Btn").then(|| {
            if flags & (1 << 16) != 0 {
                "pushbutton"
            } else if flags & (1 << 15) != 0 {
                "radio"
            } else {
                "checkbox"
            }
            .to_string()
        });
        let mut button_export_values = Vec::new();
        if kind == "Btn" {
            button_export_values.extend(normal_appearance_states(self.document, &dictionary));
            for kid in &kids {
                if let Some((_, widget)) = dictionary_for(self.document, kid) {
                    button_export_values.extend(normal_appearance_states(self.document, &widget));
                }
            }
            button_export_values.retain(|value| value != "Off");
            button_export_values.sort();
            button_export_values.dedup();
        }
        let choice_kind = (kind == "Ch").then(|| {
            if flags & (1 << 17) != 0 {
                "combo"
            } else {
                "list"
            }
            .to_string()
        });
        let choice_editable = kind == "Ch" && flags & (1 << 18) != 0;
        let choice_multi_select = kind == "Ch" && flags & (1 << 21) != 0;
        let (choice_option_count, choice_options) = if kind == "Ch" {
            choice_options(self.document, &dictionary)
        } else {
            (0, Vec::new())
        };
        let field_option_count = if kind == "Btn" {
            button_export_values.len()
        } else {
            choice_option_count
        };
        let selected_choice_indices = if kind == "Ch" {
            selected_indices(self.document, &dictionary)
        } else {
            Vec::new()
        };
        self.fields.push(PdfFormFieldSummary {
            name: full_name,
            field_type: kind,
            value: if password {
                None
            } else {
                dictionary.get(b"V").ok().and_then(pdf_string)
            },
            default_value: dictionary.get(b"DV").ok().and_then(pdf_string),
            option_count: field_option_count,
            button_kind,
            button_export_values,
            choice_kind,
            choice_editable,
            choice_multi_select,
            choice_options,
            selected_indices: selected_choice_indices,
            widget_count,
            read_only,
            required: flags & 2 != 0,
            multiline: flags & (1 << 12) != 0,
            password,
            has_actions: has_actions(&dictionary),
            fillable_candidate: supported_type && !read_only && widget_count > 0,
        });
        Ok(())
    }
}

fn inherited_widget_value(
    document: &Document,
    dictionary: &Dictionary,
    key: &[u8],
) -> Option<String> {
    if let Ok(value) = dictionary.get(key) {
        return if key == b"FT" {
            value
                .as_name()
                .ok()
                .map(|v| String::from_utf8_lossy(v).into_owned())
        } else {
            pdf_string(value)
        };
    }
    let mut parent = dictionary.get(b"Parent").ok()?.as_reference().ok()?;
    let mut visited = HashSet::new();
    while visited.insert(parent) {
        let parent_dictionary = document.get_dictionary(parent).ok()?;
        if let Ok(value) = parent_dictionary.get(key) {
            return if key == b"FT" {
                value
                    .as_name()
                    .ok()
                    .map(|v| String::from_utf8_lossy(v).into_owned())
            } else {
                pdf_string(value)
            };
        }
        parent = parent_dictionary.get(b"Parent").ok()?.as_reference().ok()?;
    }
    None
}

fn document_has_javascript(document: &Document) -> bool {
    let catalog = match document.catalog() {
        Ok(value) => value,
        Err(_) => return false,
    };
    if catalog.has(b"OpenAction") || catalog.has(b"AA") {
        return true;
    }
    let Ok(names) = catalog.get(b"Names") else {
        return false;
    };
    dictionary_for(document, names).is_some_and(|(_, dictionary)| dictionary.has(b"JavaScript"))
}

pub fn inspect_pdf_forms(source: &[u8]) -> Result<PdfFormInspectionReport, String> {
    if source.is_empty() {
        return Err("PDF 文件为空".into());
    }
    if source.len() > MAX_PDF_FORM_INPUT_BYTES {
        return Err("PDF 超过表单检查的 128 MiB 安全上限".into());
    }
    let document =
        Document::load_mem(source).map_err(|error| format!("无法解析 PDF 表单结构: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(source));
    let mut blockers = Vec::new();
    if document.is_encrypted() {
        blockers.push("encrypted_pdf_unverified".into());
    }
    let signature = document.objects.values().any(|object| {
        object.as_dict().is_ok_and(|dictionary| {
            name_value(dictionary, b"Type").as_deref() == Some("Sig")
                || name_value(dictionary, b"FT").as_deref() == Some("Sig")
        })
    }) || document
        .catalog()
        .is_ok_and(|catalog| catalog.has(b"Perms"));
    if signature {
        blockers.push("digital_signature_unverified".into());
    }
    if document_has_javascript(&document) {
        blockers.push("pdf_javascript_unverified".into());
    }

    let acro_form = document
        .catalog()
        .ok()
        .and_then(|catalog| catalog.get(b"AcroForm").ok())
        .and_then(|value| dictionary_for(&document, value).map(|(_, dictionary)| dictionary));
    let has_acro_form = acro_form.is_some();
    let need_appearances = acro_form
        .as_ref()
        .and_then(|dictionary| dictionary.get(b"NeedAppearances").ok())
        .and_then(|value| value.as_bool().ok())
        .unwrap_or(false);
    if acro_form
        .as_ref()
        .is_some_and(|dictionary| dictionary.has(b"XFA"))
    {
        blockers.push("xfa_form_unverified".into());
    }

    let mut state = InspectionState {
        document: &document,
        fields: Vec::new(),
        canonical_ids: HashSet::new(),
        linked_widget_ids: HashSet::new(),
        field_names_by_id: HashMap::new(),
        visited_fields: HashSet::new(),
        diagnostics: HashSet::new(),
        field_actions_detected: false,
    };
    if let Some(acro_form) = &acro_form {
        let roots = acro_form
            .get(b"Fields")
            .ok()
            .and_then(|value| document.dereference(value).ok())
            .and_then(|(_, value)| value.as_array().ok())
            .cloned()
            .unwrap_or_default();
        for root in roots {
            state.walk_field(&root, "", InheritedField::default(), 0)?;
        }
    }

    let mut widgets = Vec::new();
    for (page_index, page_id) in document.get_pages().values().enumerate() {
        let Ok(page) = document.get_dictionary(*page_id) else {
            continue;
        };
        let annotations = page
            .get(b"Annots")
            .ok()
            .and_then(|value| document.dereference(value).ok())
            .and_then(|(_, value)| value.as_array().ok())
            .cloned()
            .unwrap_or_default();
        for annotation in annotations {
            let Some((widget_id, dictionary)) = dictionary_for(&document, &annotation) else {
                continue;
            };
            if !is_widget(&dictionary) {
                continue;
            }
            if widgets.len() >= MAX_FORM_WIDGETS {
                return Err("PDF 表单 Widget 超过 20000 项安全上限".into());
            }
            let parent_id = dictionary
                .get(b"Parent")
                .ok()
                .and_then(|value| value.as_reference().ok());
            let linked = widget_id.is_some_and(|id| {
                state.canonical_ids.contains(&id) || state.linked_widget_ids.contains(&id)
            }) || parent_id.is_some_and(|id| state.canonical_ids.contains(&id));
            let field_name = widget_id
                .and_then(|id| state.field_names_by_id.get(&id).cloned())
                .or_else(|| parent_id.and_then(|id| state.field_names_by_id.get(&id).cloned()))
                .or_else(|| inherited_widget_value(&document, &dictionary, b"T"))
                .unwrap_or_else(|| "未命名 Widget".into());
            widgets.push(PdfFormWidgetSummary {
                object_id: widget_id.map(object_id_label),
                page: (page_index + 1) as u32,
                field_name,
                field_type: inherited_widget_value(&document, &dictionary, b"FT")
                    .unwrap_or_else(|| "Unknown".into()),
                linked_to_canonical_field: linked,
                has_normal_appearance: has_normal_appearance(&document, &dictionary),
                appearance_states: normal_appearance_states(&document, &dictionary),
                appearance_state: dictionary.get(b"AS").ok().and_then(pdf_string),
                has_actions: has_actions(&dictionary),
            });
        }
    }

    let mut names = HashMap::<String, usize>::new();
    let mut field_type_counts = HashMap::new();
    for field in &state.fields {
        *names.entry(field.name.clone()).or_default() += 1;
        *field_type_counts
            .entry(field.field_type.clone())
            .or_default() += 1;
        if field.has_actions {
            blockers.push("field_actions_unverified".into());
        }
        if field.field_type == "Sig" {
            blockers.push("digital_signature_unverified".into());
        }
    }
    if state.field_actions_detected {
        blockers.push("field_actions_unverified".into());
    }
    if widgets.iter().any(|widget| widget.has_actions) {
        blockers.push("widget_actions_unverified".into());
    }
    let mut duplicate_field_names = names
        .into_iter()
        .filter_map(|(name, count)| (count > 1).then_some(name))
        .collect::<Vec<_>>();
    duplicate_field_names.sort();
    if !duplicate_field_names.is_empty() {
        blockers.push("duplicate_field_names_unverified".into());
    }
    let orphan_widget_count = widgets
        .iter()
        .filter(|widget| !widget.linked_to_canonical_field)
        .count();
    if orphan_widget_count > 0 {
        blockers.push("orphan_widgets_unverified".into());
    }
    let mut diagnostics = state.diagnostics.into_iter().collect::<Vec<_>>();
    diagnostics.sort();
    if !diagnostics.is_empty() {
        blockers.push("field_tree_ambiguity_unverified".into());
    }
    blockers.sort();
    blockers.dedup();
    let missing_appearance_count = widgets
        .iter()
        .filter(|widget| !widget.has_normal_appearance)
        .count();
    let fillable_candidate_count = if blockers.is_empty() {
        state
            .fields
            .iter()
            .filter(|field| field.fillable_candidate)
            .count()
    } else {
        0
    };
    let status = if !blockers.is_empty() {
        "blocked"
    } else if has_acro_form {
        "inspectable"
    } else {
        "no_form"
    };
    Ok(PdfFormInspectionReport {
        status: status.into(),
        source_digest,
        source_bytes: source.len(),
        page_count: document.get_pages().len(),
        has_acro_form,
        need_appearances,
        field_count: state.fields.len(),
        widget_count: widgets.len(),
        field_type_counts,
        duplicate_field_names,
        orphan_widget_count,
        missing_appearance_count,
        fillable_candidate_count,
        blockers,
        diagnostics,
        fields: state.fields,
        widgets,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{dictionary, Stream};

    fn form_fixture(duplicate: bool, orphan: bool) -> Vec<u8> {
        let mut document = Document::with_version("1.7");
        let pages_id = document.new_object_id();
        let page_id = document.new_object_id();
        let field_id = document.new_object_id();
        let widget_id = document.new_object_id();
        let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
        let mut annotations = vec![Object::Reference(widget_id)];
        let mut fields = vec![Object::Reference(field_id)];
        document.objects.insert(field_id, Object::Dictionary(dictionary! {
            "FT" => "Tx", "T" => Object::string_literal("customer.name"), "V" => Object::string_literal("Alice"),
            "Kids" => vec![Object::Reference(widget_id)]
        }));
        document.objects.insert(widget_id, Object::Dictionary(dictionary! {
            "Type" => "Annot", "Subtype" => "Widget", "Parent" => Object::Reference(field_id),
            "Rect" => vec![10.into(), 10.into(), 200.into(), 40.into()], "P" => Object::Reference(page_id)
        }));
        if duplicate {
            let duplicate_id = document.new_object_id();
            fields.push(Object::Reference(duplicate_id));
            annotations.push(Object::Reference(duplicate_id));
            document.objects.insert(duplicate_id, Object::Dictionary(dictionary! {
                "Type" => "Annot", "Subtype" => "Widget", "FT" => "Tx", "T" => Object::string_literal("customer.name"),
                "Rect" => vec![10.into(), 50.into(), 200.into(), 80.into()], "P" => Object::Reference(page_id)
            }));
        }
        if orphan {
            let orphan_id = document.new_object_id();
            annotations.push(Object::Reference(orphan_id));
            document.objects.insert(orphan_id, Object::Dictionary(dictionary! {
                "Type" => "Annot", "Subtype" => "Widget", "FT" => "Btn", "T" => Object::string_literal("orphan"),
                "Rect" => vec![10.into(), 90.into(), 30.into(), 110.into()], "P" => Object::Reference(page_id)
            }));
        }
        document.objects.insert(page_id, Object::Dictionary(dictionary! {
            "Type" => "Page", "Parent" => Object::Reference(pages_id), "MediaBox" => vec![0.into(), 0.into(), 300.into(), 300.into()],
            "Contents" => Object::Reference(content_id), "Resources" => dictionary! {}, "Annots" => annotations
        }));
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages", "Kids" => vec![Object::Reference(page_id)], "Count" => 1
            }),
        );
        let acro_form_id =
            document.add_object(dictionary! { "Fields" => fields, "NeedAppearances" => true });
        let catalog_id = document.add_object(dictionary! { "Type" => "Catalog", "Pages" => Object::Reference(pages_id), "AcroForm" => Object::Reference(acro_form_id) });
        document.trailer.set("Root", Object::Reference(catalog_id));
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    fn risky_form_fixture() -> Vec<u8> {
        let mut document = Document::load_mem(&form_fixture(false, false)).unwrap();
        let catalog_id = document
            .trailer
            .get(b"Root")
            .unwrap()
            .as_reference()
            .unwrap();
        let acro_form_id = document
            .get_dictionary(catalog_id)
            .unwrap()
            .get(b"AcroForm")
            .unwrap()
            .as_reference()
            .unwrap();
        document
            .get_dictionary_mut(acro_form_id)
            .unwrap()
            .set("XFA", Object::string_literal("unsupported"));
        document.get_dictionary_mut(catalog_id).unwrap().set(
            "OpenAction",
            dictionary! { "S" => "JavaScript", "JS" => Object::string_literal("app.alert('x')") },
        );
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    fn password_form_fixture() -> Vec<u8> {
        let mut document = Document::load_mem(&form_fixture(false, false)).unwrap();
        let field_id = document
            .objects
            .iter()
            .find_map(|(id, object)| {
                object.as_dict().ok().and_then(|dictionary| {
                    (dictionary.get(b"T").ok().and_then(pdf_string).as_deref()
                        == Some("customer.name"))
                    .then_some(*id)
                })
            })
            .unwrap();
        let field = document.get_dictionary_mut(field_id).unwrap();
        field.set("Ff", 1_i64 << 13);
        field.set("V", Object::string_literal("secret-value"));
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn inspects_canonical_fields_and_page_widgets_without_writing() {
        let source = form_fixture(false, false);
        let report = inspect_pdf_forms(&source).unwrap();
        assert_eq!(report.status, "inspectable");
        assert_eq!((report.field_count, report.widget_count), (1, 1));
        assert_eq!(report.fields[0].name, "customer.name");
        assert_eq!(report.fields[0].value.as_deref(), Some("Alice"));
        assert!(report.need_appearances);
        assert_eq!(report.missing_appearance_count, 1);
        assert_eq!(report.fillable_candidate_count, 1);
        assert!(report.widgets[0].linked_to_canonical_field);
    }

    #[test]
    fn blocks_duplicate_names_and_orphan_widgets() {
        let report = inspect_pdf_forms(&form_fixture(true, true)).unwrap();
        assert_eq!(report.status, "blocked");
        assert_eq!(report.duplicate_field_names, vec!["customer.name"]);
        assert_eq!(report.orphan_widget_count, 1);
        assert!(report
            .blockers
            .contains(&"duplicate_field_names_unverified".into()));
        assert!(report
            .blockers
            .contains(&"orphan_widgets_unverified".into()));
        assert_eq!(report.fillable_candidate_count, 0);
    }

    #[test]
    fn reports_xfa_and_document_javascript_as_write_blockers() {
        let report = inspect_pdf_forms(&risky_form_fixture()).unwrap();
        assert_eq!(report.status, "blocked");
        assert!(report.blockers.contains(&"xfa_form_unverified".into()));
        assert!(report
            .blockers
            .contains(&"pdf_javascript_unverified".into()));
        assert_eq!(report.fillable_candidate_count, 0);
    }

    #[test]
    fn does_not_expose_password_field_values() {
        let report = inspect_pdf_forms(&password_form_fixture()).unwrap();
        assert!(report.fields[0].password);
        assert_eq!(report.fields[0].value, None);
    }

    #[test]
    fn rejects_empty_and_over_budget_inputs() {
        assert!(inspect_pdf_forms(&[]).is_err());
        assert!(inspect_pdf_forms(&vec![0; MAX_PDF_FORM_INPUT_BYTES + 1]).is_err());
    }
}
