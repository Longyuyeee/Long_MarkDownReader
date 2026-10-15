use crate::services::{reliable_write::write_new_bytes, workspace_guard::WorkspaceGuard};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    sync::LazyLock,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTemplate {
    pub id: String,
    pub name: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PortableNoteTemplate {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTemplateBundle {
    pub kind: String,
    pub schema_version: u32,
    pub templates: Vec<PortableNoteTemplate>,
}

const MAX_BUNDLE_BYTES: u64 = 17 * 1024 * 1024;

fn validate_bundle(bundle: &mut NoteTemplateBundle) -> Result<(), String> {
    if bundle.kind != "longedit-note-templates" || bundle.schema_version != 1 {
        return Err("这不是支持的 Long编辑笔记模板文件".into());
    }
    if bundle.templates.is_empty() || bundle.templates.len() > 64 {
        return Err("模板文件需要包含 1–64 个模板".into());
    }
    for template in &mut bundle.templates {
        template.name = template.name.trim().to_string();
        if template.name.is_empty() || template.name.chars().count() > 80 || template.content.len() > 256 * 1024 {
            return Err("模板名称过长、为空或正文超过 256 KiB".into());
        }
    }
    Ok(())
}

fn json_path(path: &str) -> Result<&std::path::Path, String> {
    let path = std::path::Path::new(path);
    if !path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("json")) {
        return Err("请选择 .json 笔记模板文件".into());
    }
    Ok(path)
}

#[tauri::command]
pub fn export_note_template_bundle(target_path: String, templates: Vec<PortableNoteTemplate>) -> Result<(), String> {
    let target = json_path(&target_path)?;
    let mut bundle = NoteTemplateBundle { kind: "longedit-note-templates".into(), schema_version: 1, templates };
    validate_bundle(&mut bundle)?;
    let content = serde_json::to_string_pretty(&bundle).map_err(|error| error.to_string())?;
    if content.len() as u64 > MAX_BUNDLE_BYTES { return Err("模板文件过大，请分批导出".into()); }
    // The Save dialog confirms replacement; use the same atomic writer as explicit saves.
    super::super::services::reliable_write::write_utf8(target, &content)
}

#[tauri::command]
pub fn read_note_template_bundle(source_path: String) -> Result<NoteTemplateBundle, String> {
    use std::io::Read;
    let target = json_path(&source_path)?;
    let file = fs::File::open(target).map_err(|error| format!("无法读取模板文件：{error}"))?;
    let mut bytes = Vec::new();
    file.take(MAX_BUNDLE_BYTES + 1).read_to_end(&mut bytes).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_BUNDLE_BYTES { return Err("模板文件超过 17 MiB，请分批导入".into()); }
    let content = std::str::from_utf8(&bytes).map_err(|_| "模板文件需要使用 UTF-8 编码".to_string())?;
    let mut bundle: NoteTemplateBundle = serde_json::from_str(content.trim_start_matches('\u{feff}')).map_err(|_| "无法识别模板内容，请选择导出的笔记模板 JSON 文件".to_string())?;
    validate_bundle(&mut bundle)?;
    Ok(bundle)
}

pub fn validate_note_templates(
    templates: &[NoteTemplate],
    defaults: &HashMap<String, String>,
) -> Result<(), String> {
    if templates.len() > 64 {
        return Err("自定义模板不能超过 64 个".into());
    }
    let mut ids = HashSet::new();
    let mut names: HashSet<String> = ["空白笔记", "会议纪要", "周报", "读书笔记"]
        .iter()
        .map(|name| name.to_string())
        .collect();
    for template in templates {
        if template.id.is_empty()
            || template.id.len() > 64
            || template.id.starts_with("builtin:")
            || !template
                .id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            || !ids.insert(template.id.as_str())
        {
            return Err("模板标识无效或重复".into());
        }
        let name = template.name.trim();
        if name.is_empty() || name.chars().count() > 80 || !names.insert(name.to_lowercase()) {
            return Err("模板名称为空、过长或重复".into());
        }
        if template.content.len() > 256 * 1024 {
            return Err("模板正文不能超过 256 KiB".into());
        }
    }
    for id in defaults.values() {
        if !matches!(
            id.as_str(),
            "builtin:blank" | "builtin:1" | "builtin:2" | "builtin:3"
        ) && !ids.contains(id.as_str())
        {
            return Err("默认模板已不存在，请重新选择".into());
        }
    }
    Ok(())
}

pub fn render_note_template(content: &str, title: &str, date: &str, time: &str) -> String {
    static VARIABLES: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"\{\{\s*(title|date|time)\s*\}\}").unwrap());
    VARIABLES
        .replace_all(content, |capture: &regex::Captures| {
            match &capture[1] {
                "title" => title,
                "date" => date,
                "time" => time,
                _ => unreachable!(),
            }
            .to_owned()
        })
        .into_owned()
}

