use super::*;
use crate::services::test_workspace::TestWorkspace;
use std::io::Cursor;

fn fixture() -> (TestWorkspace, PathBuf, PathBuf) {
    let f = TestWorkspace::new();
    let root = f.dir("项目资料");
    let cache = f.dir("history_v2");
    fs::create_dir(root.join("图片")).unwrap();
    fs::write(
        root.join("方案.md"),
        "# 方案\n![流程](图片/流程.png)\n[文献](阅读.pdf)\n",
    )
    .unwrap();
    fs::write(root.join("配置.json"), "{\"标题\":\"保留实际内容\"}").unwrap();
    fs::write(root.join("图片/流程.png"), [137, 80, 78, 71, 1, 2, 3]).unwrap();
    fs::write(root.join("阅读.pdf"), b"%PDF-1.7\nfixture bytes\n%%EOF").unwrap();
    let (_, _, time) = source_digest(&root.join("阅读.pdf"), &Control::default()).unwrap();
    let annotation = serde_json::json!({"schemaVersion":1,"source":{"pdfFile":"阅读.pdf","size":fs::metadata(root.join("阅读.pdf")).unwrap().len(),"modifiedAt":time/1_000_000_000},"annotations":[{"id":"note-1","kind":"comment","page":1,"color":"yellow","rects":[],"quote":"原文","comment":"批注保留","createdAt":100,"updatedAt":100}]});
    fs::write(
        root.join("阅读.pdf.annotations.json"),
        serde_json::to_vec(&annotation).unwrap(),
    )
    .unwrap();
    let history = super::super::archive_history::history_path(
        &cache,
        &root.join("方案.md").canonicalize().unwrap(),
    );
    fs::create_dir(&history).unwrap();
    fs::write(history.join("123.md"), "旧版正文\n").unwrap();
    fs::write(
        history.join("metadata.json"),
        r#"{"123":{"pinned":true,"note":"重要记录"}}"#,
    )
    .unwrap();
    (f, root, cache)
}
fn all() -> Options {
    Options {
        history: true,
        ..Options::default()
    }
}
fn write_archive(path: &Path, manifest: &Manifest, entries: Vec<(String, Vec<u8>)>) {
    let file = File::create(path).unwrap();
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file("manifest.json", options).unwrap();
    zip.write_all(&serde_json::to_vec(manifest).unwrap())
        .unwrap();
    for (name, bytes) in entries {
        zip.start_file(name, options).unwrap();
        zip.write_all(&bytes).unwrap();
    }
    zip.finish().unwrap();
}
fn valid_package(f: &TestWorkspace, root: &Path, cache: &Path) -> (PathBuf, ExportPlan) {
    let plan = preview(root, cache, all(), &Control::default()).unwrap();
    let path = f.0.join("内容.longedit-backup.zip");
    export(&plan, &path, &Control::default()).unwrap();
    (path, plan)
}
fn source_entries(plan: &ExportPlan) -> Vec<(String, Vec<u8>)> {
    plan.manifest
        .entries
        .iter()
        .zip(&plan.sources)
        .map(|(e, p)| (e.path.clone(), fs::read(p).unwrap()))
        .collect()
}

#[test]
fn content_session_roundtrip_is_optional_metadata_and_never_a_restored_file() {
    let (f, root, cache) = fixture();
    let mut plan = preview(&root, &cache, all(), &Control::default()).unwrap();
    let legacy = serde_json::to_value(&plan.manifest).unwrap();
    assert!(legacy.get("workSession").is_none());
    assert!(serde_json::from_value::<Manifest>(legacy)
        .unwrap()
        .work_session
        .is_none());
    let scene = serde_json::json!({"kind":"longedit-work-session","schemaVersion":1,"name":"备份现场","savedAt":123,"files":[{"relativePath":"方案.md","pinned":true,"view":{"scrollTop":120,"scrollLeft":0}},{"relativePath":"后来移动的文件.md"}],"activePath":"方案.md","reference":{"relativePath":"阅读.pdf","query":"文献","page":2}});
    plan.manifest.work_session = Some(scene.clone());
    let archive = f.0.join("带现场.zip");
    let receipt = export(&plan, &archive, &Control::default()).unwrap();
    assert_eq!(receipt.work_session.as_ref(), Some(&scene));
    let parsed = inspect_archive(&archive, &Control::default()).unwrap();
    let target = f.0.join("新目录");
    let restored = restore(&parsed, &cache, &target, &Control::default()).unwrap();
    assert_eq!(restored.work_session, Some(scene));
    assert_eq!(restored.entry_count, plan.manifest.entries.len());
    assert!(!target.join("后来移动的文件.md").exists());
    assert!(!target.join("manifest.json").exists());
    assert_eq!(
        fs::read(target.join("方案.md")).unwrap(),
        fs::read(root.join("方案.md")).unwrap()
    );
}

