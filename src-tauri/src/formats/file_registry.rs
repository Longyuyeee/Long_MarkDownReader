use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::sync::LazyLock;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CapabilityLevel {
    Supported,
    Planned,
    Unsupported,
}

impl CapabilityLevel {
    pub fn is_supported(self) -> bool {
        self == Self::Supported
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum UserCapabilityLevel {
    CompleteEdit,
    BasicEdit,
    ReadAnnotate,
    PreviewOnly,
    ExternalOpen,
    Unsupported,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SaveMode {
    Overwrite,
    BoundedOverwrite,
    Sidecar,
    Copy,
    None,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileFormatUserCapability {
    pub level: UserCapabilityLevel,
    pub label: String,
    pub save_mode: SaveMode,
    pub description: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileFormatCapabilities {
    pub read: CapabilityLevel,
    pub edit: CapabilityLevel,
    pub create: CapabilityLevel,
    pub index: CapabilityLevel,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileFormatAdapters {
    pub reader: Option<String>,
    pub writer: Option<String>,
    pub creator: Option<String>,
    pub indexer: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileFormatCreation {
    pub default_extension: String,
    pub default_content: Option<String>,
    pub default_name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileFormatDefinition {
    pub id: String,
    pub label: String,
    pub extensions: Vec<String>,
    pub mime_types: Vec<String>,
    pub route_name: String,
    pub max_bytes: u64,
    pub capabilities: FileFormatCapabilities,
    pub user_capability: FileFormatUserCapability,
    pub external_policy: String,
    pub adapters: FileFormatAdapters,
    pub creation: Option<FileFormatCreation>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileFormatRegistry {
    pub schema_version: u32,
    pub formats: Vec<FileFormatDefinition>,
}

impl FileFormatRegistry {
    fn parse() -> Result<Self, String> {
        let registry: Self =
            serde_json::from_str(include_str!("../../../shared/file-formats.json"))
                .map_err(|error| format!("文件格式契约无法解析: {error}"))?;
        registry.validate()?;
        Ok(registry)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 2 {
            return Err(format!("不支持的文件格式契约版本 {}", self.schema_version));
        }
        let mut ids = HashSet::new();
        let mut extensions = HashSet::new();
        for format in &self.formats {
            if format.id.trim().is_empty() || !ids.insert(format.id.as_str()) {
                return Err(format!("文件格式 ID 重复或为空: {}", format.id));
            }
            if format.extensions.is_empty()
                || format.max_bytes == 0
                || format.user_capability.label.trim().is_empty()
            {
                return Err(format!("文件格式契约不完整: {}", format.id));
            }
            for extension in &format.extensions {
                if !extension.starts_with('.')
                    || extension != &extension.to_lowercase()
                    || !extensions.insert(extension.as_str())
                {
                    return Err(format!("文件扩展名无效或重复: {extension}"));
                }
            }
            if format.capabilities.edit.is_supported() != format.adapters.writer.is_some() {
                return Err(format!("编辑能力与适配器不一致: {}", format.id));
            }
            let has_creation = format.creation.is_some() && format.adapters.creator.is_some();
            if format.capabilities.create.is_supported() != has_creation {
                return Err(format!("创建能力与适配器不一致: {}", format.id));
            }
            if format.capabilities.index.is_supported() != format.adapters.indexer.is_some() {
                return Err(format!("索引能力与适配器不一致: {}", format.id));
            }
        }
        Ok(())
    }

    pub fn by_id(&self, id: &str) -> Option<&FileFormatDefinition> {
        self.formats.iter().find(|format| format.id == id)
    }

    pub fn by_path(&self, path: impl AsRef<Path>) -> Option<&FileFormatDefinition> {
        let name = path
            .as_ref()
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_lowercase();
        self.formats
            .iter()
            .flat_map(|format| {
                format
                    .extensions
                    .iter()
                    .filter(|extension| name.ends_with(extension.as_str()))
                    .map(move |extension| (extension.len(), format))
            })
            .max_by_key(|(extension_len, _)| *extension_len)
            .map(|(_, format)| format)
    }
}

static FILE_FORMAT_REGISTRY: LazyLock<Result<FileFormatRegistry, String>> =
    LazyLock::new(FileFormatRegistry::parse);

pub fn file_format_registry() -> Result<&'static FileFormatRegistry, String> {
    FILE_FORMAT_REGISTRY.as_ref().map_err(Clone::clone)
}

pub fn file_format_by_id(id: &str) -> Result<&'static FileFormatDefinition, String> {
    file_format_registry()?
        .by_id(id)
        .ok_or_else(|| format!("未知文件格式: {id}"))
}

pub fn file_format_for_path(
    path: impl AsRef<Path>,
) -> Result<&'static FileFormatDefinition, String> {
    file_format_registry()?
        .by_path(path.as_ref())
        .ok_or_else(|| "文件格式未在工作区契约中注册".to_string())
}

pub fn is_sensitive_path(path: impl AsRef<Path>) -> bool {
    let name = path
        .as_ref()
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if name == ".env" || name.starts_with(".env.") {
        return true;
    }
    if matches!(
        name.as_str(),
        "id_rsa"
            | "id_dsa"
            | "id_ecdsa"
            | "id_ed25519"
            | "credentials"
            | "credentials.json"
            | "credentials.yaml"
            | "credentials.yml"
            | "secrets.json"
            | "secrets.yaml"
            | "secrets.yml"
    ) {
        return true;
    }
    let stem = name
        .rsplit_once('.')
        .map(|(value, _)| value)
        .unwrap_or(name.as_str());
    stem.split(|character: char| !character.is_ascii_alphanumeric())
        .any(|part| matches!(part, "credential" | "credentials" | "secret" | "secrets"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_registry_is_valid_and_matches_compound_extensions() {
        let registry = file_format_registry().unwrap();
        assert_eq!(registry.schema_version, 2);
        assert_eq!(registry.by_path("DATA.TABLE.JSON").unwrap().id, "table");
        assert_eq!(
            registry.by_path("notes/archive.TABLE.JSON").unwrap().id,
            "table"
        );
        assert_eq!(
            registry.by_path("notes/readme.txt").unwrap().id,
            "plain-text"
        );
        assert_eq!(registry.by_path("config.json").unwrap().id, "json");
        assert_eq!(registry.by_path("settings.JSONC").unwrap().id, "jsonc");
        assert_eq!(registry.by_path("archive.XLS").unwrap().id, "legacy-xls");
        assert_eq!(registry.by_path("slides.PPT").unwrap().id, "legacy-ppt");
        assert_eq!(registry.by_path("budget.ODS").unwrap().id, "ods");
        assert_eq!(registry.by_path("briefing.ODP").unwrap().id, "odp");
        assert!(registry.by_path("note.md.exe").is_none());
    }

    #[test]
    fn lightweight_text_adapter_is_fully_declared_without_special_commands() {
        let format = file_format_by_id("plain-text").unwrap();
        assert!(format.capabilities.read.is_supported());
        assert!(format.capabilities.edit.is_supported());
        assert!(format.capabilities.create.is_supported());
        assert!(format.capabilities.index.is_supported());
        assert_eq!(
            format.user_capability.level,
            UserCapabilityLevel::CompleteEdit
        );
        assert_eq!(format.user_capability.save_mode, SaveMode::Overwrite);
        assert_eq!(format.route_name, "TextEditor");
        assert_eq!(format.adapters.reader.as_deref(), Some("text"));
        assert_eq!(format.adapters.indexer.as_deref(), Some("text"));
    }

    #[test]
    fn json_source_formats_are_basic_edit_and_preserve_compound_routing() {
        for id in ["json", "jsonc"] {
            let format = file_format_by_id(id).unwrap();
            assert!(format.capabilities.read.is_supported());
            assert_eq!(format.capabilities.edit, CapabilityLevel::Supported);
            assert_eq!(format.capabilities.create, CapabilityLevel::Supported);
            assert_eq!(format.capabilities.index, CapabilityLevel::Supported);
            assert_eq!(format.route_name, "JsonEditor");
            assert_eq!(format.adapters.reader.as_deref(), Some("text"));
            assert_eq!(format.adapters.writer.as_deref(), Some("text"));
            assert_eq!(format.adapters.creator.as_deref(), Some("text-template"));
            assert_eq!(format.adapters.indexer.as_deref(), Some("text"));
            assert_eq!(
                format.creation.as_ref().unwrap().default_content.as_deref(),
                Some("{}\n")
            );
            assert_eq!(format.user_capability.level, UserCapabilityLevel::BasicEdit);
            assert_eq!(format.user_capability.save_mode, SaveMode::Overwrite);
        }

        assert_eq!(
            file_format_registry()
                .unwrap()
                .by_path("records.table.json")
                .unwrap()
                .id,
            "table"
        );
    }

    #[test]
    fn log_format_is_bounded_read_only_and_searchable() {
        let format = file_format_by_id("log").unwrap();
        assert!(format.capabilities.read.is_supported());
        assert_eq!(format.capabilities.edit, CapabilityLevel::Planned);
        assert_eq!(format.capabilities.create, CapabilityLevel::Unsupported);
        assert!(format.capabilities.index.is_supported());
        assert_eq!(format.route_name, "LogViewer");
        assert_eq!(format.adapters.reader.as_deref(), Some("text"));
        assert_eq!(format.adapters.writer, None);
        assert_eq!(format.adapters.indexer.as_deref(), Some("text"));
        assert_eq!(
            format.user_capability.level,
            UserCapabilityLevel::PreviewOnly
        );
        assert_eq!(format.user_capability.save_mode, SaveMode::None);
        assert_eq!(
            file_format_registry()
                .unwrap()
                .by_path("service/output.LOG")
                .unwrap()
                .id,
            "log"
        );
    }

    #[test]
    fn yaml_format_is_basic_edit_searchable_and_routes_both_extensions() {
        let format = file_format_by_id("yaml").unwrap();
        assert!(format.capabilities.read.is_supported());
        assert!(format.capabilities.edit.is_supported());
        assert!(format.capabilities.create.is_supported());
        assert!(format.capabilities.index.is_supported());
        assert_eq!(format.route_name, "YamlEditor");
        assert_eq!(format.adapters.reader.as_deref(), Some("text"));
        assert_eq!(format.adapters.writer.as_deref(), Some("text"));
        assert_eq!(format.adapters.creator.as_deref(), Some("text-template"));
        assert_eq!(format.adapters.indexer.as_deref(), Some("text"));
        assert_eq!(
            format.user_capability.level,
            UserCapabilityLevel::CompleteEdit
        );
        assert_eq!(format.user_capability.save_mode, SaveMode::Overwrite);
        assert_eq!(
            format
                .creation
                .as_ref()
                .map(|creation| creation.default_extension.as_str()),
            Some(".yaml")
        );
        assert_eq!(
            file_format_registry()
                .unwrap()
                .by_path("config/service.YAML")
                .unwrap()
                .id,
            "yaml"
        );
        assert_eq!(
            file_format_registry()
                .unwrap()
                .by_path("config/service.yml")
                .unwrap()
                .id,
            "yaml"
        );
    }

    #[test]
    fn xml_format_is_basic_edit_searchable_and_independently_routed() {
        let format = file_format_by_id("xml").unwrap();
        assert!(format.capabilities.read.is_supported());
        assert!(format.capabilities.edit.is_supported());
        assert!(format.capabilities.create.is_supported());
        assert!(format.capabilities.index.is_supported());
        assert_eq!(format.route_name, "XmlEditor");
        assert_eq!(format.adapters.reader.as_deref(), Some("text"));
        assert_eq!(format.adapters.writer.as_deref(), Some("text"));
        assert_eq!(format.adapters.creator.as_deref(), Some("text-template"));
        assert_eq!(format.adapters.indexer.as_deref(), Some("text"));
        assert_eq!(
            format.user_capability.level,
            UserCapabilityLevel::CompleteEdit
        );
        assert_eq!(format.user_capability.save_mode, SaveMode::Overwrite);
        assert_eq!(
            format
                .creation
                .as_ref()
                .map(|creation| creation.default_extension.as_str()),
            Some(".xml")
        );
        assert_eq!(
            file_format_registry()
                .unwrap()
                .by_path("config/schema.XML")
                .unwrap()
                .id,
            "xml"
        );
    }

    #[test]
    fn toml_format_has_complete_daily_management_contract() {
        let format = file_format_by_id("toml").unwrap();
        assert!(format.capabilities.read.is_supported());
        assert!(format.capabilities.edit.is_supported());
        assert!(format.capabilities.create.is_supported());
        assert!(format.capabilities.index.is_supported());
        assert_eq!(format.route_name, "TomlEditor");
        assert_eq!(format.adapters.reader.as_deref(), Some("text"));
        assert_eq!(format.adapters.writer.as_deref(), Some("text"));
        assert_eq!(format.adapters.creator.as_deref(), Some("text-template"));
        assert_eq!(format.adapters.indexer.as_deref(), Some("text"));
        assert_eq!(
            format.user_capability.level,
            UserCapabilityLevel::CompleteEdit
        );
        assert_eq!(file_format_for_path("config/app.TOML").unwrap().id, "toml");
    }

    #[test]
    fn sensitive_paths_cover_env_and_explicit_credential_names_without_broad_false_positives() {
        for path in [
            ".env",
            "config/.env.production",
            "credentials.json",
            "deploy-secrets.yaml",
            "keys/client_credentials.yml",
            ".ssh/id_ed25519",
        ] {
            assert!(is_sensitive_path(path), "{path} should be sensitive");
        }
        for path in ["secretary-notes.md", "tokenizer.rs", "credentialing.md"] {
            assert!(!is_sensitive_path(path), "{path} should remain indexable");
        }
    }

    #[test]
    fn common_configuration_formats_use_the_reliable_text_workspace() {
        for (path, id, indexed) in [
            ("settings.INI", "ini", true),
            ("service.conf", "ini", true),
            ("application.properties", "properties", true),
            (".editorconfig", "editorconfig", false),
            (".gitignore", "gitignore", false),
            (".env.production", "env", false),
        ] {
            let format = file_format_for_path(path).unwrap();
            assert_eq!(format.id, id);
            assert_eq!(format.route_name, "TextEditor");
            assert_eq!(format.adapters.reader.as_deref(), Some("text"));
            assert_eq!(format.adapters.writer.as_deref(), Some("text"));
            assert_eq!(format.capabilities.index.is_supported(), indexed);
        }
    }

    #[test]
    fn common_source_code_formats_are_lightweight_editable_and_searchable() {
        for (path, id) in [
            ("app.JS", "javascript"),
            ("component.tsx", "typescript"),
            ("tool.py", "python"),
            ("main.rs", "rust"),
            ("server.go", "go"),
            ("Main.java", "jvm-code"),
            ("native.cpp", "c-family"),
            ("deploy.ps1", "shell"),
            ("query.sql", "sql"),
            ("Panel.vue", "web-source"),
        ] {
            let format = file_format_for_path(path).unwrap();
            assert_eq!(format.id, id);
            assert_eq!(format.route_name, "TextEditor");
            assert!(format.capabilities.read.is_supported());
            assert!(format.capabilities.edit.is_supported());
            assert!(format.capabilities.index.is_supported());
            assert_eq!(format.capabilities.create, CapabilityLevel::Planned);
            assert_eq!(format.user_capability.level, UserCapabilityLevel::BasicEdit);
            assert_eq!(format.adapters.reader.as_deref(), Some("text"));
            assert_eq!(format.adapters.writer.as_deref(), Some("text"));
            assert_eq!(format.adapters.indexer.as_deref(), Some("text"));
        }
    }

    #[test]
    fn pptx_is_basic_copy_edit_and_globally_indexed() {
        let format = file_format_for_path("roadmap.pptx").unwrap();
        assert_eq!(format.id, "pptx");
        assert_eq!(format.route_name, "PptxReader");
        assert!(format.capabilities.read.is_supported());
        assert!(format.capabilities.edit.is_supported());
        assert_eq!(format.capabilities.create, CapabilityLevel::Unsupported);
        assert!(format.capabilities.index.is_supported());
        assert_eq!(format.user_capability.level, UserCapabilityLevel::BasicEdit);
        assert_eq!(format.user_capability.save_mode, SaveMode::Copy);
        assert_eq!(format.adapters.reader.as_deref(), Some("pptx"));
        assert_eq!(format.adapters.writer.as_deref(), Some("pptx"));
        assert_eq!(format.adapters.indexer.as_deref(), Some("pptx"));
        assert!(format.adapters.creator.is_none());
    }

    #[test]
    fn wps_native_formats_are_external_open_only() {
        for (path, id) in [
            ("draft.wps", "wps-document"),
            ("budget.et", "wps-spreadsheet"),
            ("briefing.dps", "wps-presentation"),
        ] {
            let format = file_format_for_path(path).unwrap();
            assert_eq!(format.id, id);
            assert_eq!(format.route_name, "ExternalOffice");
            assert_eq!(
                format.user_capability.level,
                UserCapabilityLevel::ExternalOpen
            );
            assert_eq!(format.user_capability.save_mode, SaveMode::None);
            assert!(!format.capabilities.read.is_supported());
            assert!(!format.capabilities.edit.is_supported());
            assert!(!format.capabilities.create.is_supported());
            assert!(!format.capabilities.index.is_supported());
            assert!(format.adapters.reader.is_none());
            assert!(format.adapters.writer.is_none());
            assert!(format.adapters.creator.is_none());
            assert!(format.adapters.indexer.is_none());
        }
    }

    #[test]
    fn legacy_doc_is_preflight_and_explicit_copy_only() {
        let format = file_format_for_path("archive.DOC").unwrap();
        assert_eq!(format.id, "legacy-doc");
        assert_eq!(format.route_name, "LegacyOffice");
        assert_eq!(
            format.user_capability.level,
            UserCapabilityLevel::ExternalOpen
        );
        assert_eq!(format.user_capability.save_mode, SaveMode::None);
        assert!(!format.capabilities.read.is_supported());
        assert!(!format.capabilities.edit.is_supported());
        assert!(!format.capabilities.create.is_supported());
        assert!(!format.capabilities.index.is_supported());
        assert!(format.adapters.reader.is_none());
        assert!(format.adapters.writer.is_none());
        assert!(format.adapters.creator.is_none());
        assert!(format.adapters.indexer.is_none());
    }
}
