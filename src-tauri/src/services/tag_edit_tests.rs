use super::*;
use crate::services::test_workspace::TestWorkspace;
fn rename() -> Operation {
    Operation::Rename {
        from: "项目".into(),
        to: "进行中".into(),
    }
}
fn file(root: &TestWorkspace, name: &str, body: &str) -> String {
    let path = root.0.join(name);
    fs::write(&path, body).unwrap();
    path.to_string_lossy().into_owned()
}
fn prepared(root: &TestWorkspace, paths: &[String]) -> Plan {
    Plan::prepare(&root.0, &rename(), paths, &[]).unwrap()
}
fn body(path: &str) -> String {
    fs::read_to_string(path).unwrap()
}

#[test]
fn v1110_tag_edit_preview_is_read_only_and_writes_exact_bom_crlf_with_original_history() {
    let root = TestWorkspace::new();
    let original = "\u{feff}# 标题\r\n正文 #项目`代码 #项目扩展 #项目。\r\n";
    let path = file(&root, "note.MD", original);
    let mut plan = prepared(&root, &[path.clone()]);
    assert_eq!(plan.preview()[0].state, PreviewState::Ready);
    assert_eq!(plan.preview()[0].changes, 2);
    assert_eq!(body(&path), original);
    let cache = root.0.join("history");
    assert!(!cache.exists());
    let _history = super::super::history_coordination::acquire(&cache).unwrap();
    let report = plan
        .apply(
            &[0],
            || Ok(()),
            |path, before| crate::commands::history::save_reference_snapshot(&cache, path, before),
        )
        .unwrap();
    assert_eq!(report.items[0].outcome, Outcome::Completed);
    assert_eq!(
        body(&path),
        original
            .replace("#项目`", "#进行中`")
            .replace("#项目。", "#进行中。")
    );
    let directory = super::super::archive_history::history_path(&cache, Path::new(&path));
    let snapshot = fs::read_dir(directory)
        .unwrap()
        .map(Result::unwrap)
        .find(|entry| entry.path().extension().is_some_and(|ext| ext == "md"))
        .unwrap();
    assert_eq!(fs::read(snapshot.path()).unwrap(), original.as_bytes());
    let mut calls = 0;
    let retry = plan
        .apply(
            &[0],
            || Ok(()),
            |_, _| {
                calls += 1;
                Ok(())
            },
        )
        .unwrap();
    assert_eq!(calls, 0);
    assert_eq!(retry.items[0].outcome, Outcome::Completed);
}
#[test]
fn v1110_tag_edit_add_remove_and_rename_preserve_surroundings_and_never_prefix_replace() {
    let source = "\u{feff}正文 #项目。 #项目扩展\r\n#项目`代码\r\n";
    let (after, count) = Operation::Remove {
        tag: "项目".into()
    }
    .transform(source)
    .unwrap();
    assert_eq!(count, 2);
    assert_eq!(after, "\u{feff}正文 。 #项目扩展\r\n`代码\r\n");
    let (added, count) = Operation::Add {
        tag: "任务".into()
    }
    .transform(source)
    .unwrap();
    assert_eq!(count, 1);
    assert_eq!(added, format!("{source}#任务\r\n"));
    assert_eq!(
        Operation::Add {
            tag: "项目".into()
        }
        .transform(source)
        .unwrap(),
        (source.into(), 0)
    );
    assert!(Operation::Rename {
        from: "项目".into(),
        to: "项目".into()
    }
    .validate()
    .is_err());
    for invalid in ["a b", "a#b", "a`b", "a。", ""] {
        assert!(Operation::Add {
            tag: invalid.into()
        }
        .validate()
        .is_err());
    }
    assert!(Operation::Add {
        tag: "新".repeat(81)
    }
    .validate()
    .is_err());
    assert!(Operation::Remove {
        tag: "旧".repeat(120)
    }
    .validate()
    .is_ok());
    assert!(Operation::Remove { tag: "a".into() }
        .transform(&"#a ".repeat(100001))
        .is_err());
}
#[test]
fn v1110_tag_edit_rejects_external_body_change_even_when_length_and_timestamp_are_restored() {
    let root = TestWorkspace::new();
    let path = file(&root, "note.md", "#项目\n原文");
    let mut plan = prepared(&root, &[path.clone()]);
    let modified = fs::metadata(&path).unwrap().modified().unwrap();
    fs::write(&path, "#项目\n新文").unwrap();
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(modified))
        .unwrap();
    let mut history = 0;
    let report = plan
        .apply(
            &[0],
            || Ok(()),
            |_, _| {
                history += 1;
                Ok(())
            },
        )
        .unwrap();
    assert_eq!(history, 0);
    assert_eq!(report.items[0].outcome, Outcome::NotExecuted);
    assert_eq!(body(&path), "#项目\n新文");
    let path2 = file(&root, "during-history.md", "#项目");
    let mut plan = prepared(&root, &[path2.clone()]);
    let report = plan
        .apply(
            &[0],
            || Ok(()),
            |path, _| {
                fs::write(path, "外部修改").unwrap();
                Ok(())
            },
        )
        .unwrap();
    assert_eq!(report.items[0].outcome, Outcome::NotExecuted);
    assert_eq!(body(&path2), "外部修改");
}
#[test]
fn v1110_tag_edit_partial_history_or_write_failure_has_per_file_truth_and_no_full_retry() {
    let root = TestWorkspace::new();
    let first = file(&root, "a.md", "#项目");
    let second = file(&root, "b.md", "#项目");
    let third = file(&root, "c.md", "#项目");
    let mut plan = prepared(&root, &[first.clone(), second.clone(), third.clone()]);
    let mut writes = 0;
    let report = plan
        .apply_with_writer(
            &[0, 1, 2],
            &mut || Ok(()),
            &mut |path, _| {
                if path.ends_with("a.md") {
                    Err("历史磁盘不可用".into())
                } else {
                    Ok(())
                }
            },
            |path, after| {
                writes += 1;
                if path.ends_with("b.md") {
                    return Err("故障发生在写入之前".into());
                }
                reliable_write::write_utf8(path, after)
            },
        )
        .unwrap();
    assert_eq!(writes, 2);
    assert_eq!(
        report
            .items
            .iter()
            .map(|r| r.outcome.clone())
            .collect::<Vec<_>>(),
        vec![
            Outcome::NotExecuted,
            Outcome::NotExecuted,
            Outcome::Completed
        ]
    );
    assert_eq!(body(&first), "#项目");
    assert_eq!(body(&second), "#项目");
    assert_eq!(body(&third), "#进行中");
    let retry = plan
        .apply(
            &[0, 1, 2],
            || panic!("receipt retry must not re-protect or re-write"),
            |_, _| panic!(),
        )
        .unwrap();
    assert_eq!(retry.items[2].outcome, Outcome::Completed);
    assert!(plan.apply(&[2], || Ok(()), |_, _| Ok(())).is_err());
    let mut plan = prepared(&root, &[second.clone()]);
    let report = plan
        .apply_with_writer(&[0], &mut || Ok(()), &mut |_, _| Ok(()), |path, _| {
            fs::write(path, "意外正文").unwrap();
            Err("无法确定写入状态".into())
        })
        .unwrap();
    assert_eq!(report.items[0].outcome, Outcome::NeedsReview);
    assert_eq!(body(&second), "意外正文");
}
#[test]
fn v1110_tag_edit_dirty_exclusions_invalid_input_and_save_leases_never_write() {
    let root = TestWorkspace::new();
    let dirty = file(&root, "dirty.md", "#项目");
    let clean = file(&root, "clean.md", "#项目");
    let mut plan = Plan::prepare(
        &root.0,
        &rename(),
        &[dirty.clone(), clean.clone()],
        &[dirty.clone()],
    )
    .unwrap();
    assert_eq!(plan.preview()[0].state, PreviewState::Excluded);
    assert!(plan.apply(&[0], || Ok(()), |_, _| Ok(())).is_err());
    let _saving = super::super::document_coordination::acquire(&[Path::new(&clean)]).unwrap();
    assert!(plan.apply(&[1], || Ok(()), |_, _| panic!()).is_err());
    assert_eq!(body(&clean), "#项目");
    assert_eq!(body(&dirty), "#项目");
    assert!(Plan::prepare(&root.0, &rename(), &[clean.clone(), clean.clone()], &[]).is_err());
    assert!(Plan::prepare(&root.0, &rename(), &vec![clean.clone(); 65], &[]).is_err());
    drop(_saving);
    let mut plan = prepared(&root, &[clean.clone()]);
    plan.created = Instant::now() - TTL;
    assert!(plan.apply(&[0], || Ok(()), |_, _| panic!()).is_err());
    let mut plan = prepared(&root, &[clean]);
    assert!(plan.apply(&[0, 0], || Ok(()), |_, _| panic!()).is_err());
}
#[test]
fn v1110_tag_edit_private_outside_encoding_readonly_and_interrupted_sources_are_not_candidates() {
    let root = TestWorkspace::new();
    let other = TestWorkspace::new();
    let outside = file(&other, "outside.md", "#项目");
    let private = file(&root, ".private.md", "#项目");
    let invalid = root.0.join("invalid.md");
    fs::write(&invalid, [0xff, 0xfe]).unwrap();
    let readonly = file(&root, "readonly.md", "#项目");
    let mut permissions = fs::metadata(&readonly).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&readonly, permissions).unwrap();
    let interrupted = file(&root, "interrupted.md", "#项目");
    // Use the reliable writer's actual sidecar naming, not a fabricated blocker.
    let sidecar = Path::new(&interrupted).with_file_name(".interrupted.md.longedit-bak");
    fs::write(&sidecar, "#旧正文").unwrap();
    let inputs = vec![
        outside.clone(),
        private,
        invalid.to_string_lossy().into_owned(),
        readonly.clone(),
        interrupted.clone(),
    ];
    let plan = prepared(&root, &inputs);
    assert!(plan
        .preview()
        .iter()
        .all(|item| item.state == PreviewState::Unavailable));
    assert_eq!(body(&outside), "#项目");
    assert_eq!(body(&interrupted), "#项目");
    assert_eq!(fs::read_to_string(sidecar).unwrap(), "#旧正文");
    let mut permissions = fs::metadata(&readonly).unwrap().permissions();
    permissions.set_readonly(false);
    fs::set_permissions(readonly, permissions).unwrap();
}