#[tauri::command]
pub async fn create_note_from_template(
    library_root: String,
    target_dir: String,
    name: String,
    content: String,
) -> Result<String, String> {
    if content.len() > 256 * 1024 {
        return Err("模板正文不能超过 256 KiB".into());
    }
    let base = crate::sanitize_filename(name.trim());
    if base.is_empty() || base.chars().count() > 80 {
        return Err("请填写有效的模板名称".into());
    }
    super::files::validate_item_name(&format!("{base}.md"))?;
    let guard = WorkspaceGuard::new(library_root)?;
    let directory = guard.resolve_for_write(target_dir)?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建笔记目录：{error}"))?;
    let now = chrono::Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M").to_string();
    for index in 0..10000 {
        let title = if index == 0 {
            base.clone()
        } else {
            format!("{base} {index}")
        };
        let path = guard.resolve_for_write(directory.join(format!("{title}.md")))?;
        if path.exists() {
            continue;
        }
        let body = render_note_template(&content, &title, &date, &time);
        write_new_bytes(&path, body.as_bytes())?;
        return Ok(path.to_string_lossy().into_owned());
    }
    Err("同名笔记过多，请修改模板名称后重试".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn bundle_fixture() -> std::path::PathBuf {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-template-bundle-{}-{nonce}", std::process::id()));
        fs::create_dir(&root).unwrap(); root
    }
    #[test]
    fn portable_bundle_round_trips_authored_content_and_explicit_overwrite() {
        let root = bundle_fixture(); let target = root.join("模板.json").to_string_lossy().to_string();
        let entries = || vec![PortableNoteTemplate { name: " 沟通🙂 ".into(), content: "# {{title}}\r\n{{date}}".into() }];
        export_note_template_bundle(target.clone(), entries()).unwrap();
        let bundle = read_note_template_bundle(target.clone()).unwrap();
        assert_eq!(bundle.templates[0].name, "沟通🙂");
        assert_eq!(bundle.templates[0].content, entries()[0].content);
        let raw = fs::read_to_string(&target).unwrap();
        assert!(!raw.contains("defaultNoteTemplates") && !raw.contains("\"id\""));
        export_note_template_bundle(target.clone(), vec![PortableNoteTemplate { name: "更新".into(), content: "".into() }]).unwrap();
        assert_eq!(read_note_template_bundle(target.clone()).unwrap().templates[0].name, "更新");
        let saved = fs::read(&target).unwrap();
        assert!(export_note_template_bundle(target.clone(), vec![]).is_err());
        assert_eq!(fs::read(&target).unwrap(), saved);
        let note = root.join("原文.md"); fs::write(&note, "保留").unwrap();
        assert!(export_note_template_bundle(note.to_string_lossy().into(), entries()).is_err());
        assert_eq!(fs::read_to_string(note).unwrap(), "保留");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn portable_bundle_accepts_utf8_bom_and_reports_unrecognized_files() {
        let root = bundle_fixture(); let target = root.join("模板.json").to_string_lossy().to_string();
        fs::write(&target, "\u{feff}{\"kind\":\"longedit-note-templates\",\"schemaVersion\":1,\"templates\":[{\"name\":\"周报\",\"content\":\"内容\"}]}").unwrap();
        assert_eq!(read_note_template_bundle(target.clone()).unwrap().templates[0].name, "周报");
        for invalid in ["{}", "not json", "{\"kind\":\"longedit-note-templates\",\"schemaVersion\":2,\"templates\":[]}"] {
            fs::write(&target, invalid).unwrap(); assert!(read_note_template_bundle(target.clone()).is_err());
        }
        fs::write(&target, [0xff, 0xfe]).unwrap(); assert!(read_note_template_bundle(target.clone()).unwrap_err().contains("UTF-8"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn portable_bundle_bounds_large_files_and_template_content() {
        let root = bundle_fixture(); let target = root.join("模板.json").to_string_lossy().to_string();
        fs::File::create(&target).unwrap().set_len(MAX_BUNDLE_BYTES + 1).unwrap();
        assert!(read_note_template_bundle(target.clone()).unwrap_err().contains("17 MiB"));
        assert!(export_note_template_bundle(target.clone(), vec![PortableNoteTemplate { name: "过大".into(), content: "中".repeat(90000) }]).is_err());
        assert!(export_note_template_bundle(target, vec![PortableNoteTemplate { name: " ".into(), content: "".into() }]).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn placeholders_are_local_and_single_pass() {
        assert_eq!(
            render_note_template(
                "# {{ title }}\n{{date}} {{ time }} {{other}} {{",
                "{{date}} 日志",
                "2026-10-15",
                "09:08"
            ),
            "# {{date}} 日志\n2026-10-15 09:08 {{other}} {{"
        );
        assert_eq!(
            render_note_template("{{unknown {{title}} }}", "日志", "", ""),
            "{{unknown 日志 }}"
        );
    }
    #[test]
    fn old_config_defaults_and_template_config_round_trip() {
        let mut config: super::super::config::AppConfig = serde_json::from_str("{}").unwrap();
        assert!(config.note_templates.is_empty());
        config.note_templates.push(NoteTemplate {
            id: "my-template".into(),
            name: "客户记录".into(),
            content: "# {{title}}\n{{date}}".into(),
        });
        config
            .default_note_templates
            .insert("C:/notes".into(), "my-template".into());
        let text = serde_json::to_string(&config).unwrap();
        let restored: super::super::config::AppConfig = serde_json::from_str(&text).unwrap();
        assert_eq!(
            restored.note_templates[0].content,
            config.note_templates[0].content
        );
        assert_eq!(restored.default_note_templates["C:/notes"], "my-template");
    }
    #[test]
    fn duplicate_names_and_deleted_defaults_are_rejected() {
        let template = NoteTemplate {
            id: "sample".into(),
            name: "记录".into(),
            content: "".into(),
        };
        let mut defaults = HashMap::from([("C:/notes".into(), "sample".into())]);
        assert!(validate_note_templates(std::slice::from_ref(&template), &defaults).is_ok());
        assert!(validate_note_templates(&[], &defaults).is_err());
        let duplicate = NoteTemplate {
            id: "other".into(),
            ..template.clone()
        };
        assert!(validate_note_templates(&[template.clone(), duplicate], &defaults).is_err());
        defaults.clear();
        assert!(validate_note_templates(
            &[NoteTemplate {
                name: "周报".into(),
                ..template
            }],
            &defaults
        )
        .is_err());
    }
    #[test]
    fn new_notes_use_final_unique_title_and_create_missing_directory() {
        let root = std::env::temp_dir().join(format!(
            "longedit-template-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let directory = root.join("项目").join("会议");
        let create = || {
            tauri::async_runtime::block_on(create_note_from_template(
                root.to_string_lossy().into(),
                directory.to_string_lossy().into(),
                "客户记录".into(),
                "# {{title}}\n日期：{{date}}".into(),
            ))
            .unwrap()
        };
        let first = create();
        let second = create();
        assert!(fs::read_to_string(&first)
            .unwrap()
            .starts_with("# 客户记录\n日期：20"));
        assert!(fs::read_to_string(&second)
            .unwrap()
            .starts_with("# 客户记录 1\n日期：20"));
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        let result = tauri::async_runtime::block_on(create_note_from_template(
            root.to_string_lossy().into(),
            root.join("..").to_string_lossy().into(),
            "记录".into(),
            "".into(),
        ));
        assert!(result.is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