#[test]
fn content_session_invalid_metadata_rejects_the_package_before_restoration() {
    let (f, root, cache) = fixture();
    let plan = preview(&root, &cache, all(), &Control::default()).unwrap();
    for (index, session) in [
        serde_json::json!({"kind":"longedit-work-session","schemaVersion":1,"name":"现场","savedAt":1,"files":[{"relativePath":"../other.md"}]}),
        serde_json::json!({"kind":"longedit-work-session","schemaVersion":1,"name":"现场","savedAt":1,"files":[{"relativePath":"方案.md","content":"不能伪装成现场正文"}]}),
    ].into_iter().enumerate() {
        let mut manifest = plan.manifest.clone();
        manifest.work_session = Some(session);
        let archive = f.0.join(format!("无效现场{index}.zip"));
        write_archive(&archive, &manifest, source_entries(&plan));
        assert!(inspect_archive(&archive, &Control::default()).is_err());
    }
    assert_eq!(
        fs::read(root.join("配置.json")).unwrap(),
        "{\"标题\":\"保留实际内容\"}".as_bytes()
    );
}

#[test]
fn content_package_roundtrip_preserves_files_pdf_identity_and_rebound_history() {
    let (f, root, cache) = fixture();
    let (path, plan) = valid_package(&f, &root, &cache);
    assert_eq!(plan.manifest.entries.len(), 7);
    let before = plan
        .sources
        .iter()
        .map(|p| fs::read(p).unwrap())
        .collect::<Vec<_>>();
    let parsed = inspect_archive(&path, &Control::default()).unwrap();
    let target = f.0.join("恢复资料");
    let receipt = restore(&parsed, &cache, &target, &Control::default()).unwrap();
    assert_eq!(receipt.status, "completed");
    assert_eq!(receipt.history_count, 2);
    for e in plan
        .manifest
        .entries
        .iter()
        .filter(|e| e.category != "history")
    {
        assert_eq!(
            fs::read(target.join(&e.relative_path)).unwrap(),
            fs::read(root.join(&e.relative_path)).unwrap()
        );
        assert_eq!(
            stamp(&fs::metadata(target.join(&e.relative_path)).unwrap()).unwrap(),
            e.modified_nanos
        )
    }
    let restored_history = super::super::archive_history::history_path(
        &cache,
        &target.join("方案.md").canonicalize().unwrap(),
    );
    assert_eq!(
        fs::read_to_string(restored_history.join("123.md")).unwrap(),
        "旧版正文\n"
    );
    assert!(fs::read_to_string(restored_history.join("metadata.json"))
        .unwrap()
        .contains("重要记录"));
    assert_eq!(
        before,
        plan.sources
            .iter()
            .map(|p| fs::read(p).unwrap())
            .collect::<Vec<_>>()
    );
    let annotations = tauri::async_runtime::block_on(crate::commands::pdf::read_pdf_annotations(
        target.to_string_lossy().into(),
        target.join("阅读.pdf").to_string_lossy().into(),
    ))
    .unwrap();
    assert_eq!(annotations.annotations[0].comment, "批注保留");
    let mut zip = ZipArchive::new(File::open(path).unwrap()).unwrap();
    let mut manifest = String::new();
    zip.by_name("manifest.json")
        .unwrap()
        .read_to_string(&mut manifest)
        .unwrap();
    assert!(!manifest.contains(&root.to_string_lossy().to_string()));
    assert!(!manifest.contains(&cache.to_string_lossy().to_string()));
}
#[test]
fn content_scope_and_known_sensitive_exclusions_are_explicit() {
    let (_f, root, cache) = fixture();
    fs::write(root.join(".env"), "DO_NOT_INCLUDE=secret").unwrap();
    fs::write(root.join("private.key"), "credential").unwrap();
    fs::create_dir(root.join(".git")).unwrap();
    fs::write(root.join(".git/config"), "private remote").unwrap();
    let plan = preview(
        &root,
        &cache,
        Options {
            documents: true,
            attachments: false,
            annotations: false,
            history: false,
            ..Options::default()
        },
        &Control::default(),
    )
    .unwrap();
    assert_eq!(plan.manifest.entries.len(), 3);
    for name in [
        ".env",
        "private.key",
        ".git",
        "图片/流程.png",
        "阅读.pdf.annotations.json",
    ] {
        assert!(
            plan.manifest.excluded.iter().any(|e| e.path == name),
            "{name}"
        )
    }
    assert!(!serde_json::to_string(&plan.manifest)
        .unwrap()
        .contains("DO_NOT_INCLUDE"));
}
#[test]
fn content_history_and_annotation_require_source_selection() {
    let (_f, root, cache) = fixture();
    assert!(preview(
        &root,
        &cache,
        Options {
            documents: false,
            attachments: true,
            annotations: true,
            history: true,
            ..Options::default()
        },
        &Control::default()
    )
    .is_err());
    fs::remove_file(root.join("阅读.pdf")).unwrap();
    assert!(preview(&root, &cache, all(), &Control::default())
        .unwrap_err_string()
        .contains("源文档"));
}
#[test]
fn content_export_detects_same_length_rewrite_even_when_timestamp_is_preserved() {
    let (f, root, cache) = fixture();
    let plan = preview(&root, &cache, all(), &Control::default()).unwrap();
    let file = root.join("配置.json");
    let time = fs::metadata(&file).unwrap().modified().unwrap();
    let mut bytes = fs::read(&file).unwrap();
    bytes[0] = b' ';
    fs::write(&file, bytes).unwrap();
    File::options()
        .write(true)
        .open(&file)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(time))
        .unwrap();
    let target = f.0.join("should-not-exist.zip");
    assert!(export(&plan, &target, &Control::default()).is_err());
    assert!(!target.exists());
}
#[test]
fn content_export_detects_new_and_missing_files() {
    for removed in [false, true] {
        let (f, root, cache) = fixture();
        let plan = preview(&root, &cache, all(), &Control::default()).unwrap();
        if removed {
            fs::remove_file(root.join("配置.json")).unwrap()
        } else {
            fs::write(root.join("后加.md"), "必须重新预检").unwrap()
        }
        let target = f.0.join("stale.zip");
        assert!(export(&plan, &target, &Control::default()).is_err());
        assert!(!target.exists());
    }
}
#[test]
fn content_export_never_overwrites_or_recurses_into_source() {
    let (f, root, cache) = fixture();
    let plan = preview(&root, &cache, all(), &Control::default()).unwrap();
    let existing = f.0.join("已有.zip");
    fs::write(&existing, "保持不变").unwrap();
    assert!(export(&plan, &existing, &Control::default()).is_err());
    assert_eq!(fs::read_to_string(&existing).unwrap(), "保持不变");
    assert!(export(&plan, &root.join("自己.zip"), &Control::default()).is_err());
}
#[test]
fn content_restore_never_merges_with_an_existing_empty_or_populated_directory() {
    for populated in [false, true] {
        let (f, root, cache) = fixture();
        let (path, _) = valid_package(&f, &root, &cache);
        let plan = inspect_archive(&path, &Control::default()).unwrap();
        let target = f.dir("已存在");
        if populated {
            fs::write(target.join("用户原文.md"), "不可覆盖").unwrap()
        }
        assert!(restore(&plan, &cache, &target, &Control::default()).is_err());
        assert_eq!(
            fs::read_dir(&target).unwrap().count(),
            usize::from(populated)
        );
    }
}
#[test]
fn content_restore_rejects_replaced_archive_and_preserves_sources() {
    let (f, root, cache) = fixture();
    let (path, _) = valid_package(&f, &root, &cache);
    let plan = inspect_archive(&path, &Control::default()).unwrap();
    fs::write(&path, b"not a zip").unwrap();
    let target = f.0.join("拒绝恢复");
    assert!(restore(&plan, &cache, &target, &Control::default()).is_err());
    assert!(!target.exists());
    assert!(root.join("方案.md").exists());
}
#[test]
fn content_zip_rejects_changed_digest_extra_entries_and_unsupported_schema() {
    for kind in ["digest", "extra", "schema", "unknown-field"] {
        let (f, root, cache) = fixture();
        let plan = preview(&root, &cache, all(), &Control::default()).unwrap();
        let mut manifest = plan.manifest.clone();
        let mut entries = source_entries(&plan);
        match kind {
            "digest" => entries[0].1.push(b'x'),
            "extra" => entries.push(("files/extra.txt".into(), b"unlisted".to_vec())),
            "schema" => manifest.schema_version = 2,
            _ => manifest.kind = "management-backup".into(),
        };
        let path = f.0.join("bad.zip");
        write_archive(&path, &manifest, entries);
        assert!(
            inspect_archive(&path, &Control::default()).is_err(),
            "{kind}"
        );
    }
}
#[test]
fn content_zip_rejects_paths_traversal_devices_ads_and_case_collision() {
    for name in [
        "../escape",
        "/root",
        "C:evil",
        "a\\b",
        "a//b",
        "a/../b",
        "CON.txt",
        "AUX",
        "LPT1.txt",
        "trailing.",
        "trailing ",
        "x\0bad",
    ] {
        assert!(relative(name).is_err(), "{name}")
    }
    let (_f, root, cache) = fixture();
    let plan = preview(&root, &cache, all(), &Control::default()).unwrap();
    let mut m = plan.manifest;
    m.entries.push(m.entries[0].clone());
    assert!(validate_manifest(&m).is_err());
    let mut m = m.clone();
    m.entries.pop();
    m.entries[0].relative_path = "../outside.md".into();
    assert!(validate_manifest(&m).is_err());
}
#[test]
fn content_manifest_rejects_budget_bombs_and_missing_source_bindings() {
    let (_f, root, cache) = fixture();
    let plan = preview(&root, &cache, all(), &Control::default()).unwrap();
    let mut m = plan.manifest.clone();
    m.entries[0].bytes = MAX_FILE + 1;
    assert!(validate_manifest(&m).is_err());
    let mut m = plan.manifest.clone();
    m.entries.retain(|e| e.relative_path != "方案.md");
    assert!(validate_manifest(&m).is_err());
    let mut m = plan.manifest;
    m.entries.resize(MAX_ENTRIES + 1, m.entries[0].clone());
    assert!(validate_manifest(&m).is_err());
}
#[test]
fn content_preflight_refuses_corrupt_history_and_stale_pdf_annotations() {
    for history in [true, false] {
        let (_f, root, cache) = fixture();
        if history {
            let dir = super::super::archive_history::history_path(
                &cache,
                &root.join("方案.md").canonicalize().unwrap(),
            );
            fs::write(dir.join("metadata.json"), "broken").unwrap()
        } else {
            fs::write(root.join("阅读.pdf"), b"%PDF-1.7 changed").unwrap()
        }
        assert!(preview(&root, &cache, all(), &Control::default()).is_err());
    }
}
#[test]
fn content_interrupted_history_is_not_silently_excluded_or_recovered() {
    let (_f, root, cache) = fixture();
    let dir = super::super::archive_history::history_path(
        &cache,
        &root.join("方案.md").canonicalize().unwrap(),
    );
    fs::write(dir.join(".metadata.json.longedit-bak"), "保留恢复材料").unwrap();
    assert!(preview(&root, &cache, all(), &Control::default()).is_err());
    assert_eq!(
        fs::read_to_string(dir.join(".metadata.json.longedit-bak")).unwrap(),
        "保留恢复材料"
    );
}
#[test]
fn content_cancel_before_any_mutation_and_commit_cannot_be_falsely_cancelled() {
    let (f, root, cache) = fixture();
    let cancel = Control::default();
    assert!(cancel.cancel());
    assert!(preview(&root, &cache, all(), &cancel).is_err());
    let (path, plan) = valid_package(&f, &root, &cache);
    assert!(export(&plan, &f.0.join("cancel.zip"), &cancel).is_err());
    let parsed = inspect_archive(&path, &Control::default()).unwrap();
    let target = f.0.join("cancelled");
    assert!(restore(&parsed, &cache, &target, &cancel).is_err());
    assert!(!target.exists());
    let committing = Control::default();
    committing.commit().unwrap();
    assert!(!committing.cancel());
    assert!(committing.check().is_ok());
}
#[test]
fn content_disk_budget_and_write_failure_are_errors_not_success() {
    assert!(require_space(10, 11).is_err());
    assert!(require_space(11, 11).is_ok());
    struct Full;
    impl Write for Full {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("simulated disk full"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let bytes = b"must not succeed";
    let e = Entry {
        path: "files/a.txt".into(),
        relative_path: "a.txt".into(),
        category: "documents".into(),
        bytes: bytes.len() as u64,
        sha256: sha(bytes),
        modified_nanos: 0,
        source_relative: None,
    };
    assert!(copy_checked(&mut Cursor::new(bytes), &mut Full, &e, &Control::default()).is_err());
}
#[test]
fn content_cancel_mid_stream_stops_at_a_bounded_chunk_and_owned_stage_is_cleaned() {
    let f = TestWorkspace::new();
    let stage = Stage::new(&f.0).unwrap();
    let path = stage.path.clone();
    let control = Control::default();
    struct Cancelling {
        control: Control,
        reader: Cursor<Vec<u8>>,
    }
    impl Read for Cancelling {
        fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
            let n = self.reader.read(out)?;
            self.control.cancel();
            Ok(n)
        }
    }
    let bytes = vec![7; 200_000];
    let e = Entry {
        path: "files/a.bin".into(),
        relative_path: "a.bin".into(),
        category: "attachments".into(),
        bytes: bytes.len() as u64,
        sha256: sha(&bytes),
        modified_nanos: 0,
        source_relative: None,
    };
    let mut reader = Cancelling {
        control: control.clone(),
        reader: Cursor::new(bytes),
    };
    let mut output = File::create(stage.path.join("partial")).unwrap();
    let error = copy_checked(&mut reader, &mut output, &e, &control).unwrap_err();
    drop(output);
    let message = stage.abort(error);
    assert!(message.contains("取消"));
    assert!(!path.exists());
}
#[test]
fn content_restore_retains_empty_folders_without_overwriting_conflicts() {
    let (f, root, cache) = fixture();
    fs::create_dir_all(root.join("空目录/子目录")).unwrap();
    let (path, _) = valid_package(&f, &root, &cache);
    let plan = inspect_archive(&path, &Control::default()).unwrap();
    let target = f.0.join("empty-restored");
    restore(&plan, &cache, &target, &Control::default()).unwrap();
    assert!(target.join("空目录/子目录").is_dir());
}
#[test]
fn content_restored_history_never_overwrites_a_prior_deleted_path_history() {
    let (f, root, cache) = fixture();
    let (path, _) = valid_package(&f, &root, &cache);
    let plan = inspect_archive(&path, &Control::default()).unwrap();
    let target = f.0.join("reserved");
    let directory = super::super::archive_history::history_path(&cache, &target.join("方案.md"));
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join("1.md"), "之前的历史").unwrap();
    assert!(restore(&plan, &cache, &target, &Control::default()).is_err());
    assert!(!target.exists());
    assert_eq!(
        fs::read_to_string(directory.join("1.md")).unwrap(),
        "之前的历史"
    );
}
#[cfg(windows)]
#[test]
fn content_actual_symlink_is_rejected_without_following_outside_library() {
    use std::os::windows::fs::symlink_file;
    let (f, root, cache) = fixture();
    let external = f.0.join("external.txt");
    fs::write(&external, "不能自动包含外链").unwrap();
    match symlink_file(&external, root.join("link.txt")) {
        Ok(()) => {
            assert!(preview(&root, &cache, all(), &Control::default()).is_err());
            assert_eq!(fs::read_to_string(external).unwrap(), "不能自动包含外链")
        }
        Err(e) if e.raw_os_error() == Some(1314) => {
            eprintln!("File-symlink fixture unavailable without privilege; this branch is not symlink evidence. The separate mandatory junction test verifies an actual reparse point.");
        }
        Err(e) => panic!("cannot create owned symlink fixture: {e}"),
    }
}

