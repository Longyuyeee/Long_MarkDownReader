use crate::formats::json::{analyze_json_source, JsonPathEntry};
use jsonc_parser::{parse_to_serde_value, ParseOptions};
use serde::Serialize;
use serde_json::Value;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_SCHEMA_SOURCE_BYTES: usize = 1024 * 1024;
const MAX_SCHEMA_NODES: usize = 50_000;
const MAX_SCHEMA_REFERENCES: usize = 64;
const MAX_SCHEMA_DIAGNOSTICS: usize = 200;
const DRAFT_2020_12: &str = "https://json-schema.org/draft/2020-12/schema";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JsonSchemaDiagnostic {
    pub severity: String,
    pub code: String,
    pub message: String,
    pub keyword: String,
    pub instance_pointer: String,
    pub source_path: String,
    pub schema_path: String,
    pub start: usize,
    pub end: usize,
    pub line: usize,
    pub column: usize,
    pub provenance: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JsonSchemaValidation {
    pub status: String,
    pub schema_applied: bool,
    pub schema_path: Option<String>,
    pub draft: Option<String>,
    pub diagnostics: Vec<JsonSchemaDiagnostic>,
    pub diagnostics_truncated: bool,
}

pub fn local_schema_sidecar_path(document_path: &Path) -> Option<PathBuf> {
    let extension = document_path.extension()?.to_str()?.to_ascii_lowercase();
    if extension != "json" && extension != "jsonc" {
        return None;
    }
    let stem = document_path.file_stem()?.to_str()?;
    if stem.to_ascii_lowercase().ends_with(".schema") {
        return None;
    }
    Some(document_path.with_extension("schema.json"))
}

pub fn validate_with_local_schema(
    document_path: &Path,
    document_source: &str,
    jsonc: bool,
) -> Result<JsonSchemaValidation, String> {
    let Some(sidecar_path) = local_schema_sidecar_path(document_path) else {
        return Ok(no_schema());
    };
    if !sidecar_path.exists() {
        return Ok(no_schema());
    }

    ensure_same_real_parent(document_path, &sidecar_path)?;
    let schema_source = read_bounded_utf8(&sidecar_path, MAX_SCHEMA_SOURCE_BYTES)?;
    validate_json_schema_source(
        document_source,
        jsonc,
        &schema_source,
        sidecar_path.to_string_lossy().as_ref(),
    )
}

pub fn validate_json_schema_source(
    document_source: &str,
    jsonc: bool,
    schema_source: &str,
    schema_path: &str,
) -> Result<JsonSchemaValidation, String> {
    if schema_source.len() > MAX_SCHEMA_SOURCE_BYTES {
        return Err(format!(
            "JSON Schema 超过 {MAX_SCHEMA_SOURCE_BYTES} 字节读取上限"
        ));
    }

    let analysis = analyze_json_source(document_source, jsonc);
    if !analysis.valid {
        return Err("JSON/JSONC 源码存在语法或资源限制错误，未执行 Schema 校验".into());
    }
    let instance: Value = parse_to_serde_value(document_source, &parse_options(jsonc))
        .map_err(|error| format!("JSON/JSONC 转换失败：{error}"))?;
    let schema: Value = serde_json::from_str(schema_source)
        .map_err(|error| format!("本地 JSON Schema 不是有效的严格 JSON：{error}"))?;

    validate_schema_policy(&schema)?;
    let validator = jsonschema::options()
        .with_draft(jsonschema::Draft::Draft202012)
        .build(&schema)
        .map_err(|error| format!("本地 JSON Schema 无法编译：{}", error.masked()))?;

    let mut diagnostics = Vec::new();
    let mut diagnostics_truncated = false;
    for error in validator.iter_errors(&instance) {
        if diagnostics.len() >= MAX_SCHEMA_DIAGNOSTICS {
            diagnostics_truncated = true;
            break;
        }
        let instance_pointer = error.instance_path().to_string();
        let source_path = pointer_to_json_path(&instance_pointer, &analysis.paths)?;
        let location = nearest_path_entry(&analysis.paths, &source_path);
        let keyword = error.kind().keyword().to_string();
        diagnostics.push(JsonSchemaDiagnostic {
            severity: "error".into(),
            code: format!("schema-{keyword}"),
            message: error.masked_with("[文档值已隐藏]").to_string(),
            keyword,
            instance_pointer,
            source_path: location.map_or_else(|| source_path.clone(), |entry| entry.path.clone()),
            schema_path: error.schema_path().to_string(),
            start: location.map_or(0, |entry| entry.start),
            end: location.map_or(0, |entry| entry.end),
            line: location.map_or(1, |entry| entry.line),
            column: location.map_or(1, |entry| entry.column),
            provenance: "local-sibling-sidecar".into(),
        });
    }

    Ok(JsonSchemaValidation {
        status: if diagnostics.is_empty() {
            "valid".into()
        } else {
            "invalid".into()
        },
        schema_applied: true,
        schema_path: Some(schema_path.into()),
        draft: Some(DRAFT_2020_12.into()),
        diagnostics,
        diagnostics_truncated,
    })
}

fn no_schema() -> JsonSchemaValidation {
    JsonSchemaValidation {
        status: "no-schema".into(),
        schema_applied: false,
        schema_path: None,
        draft: None,
        diagnostics: Vec::new(),
        diagnostics_truncated: false,
    }
}

fn read_bounded_utf8(path: &Path, max_bytes: usize) -> Result<String, String> {
    let file = File::open(path).map_err(|error| format!("无法读取本地 JSON Schema：{error}"))?;
    let mut bytes = Vec::new();
    file.take((max_bytes + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("无法读取本地 JSON Schema：{error}"))?;
    if bytes.len() > max_bytes {
        return Err(format!("JSON Schema 超过 {max_bytes} 字节读取上限"));
    }
    String::from_utf8(bytes).map_err(|_| "本地 JSON Schema 必须使用 UTF-8 编码".into())
}

fn ensure_same_real_parent(document_path: &Path, schema_path: &Path) -> Result<(), String> {
    let document = document_path
        .canonicalize()
        .map_err(|error| format!("无法确认 JSON 文档真实路径：{error}"))?;
    let schema = schema_path
        .canonicalize()
        .map_err(|error| format!("无法确认 JSON Schema 真实路径：{error}"))?;
    if document.parent() != schema.parent() {
        return Err("JSON Schema 必须是文档真实目录内的同名同级文件，拒绝跨目录符号链接".into());
    }
    Ok(())
}

fn validate_schema_policy(schema: &Value) -> Result<(), String> {
    if let Some(declared_draft) = schema.get("$schema") {
        let Some(declared_draft) = declared_draft.as_str() else {
            return Err("JSON Schema 的 $schema 必须是字符串".into());
        };
        if declared_draft.trim_end_matches('#') != DRAFT_2020_12 {
            return Err("M7-1 仅接受 JSON Schema Draft 2020-12".into());
        }
    }

    let mut node_count = 0usize;
    let mut reference_count = 0usize;
    inspect_schema_node(schema, &mut node_count, &mut reference_count)
}

fn inspect_schema_node(
    value: &Value,
    node_count: &mut usize,
    reference_count: &mut usize,
) -> Result<(), String> {
    *node_count += 1;
    if *node_count > MAX_SCHEMA_NODES {
        return Err(format!("JSON Schema 节点数超过 {MAX_SCHEMA_NODES} 个上限"));
    }
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                if key == "$ref" || key == "$dynamicRef" {
                    *reference_count += 1;
                    if *reference_count > MAX_SCHEMA_REFERENCES {
                        return Err(format!(
                            "JSON Schema 引用数超过 {MAX_SCHEMA_REFERENCES} 个上限"
                        ));
                    }
                    let Some(reference) = child.as_str() else {
                        return Err(format!("JSON Schema 的 {key} 必须是字符串"));
                    };
                    if !reference.starts_with('#') {
                        return Err(format!(
                            "M7-1 仅允许 # 开头的 Schema 内部引用，已拒绝：{reference}"
                        ));
                    }
                }
                inspect_schema_node(child, node_count, reference_count)?;
            }
        }
        Value::Array(items) => {
            for child in items {
                inspect_schema_node(child, node_count, reference_count)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn pointer_to_json_path(pointer: &str, paths: &[JsonPathEntry]) -> Result<String, String> {
    if pointer.is_empty() {
        return Ok("$".into());
    }
    if !pointer.starts_with('/') {
        return Err("Schema 校验器返回了无效的实例 JSON Pointer".into());
    }
    let mut path = "$".to_string();
    for raw_segment in pointer[1..].split('/') {
        let segment = decode_pointer_segment(raw_segment)?;
        let parent_is_array = paths
            .iter()
            .find(|entry| entry.path == path)
            .is_some_and(|entry| entry.kind == "array");
        if parent_is_array
            && segment.chars().all(|character| character.is_ascii_digit())
            && !segment.is_empty()
        {
            path.push('[');
            path.push_str(&segment);
            path.push(']');
        } else if is_identifier(&segment) {
            path.push('.');
            path.push_str(&segment);
        } else {
            path.push_str("[\"");
            path.push_str(&segment.replace('\\', "\\\\").replace('"', "\\\""));
            path.push_str("\"]");
        }
    }
    Ok(path)
}

fn decode_pointer_segment(segment: &str) -> Result<String, String> {
    let mut decoded = String::with_capacity(segment.len());
    let mut characters = segment.chars();
    while let Some(character) = characters.next() {
        if character != '~' {
            decoded.push(character);
            continue;
        }
        match characters.next() {
            Some('0') => decoded.push('~'),
            Some('1') => decoded.push('/'),
            _ => return Err("Schema 校验器返回了包含无效转义的 JSON Pointer".into()),
        }
    }
    Ok(decoded)
}

fn is_identifier(value: &str) -> bool {
    let mut characters = value.chars();
    characters
        .next()
        .is_some_and(|character| character.is_ascii_alphabetic() || character == '_')
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn nearest_path_entry<'a>(
    paths: &'a [JsonPathEntry],
    requested: &str,
) -> Option<&'a JsonPathEntry> {
    let mut candidate = requested.to_string();
    loop {
        if let Some(entry) = paths.iter().find(|entry| entry.path == candidate) {
            return Some(entry);
        }
        if candidate == "$" {
            return None;
        }
        candidate = parent_json_path(&candidate).unwrap_or_else(|| "$".into());
    }
}

fn parent_json_path(path: &str) -> Option<String> {
    if path == "$" {
        return None;
    }
    if path.ends_with(']') {
        let start = path.rfind('[')?;
        return Some(path[..start].to_string());
    }
    path.rfind('.').map(|index| path[..index].to_string())
}

fn parse_options(jsonc: bool) -> ParseOptions {
    ParseOptions {
        allow_comments: jsonc,
        allow_trailing_commas: jsonc,
        allow_loose_object_property_names: false,
        allow_missing_commas: false,
        allow_single_quoted_strings: false,
        allow_hexadecimal_numbers: false,
        allow_unary_plus_numbers: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    const SCHEMA: &str = r##"{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "port": { "type": "integer" },
        "enabled": { "type": "boolean" }
      },
      "required": ["port", "enabled"]
    }"##;

    #[test]
    fn sidecar_name_is_deterministic_and_schema_files_do_not_recurse() {
        assert_eq!(
            local_schema_sidecar_path(Path::new("settings.jsonc")),
            Some(PathBuf::from("settings.schema.json"))
        );
        assert_eq!(
            local_schema_sidecar_path(Path::new("settings.schema.json")),
            None
        );
        assert_eq!(local_schema_sidecar_path(Path::new("settings.yaml")), None);
    }

    #[test]
    fn no_sidecar_means_no_business_diagnostics() {
        let path = unique_temp_dir().join("missing.json");
        let result = validate_with_local_schema(&path, "{}", false).unwrap();
        assert_eq!(result.status, "no-schema");
        assert!(!result.schema_applied);
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn valid_json_and_jsonc_are_supported() {
        let json = validate_json_schema_source(
            r#"{"port": 8080, "enabled": true}"#,
            false,
            SCHEMA,
            "settings.schema.json",
        )
        .unwrap();
        assert_eq!(json.status, "valid");

        let jsonc = validate_json_schema_source(
            "{\n  // local only\n  \"port\": 8080,\n  \"enabled\": true,\n}",
            true,
            SCHEMA,
            "settings.schema.json",
        )
        .unwrap();
        assert_eq!(jsonc.status, "valid");
    }

    #[test]
    fn schema_errors_map_to_existing_source_paths_and_hide_values() {
        let source = "{\n  \"port\": \"secret-port\",\n  \"enabled\": \"secret-enabled\"\n}";
        let result =
            validate_json_schema_source(source, false, SCHEMA, "settings.schema.json").unwrap();
        assert_eq!(result.status, "invalid");
        assert_eq!(result.diagnostics.len(), 2);
        assert!(result
            .diagnostics
            .iter()
            .any(|item| item.source_path == "$.port" && item.line == 2));
        assert!(result
            .diagnostics
            .iter()
            .any(|item| item.source_path == "$.enabled" && item.line == 3));
        assert!(result
            .diagnostics
            .iter()
            .all(|item| item.provenance == "local-sibling-sidecar"));
        assert!(result
            .diagnostics
            .iter()
            .all(|item| !item.message.contains("secret")));
    }

    #[test]
    fn numeric_object_keys_are_not_mistaken_for_array_indexes() {
        let result = validate_json_schema_source(
            r#"{"0":"wrong"}"#,
            false,
            r#"{"type":"object","properties":{"0":{"type":"integer"}}}"#,
            "numeric-key.schema.json",
        )
        .unwrap();
        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(result.diagnostics[0].source_path, "$[\"0\"]");
        assert_eq!(result.diagnostics[0].column, 6);
    }

    #[test]
    fn internal_references_work_and_external_references_are_rejected() {
        let internal = r##"{
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$defs": { "port": { "type": "integer" } },
          "$ref": "#/$defs/port"
        }"##;
        assert_eq!(
            validate_json_schema_source("8080", false, internal, "local.schema.json")
                .unwrap()
                .status,
            "valid"
        );
        for reference in [
            "https://example.invalid/schema.json",
            "file:///tmp/schema.json",
            "other.schema.json",
        ] {
            let schema = format!(r#"{{"$ref":"{reference}"}}"#);
            let error =
                validate_json_schema_source("{}", false, &schema, "local.schema.json").unwrap_err();
            assert!(error.contains("仅允许 # 开头"));
        }
    }

    #[test]
    fn malformed_unsupported_and_oversized_schemas_fail_closed() {
        assert!(validate_json_schema_source("{}", false, "{", "bad.schema.json").is_err());
        assert!(validate_json_schema_source(
            "{}",
            false,
            r#"{"$schema":"http://json-schema.org/draft-07/schema#"}"#,
            "old.schema.json"
        )
        .unwrap_err()
        .contains("Draft 2020-12"));
        let oversized = " ".repeat(MAX_SCHEMA_SOURCE_BYTES + 1);
        assert!(
            validate_json_schema_source("{}", false, &oversized, "huge.schema.json")
                .unwrap_err()
                .contains("读取上限")
        );
    }

    #[test]
    fn diagnostics_are_capped() {
        let source = format!(
            "[{}]",
            std::iter::repeat_n("\"invalid\"", MAX_SCHEMA_DIAGNOSTICS + 20)
                .collect::<Vec<_>>()
                .join(",")
        );
        let schema = r#"{"type":"array","items":{"type":"integer"}}"#;
        let result =
            validate_json_schema_source(&source, false, schema, "items.schema.json").unwrap();
        assert_eq!(result.diagnostics.len(), MAX_SCHEMA_DIAGNOSTICS);
        assert!(result.diagnostics_truncated);
    }

    #[test]
    fn real_sidecar_validation_is_read_only() {
        let directory = unique_temp_dir();
        fs::create_dir_all(&directory).unwrap();
        let document_path = directory.join("settings.jsonc");
        let schema_path = directory.join("settings.schema.json");
        let source = "{\n  // keep me\n  \"port\": \"wrong\",\n  \"enabled\": true,\n}";
        fs::write(&document_path, source).unwrap();
        fs::write(&schema_path, SCHEMA).unwrap();
        let before_document = Sha256::digest(fs::read(&document_path).unwrap());
        let before_schema = Sha256::digest(fs::read(&schema_path).unwrap());

        let result = validate_with_local_schema(&document_path, source, true).unwrap();

        assert_eq!(result.status, "invalid");
        assert_eq!(
            before_document[..],
            Sha256::digest(fs::read(&document_path).unwrap())[..]
        );
        assert_eq!(
            before_schema[..],
            Sha256::digest(fs::read(&schema_path).unwrap())[..]
        );
        fs::remove_dir_all(directory).unwrap();
    }

    fn unique_temp_dir() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("long-markdown-reader-schema-{nonce}"))
    }
}
