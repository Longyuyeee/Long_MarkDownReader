//! Library-relative chapter destinations shared by copy and move planning.
use std::path::Path;

pub(crate) struct ChapterLink {
    pub relative: String,
    pub title: String,
    pub fragment: String,
}
pub(crate) fn is_chapter(uri: &str) -> bool {
    uri.to_ascii_lowercase().starts_with("longedit://chapter")
}
fn valid_relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 4096
        && [".md", ".markdown"]
            .iter()
            .any(|ext| path.to_ascii_lowercase().ends_with(ext))
        && !path
            .chars()
            .any(|c| c == '\\' || c == ':' || c.is_control())
        && !path
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
}
pub(crate) fn parse(uri: &str) -> Option<ChapterLink> {
    if uri.len() > 65536 || !is_chapter(uri) {
        return None;
    }
    let bytes = uri.as_bytes();
    if bytes.iter().enumerate().any(|(i, b)| {
        *b == b'%'
            && (i + 2 >= bytes.len()
                || !bytes[i + 1].is_ascii_hexdigit()
                || !bytes[i + 2].is_ascii_hexdigit())
    }) {
        return None;
    }
    let url = tauri::Url::parse(uri).ok()?;
    if url.scheme() != "longedit"
        || url.host_str() != Some("chapter")
        || !url.path().is_empty()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return None;
    }
    let mut path = None;
    let mut title = None;
    for pair in url.query()?.split('&') {
        let (key, value) = pair.split_once('=')?;
        let key = urlencoding::decode(key).ok()?;
        let value = value.replace('+', " ");
        let value = urlencoding::decode(&value).ok()?.into_owned();
        match key.as_ref() {
            "path" if path.is_none() => path = Some(value),
            "title" if title.is_none() => title = Some(value),
            _ => return None,
        }
    }
    let relative = path?;
    let title = title?;
    let fragment = urlencoding::decode(url.fragment()?).ok()?.into_owned();
    if !valid_relative(&relative)
        || title.is_empty()
        || title.len() > 4096
        || fragment.is_empty()
        || fragment.len() > 4096
        || title.chars().chain(fragment.chars()).any(char::is_control)
    {
        return None;
    }
    Some(ChapterLink {
        relative,
        title,
        fragment,
    })
}
pub(crate) fn remap_to(root: &Path, target: &Path, original: &str) -> Option<String> {
    let link = parse(original)?;
    let path = target.strip_prefix(root).ok()?.to_str()?.replace('\\', "/");
    if !valid_relative(&path) {
        return None;
    }
    Some(format!(
        "longedit://chapter?path={}&title={}#{}",
        urlencoding::encode(&path),
        urlencoding::encode(&link.title),
        urlencoding::encode(&link.fragment)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::{archive_dependencies, file_move_links, test_workspace::TestWorkspace};
    use std::fs;
    fn uri(relative: &str) -> String {
        format!(
            "longedit://chapter?path={}&title=%E9%87%8D%E5%A4%8D#%E9%87%8D%E5%A4%8D-1",
            urlencoding::encode(relative)
        )
    }
    #[test]
    fn root_relocation_resolves_the_same_relative_file_without_rewriting_notes() {
        let old = TestWorkspace::new();
        let new = TestWorkspace::new();
        for root in [&old.0, &new.0] {
            fs::create_dir(root.join("资料")).unwrap();
            fs::write(root.join("资料/目标 #%.md"), "# 重复\n\n## 重复\n").unwrap();
        }
        let note = format!("[章节](<{}>)", uri("资料/目标 #%.md"));
        for root in [&old.0, &new.0] {
            let evidence =
                archive_dependencies::move_mentions(&root.join("笔记.md").to_string_lossy(), &note);
            let resolved = archive_dependencies::resolve_relative(root, &evidence[0]);
            assert_eq!(resolved.status, "resolved_file");
            assert_eq!(
                Path::new(resolved.path.as_ref().unwrap()),
                root.join("资料/目标 #%.md")
            );
        }
    }
    #[test]
    fn moving_a_project_remaps_incoming_and_internal_links_but_not_same_named_files_or_code() {
        let f = TestWorkspace::new();
        let project = f.dir("项目");
        let other = f.dir("其他");
        fs::write(project.join("目标.md"), "# 重复\n\n## 重复\n").unwrap();
        fs::write(other.join("目标.md"), "# 其他\n").unwrap();
        let before = format!(
            "\u{feff}[内部](<{}>)\r\n[同名](<{}>)\r\n```md\r\n[示例](<{}>)\r\n```\r\n",
            uri("项目/目标.md"),
            uri("其他/目标.md"),
            uri("项目/目标.md")
        );
        fs::write(project.join("来源.md"), &before).unwrap();
        fs::write(
            f.0.join("索引.md"),
            format!("[来源](<{}>)\n", uri("项目/来源.md")),
        )
        .unwrap();
        let plan = file_move_links::plan(&f.root(), &project, &f.0.join("归档")).unwrap();
        assert!(plan.blockers.is_empty(), "{:?}", plan.blockers);
        assert_eq!(plan.documents.len(), 2);
        let edit = plan
            .documents
            .iter()
            .find(|d| d.source.ends_with("来源.md"))
            .unwrap();
        let expected = before.replacen(&uri("项目/目标.md"), &uri("归档/目标.md"), 1);
        assert_eq!(edit.replacement, expected);
        assert_eq!(fs::read_to_string(project.join("来源.md")).unwrap(), before);
        let incoming = plan
            .documents
            .iter()
            .find(|d| d.source.ends_with("索引.md"))
            .unwrap();
        assert!(incoming.replacement.contains(&uri("归档/来源.md")));
    }
    #[test]
    fn unsaved_references_require_protection_only_when_the_chapter_target_would_change() {
        let f = TestWorkspace::new();
        let project = f.dir("项目");
        let archive = f.dir("归档");
        let target = project.join("目标.md");
        let note = project.join("来源.md");
        fs::write(&target, "# 重复\n").unwrap();
        fs::write(&note, "saved original\n").unwrap();
        let draft = format!("自己的未保存补写\n[章节](<{}>)\n", uri("项目/目标.md"));
        assert!(file_move_links::draft_requires_rewrite(
            &f.0,
            &target,
            &project.join("改名.md"),
            &note,
            &draft
        )
        .unwrap());
        assert!(!file_move_links::draft_requires_rewrite(
            &f.0,
            &note,
            &archive.join("来源.md"),
            &note,
            &draft
        )
        .unwrap());
        assert_eq!(fs::read_to_string(&note).unwrap(), "saved original\n");
    }
    #[test]
    fn chapter_identity_preserves_unicode_duplicate_fragment_and_encoded_filename() {
        let uri = "longedit://chapter?path=notes%2F%E6%96%B0%20%23%25.md&title=%E9%87%8D%E5%A4%8D#%E9%87%8D%E5%A4%8D-1";
        let value = parse(uri).unwrap();
        assert_eq!(value.relative, "notes/新 #%.md");
        assert_eq!(value.title, "重复");
        assert_eq!(value.fragment, "重复-1");
        let root = std::env::temp_dir();
        let target = root.join("搬家/新 #%.md");
        let mapped = parse(&remap_to(&root, &target, uri).unwrap()).unwrap();
        assert_eq!(mapped.relative, "搬家/新 #%.md");
        assert_eq!(mapped.title, value.title);
        assert_eq!(mapped.fragment, value.fragment);
        for bad in [
            "longedit://chapter?path=../a.md&title=x#x",
            "longedit://chapter?path=%2Fa.md&title=x#x",
            "longedit://chapter?path=a.pdf&title=x#x",
            "longedit://chapter?path=a.md&path=b.md&title=x#x",
            "longedit://chapter?path=a.md&title=x&unknown=1#x",
            "longedit://chapter?path=a.md&title=x",
            "longedit://chapter?path=a.md&title=%FF#x",
            "longedit://chapter/?path=a.md&title=x#x",
        ] {
            assert!(parse(bad).is_none(), "{bad}");
        }
    }
}
