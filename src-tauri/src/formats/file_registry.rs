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
            assert_eq!(format.capabilities.create, CapabilityLevel::Planned);
            assert_eq!(format.route_name, "JsonEditor");
            assert_eq!(format.adapters.reader.as_deref(), Some("text"));
            assert_eq!(format.adapters.writer.as_deref(), Some("text"));
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
        assert_eq!(format.capabilities.create, CapabilityLevel::Planned);
        assert!(format.capabilities.index.is_supported());
        assert_eq!(format.route_name, "XmlEditor");
        assert_eq!(format.adapters.reader.as_deref(), Some("text"));
        assert_eq!(format.adapters.writer.as_deref(), Some("text"));
        assert_eq!(format.adapters.indexer.as_deref(), Some("text"));
        assert_eq!(format.user_capability.level, UserCapabilityLevel::BasicEdit);
        assert_eq!(format.user_capability.save_mode, SaveMode::Overwrite);
        assert_eq!(
            file_format_registry()
                .unwrap()
                .by_path("config/schema.XML")
                .unwrap()
                .id,
            "xml"
        );
    }
}