#[cfg(windows)]
#[test]
fn content_actual_junction_is_rejected_without_following_external_directory() {
    let (f, root, cache) = fixture();
    let outside = f.dir("outside-library");
    fs::write(outside.join("private.txt"), "不能读取外库目录").unwrap();
    let link = root.join("linked-directory");
    let result = std::process::Command::new("cmd.exe")
        .args(["/d", "/c", "mklink", "/J"])
        .arg(&link)
        .arg(&outside)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "owned junction creation failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(linked(&fs::symlink_metadata(&link).unwrap()));
    assert!(preview(&root, &cache, all(), &Control::default()).is_err());
    assert_eq!(
        fs::read_to_string(outside.join("private.txt")).unwrap(),
        "不能读取外库目录"
    );
}

// Avoid requiring Debug for private native plans solely for an error assertion.
#[test]
fn content_subdirectory_scope_preserves_relative_paths_without_scanning_other_content() {
    let (f, root, cache) = fixture();
    let options = Options {
        directory: "图片".into(),
        documents: false,
        attachments: true,
        annotations: false,
        history: false,
    };
    let plan = preview(&root, &cache, options, &Control::default()).unwrap();
    assert_eq!(plan.manifest.entries.len(), 1);
    assert_eq!(plan.manifest.entries[0].relative_path, "图片/流程.png");
    fs::write(root.join("范围外新增.md"), "没有选择").unwrap();
    let path = f.0.join("图片.zip");
    export(&plan, &path, &Control::default()).unwrap();
    let parsed = inspect_archive(&path, &Control::default()).unwrap();
    let target = f.0.join("图片恢复");
    restore(&parsed, &cache, &target, &Control::default()).unwrap();
    assert!(target.join("图片/流程.png").exists());
    assert!(!target.join("方案.md").exists());
    assert!(preview(
        &root,
        &cache,
        Options {
            directory: "../escape".into(),
            ..Options::default()
        },
        &Control::default()
    )
    .is_err());
}
#[test]
fn content_export_commit_race_never_replaces_an_intervening_file() {
    let (f, root, cache) = fixture();
    let plan = preview(&root, &cache, all(), &Control::default()).unwrap();
    let target = f.0.join("race.zip");
    let raced = target.clone();
    let control = Control {
        commit_hook: Some(Arc::new(move || fs::write(&raced, "竞争者原文件").unwrap())),
        ..Control::default()
    };
    assert!(export(&plan, &target, &control).is_err());
    assert_eq!(fs::read_to_string(&target).unwrap(), "竞争者原文件");
    assert!(!fs::read_dir(&f.0).unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".longedit-content-stage-")));
}
#[test]
fn content_restore_commit_race_rolls_new_history_back_without_touching_raced_target() {
    let (f, root, cache) = fixture();
    let (path, _) = valid_package(&f, &root, &cache);
    let plan = inspect_archive(&path, &Control::default()).unwrap();
    let target = f.0.join("restore-race");
    let raced = target.clone();
    let old = fs::read_dir(&cache).unwrap().count();
    let control = Control {
        commit_hook: Some(Arc::new(move || {
            fs::create_dir(&raced).unwrap();
            fs::write(raced.join("用户内容.md"), "不可替换").unwrap();
        })),
        ..Control::default()
    };
    assert!(restore(&plan, &cache, &target, &control).is_err());
    assert_eq!(
        fs::read_to_string(target.join("用户内容.md")).unwrap(),
        "不可替换"
    );
    assert_eq!(fs::read_dir(cache).unwrap().count(), old);
}
#[test]
fn content_zip_directory_count_is_bounded_before_allocating_untrusted_central_entries() {
    let (f, root, cache) = fixture();
    let (path, _) = valid_package(&f, &root, &cache);
    let mut bytes = fs::read(&path).unwrap();
    let pos = bytes.windows(4).rposition(|w| w == b"PK\x05\x06").unwrap();
    bytes[pos + 8..pos + 12].fill(255);
    fs::write(&path, bytes).unwrap();
    assert!(inspect_archive(&path, &Control::default()).is_err());
}
#[test]
fn content_history_names_have_the_exact_identity_the_existing_history_reader_uses() {
    assert!(validate_history_name("123.md").is_ok());
    assert!(validate_history_name("metadata.json").is_ok());
    for name in [
        "01.md",
        "12.md.md",
        "12.MD",
        "../12.md",
        "notes.md",
        ".metadata.json.longedit-bak",
    ] {
        assert!(validate_history_name(name).is_err(), "{name}")
    }
    let control = Control::default();
    assert!(control.cancel());
    assert!(control.cancel());
    assert!(control.check().is_err());
}
trait PlanError {
    fn unwrap_err_string(self) -> String;
}
impl PlanError for Result<ExportPlan, String> {
    fn unwrap_err_string(self) -> String {
        match self {
            Err(e) => e,
            Ok(_) => panic!("expected preflight failure"),
        }
    }
}
