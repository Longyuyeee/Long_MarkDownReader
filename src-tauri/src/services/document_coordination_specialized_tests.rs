//! Real command entry points; no UI/native IPC mocks or timing-dependent races.
use super::acquire;
use crate::commands::{canvas, diagram, files, formats, mindmap, note_templates, quick_note};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

const CANVAS: &str = "{\"nodes\":[],\"edges\":[]}\n";
const MERMAID: &str = "flowchart LR\n  A --> B\n";
const OPML: &str = include_str!("../../tests/fixtures/formats/mindmap.opml");

pub(super) struct Fixture(pub(super) PathBuf);
impl Fixture {
    pub(super) fn new() -> Self {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        for _ in 0..100 {
            let path = std::env::temp_dir().join(format!(
                "longedit-specialized-coordination-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            match fs::create_dir(&path) {
                Ok(()) => return Self(path.canonicalize().unwrap()),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => panic!("fixture: {error}"),
            }
        }
        panic!("could not exclusively create test workspace");
    }
    pub(super) fn root(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
    pub(super) fn directory(&self) -> PathBuf {
        let path = self.0.join("notes");
        fs::create_dir(&path).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

macro_rules! creation_test {
    ($name:ident, $create:expr) => {
        #[test]
        fn $name() {
            let fixture = Fixture::new();
            let directory = fixture.directory();
            let create: fn(String, String) -> Result<String, String> = $create;
            let moving = acquire(&[&directory]).unwrap();
            let result = create(fixture.root(), directory.to_string_lossy().into_owned());
            assert!(
                result.is_err(),
                "creation bypassed moving directory: {result:?}"
            );
            assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
            drop(moving);
            let created = create(fixture.root(), directory.to_string_lossy().into_owned()).unwrap();
            assert!(
                PathBuf::from(created).exists(),
                "creation must work after protection ends"
            );
        }
    };
}
creation_test!(
    specialized_new_markdown_respects_directory_move,
    |root, dir| tauri::async_runtime::block_on(files::create_new_file(root, Some(dir), None))
);
creation_test!(
    specialized_new_folder_respects_directory_move,
    |root, dir| tauri::async_runtime::block_on(files::create_new_folder(root, dir))
);
creation_test!(
    specialized_format_creation_respects_directory_move,
    |root, dir| tauri::async_runtime::block_on(formats::create_format_file(
        root,
        Some(dir),
        "json".into(),
        None,
        None,
        None
    ))
);
creation_test!(
    specialized_canvas_creation_respects_directory_move,
    |root, dir| tauri::async_runtime::block_on(canvas::create_canvas_file(root, Some(dir), None))
);
creation_test!(
    specialized_mermaid_creation_respects_directory_move,
    |root, dir| tauri::async_runtime::block_on(diagram::create_diagram_file(root, Some(dir), None))
);
creation_test!(
    specialized_template_creation_respects_directory_move,
    |root, dir| tauri::async_runtime::block_on(note_templates::create_note_from_template(
        root,
        dir,
        "meeting".into(),
        "# {{title}}".into(),
        None
    ))
);
creation_test!(
    specialized_quick_note_respects_directory_move,
    |root, dir| tauri::async_runtime::block_on(quick_note::save_quick_note(
        root,
        dir,
        "0123456789abcdef0123456789abcdef".into(),
        "user capture".into()
    ))
);

#[test]
fn specialized_future_directory_is_not_created_while_reserved() {
    let fixture = Fixture::new();
    let directory = fixture.0.join("future").join("nested");
    let input = directory.to_string_lossy().into_owned();
    let moving = acquire(&[&fixture.0.join("future")]).unwrap();
    let format = tauri::async_runtime::block_on(formats::create_format_file(
        fixture.root(),
        Some(input.clone()),
        "json".into(),
        None,
        None,
        None,
    ));
    let template = tauri::async_runtime::block_on(note_templates::create_note_from_template(
        fixture.root(),
        input.clone(),
        "meeting".into(),
        "# {{title}}".into(),
        None,
    ));
    let capture = tauri::async_runtime::block_on(quick_note::save_quick_note(
        fixture.root(),
        input.clone(),
        "0123456789abcdef0123456789abcdef".into(),
        "capture".into(),
    ));
    assert!(format.is_err() && template.is_err() && capture.is_err());
    assert!(
        !fixture.0.join("future").exists(),
        "protect before mkdir, not after"
    );
    drop(moving);
    let saved = tauri::async_runtime::block_on(quick_note::save_quick_note(
        fixture.root(),
        input,
        "0123456789abcdef0123456789abcdef".into(),
        "capture".into(),
    ))
    .unwrap();
    assert_eq!(fs::read_to_string(saved).unwrap(), "capture");
}

#[test]
fn specialized_creation_keeps_existing_documents_and_allocates_new_names() {
    let fixture = Fixture::new();
    for (name, content) in [
        ("未命名.md", "user markdown"),
        ("未命名画布.canvas", CANVAS),
        ("未命名图表.mmd", MERMAID),
    ] {
        fs::write(fixture.0.join(name), content).unwrap();
    }
    let markdown =
        tauri::async_runtime::block_on(files::create_new_file(fixture.root(), None, None)).unwrap();
    let canvas =
        tauri::async_runtime::block_on(canvas::create_canvas_file(fixture.root(), None, None))
            .unwrap();
    let diagram =
        tauri::async_runtime::block_on(diagram::create_diagram_file(fixture.root(), None, None))
            .unwrap();
    assert!(markdown.ends_with("未命名 1.md"));
    assert!(canvas.ends_with("未命名画布 1.canvas"));
    assert!(diagram.ends_with("未命名图表 1.mmd"));
    assert_eq!(
        fs::read_to_string(fixture.0.join("未命名.md")).unwrap(),
        "user markdown"
    );
    assert_eq!(
        fs::read_to_string(fixture.0.join("未命名画布.canvas")).unwrap(),
        CANVAS
    );
    assert_eq!(
        fs::read_to_string(fixture.0.join("未命名图表.mmd")).unwrap(),
        MERMAID
    );
}

#[test]
fn specialized_canvas_save_respects_directory_move() {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let path = directory.join("map.canvas");
    fs::write(&path, CANVAS).unwrap();
    let moving = acquire(&[&directory]).unwrap();
    let result = tauri::async_runtime::block_on(canvas::write_canvas_file(
        fixture.root(),
        path.to_string_lossy().into_owned(),
        "{\"nodes\": [], \"edges\": []}".into(),
    ));
    assert!(result.is_err(), "Canvas saved during directory move");
    assert_eq!(fs::read_to_string(&path).unwrap(), CANVAS);
    drop(moving);
    tauri::async_runtime::block_on(canvas::write_canvas_file(
        fixture.root(),
        path.to_string_lossy().into_owned(),
        CANVAS.into(),
    ))
    .unwrap();
}

#[test]
fn specialized_canvas_read_does_not_recover_during_move() {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let path = directory.join("map.canvas");
    let backup = directory.join(".map.canvas.longedit-bak");
    fs::write(&path, CANVAS).unwrap();
    fs::write(&backup, "keep recovery evidence").unwrap();
    let moving = acquire(&[&directory]).unwrap();
    assert!(tauri::async_runtime::block_on(canvas::read_canvas_file(
        fixture.root(),
        path.to_string_lossy().into_owned()
    ))
    .is_err());
    assert_eq!(
        fs::read_to_string(backup).unwrap(),
        "keep recovery evidence"
    );
    assert_eq!(fs::read_to_string(path).unwrap(), CANVAS);
    drop(moving);
}

#[test]
fn specialized_canvas_late_read_and_save_do_not_resurrect_old_path() {
    let fixture = Fixture::new();
    let path = fixture.0.join("old.canvas");
    let new = fixture.0.join("new.canvas");
    let backup = fixture.0.join(".old.canvas.longedit-bak");
    fs::write(&path, CANVAS).unwrap();
    fs::rename(&path, &new).unwrap();
    fs::write(&backup, CANVAS).unwrap();
    let read = tauri::async_runtime::block_on(canvas::read_canvas_file(
        fixture.root(),
        path.to_string_lossy().into_owned(),
    ));
    let write = tauri::async_runtime::block_on(canvas::write_canvas_file(
        fixture.root(),
        path.to_string_lossy().into_owned(),
        CANVAS.into(),
    ));
    assert!(
        read.is_err() && write.is_err(),
        "late Canvas I/O must not turn recovery or save into creation"
    );
    assert!(!path.exists());
    assert_eq!(fs::read_to_string(backup).unwrap(), CANVAS);
    assert_eq!(fs::read_to_string(new).unwrap(), CANVAS);
}

#[test]
fn specialized_mermaid_read_and_save_respect_directory_move() {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let path = directory.join("flow.mmd");
    fs::write(&path, MERMAID).unwrap();
    let opened = tauri::async_runtime::block_on(diagram::read_diagram_file(
        fixture.root(),
        path.to_string_lossy().into_owned(),
    ))
    .unwrap();
    let moving = acquire(&[&directory]).unwrap();
    let read = tauri::async_runtime::block_on(diagram::read_diagram_file(
        fixture.root(),
        opened.path.clone(),
    ));
    let write = tauri::async_runtime::block_on(diagram::write_diagram_file(
        fixture.root(),
        opened.path,
        MERMAID.into(),
        opened.signature,
    ));
    assert!(
        read.is_err() && write.is_err(),
        "Mermaid bypassed directory protection"
    );
    assert_eq!(fs::read_to_string(path).unwrap(), MERMAID);
    drop(moving);
}

#[test]
fn specialized_opml_read_and_save_respect_directory_move() {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let path = directory.join("tree.opml");
    fs::write(&path, OPML).unwrap();
    let opened = tauri::async_runtime::block_on(mindmap::read_opml_file(
        fixture.root(),
        path.to_string_lossy().into_owned(),
    ))
    .unwrap();
    let moving = acquire(&[&directory]).unwrap();
    let read = tauri::async_runtime::block_on(mindmap::read_opml_file(
        fixture.root(),
        opened.path.clone(),
    ));
    let write = tauri::async_runtime::block_on(mindmap::write_opml_file(
        fixture.root(),
        opened.path,
        opened.signature,
        opened.document,
    ));
    assert!(
        read.is_err() && write.is_err(),
        "OPML bypassed directory protection"
    );
    assert_eq!(fs::read_to_string(path).unwrap(), OPML);
    drop(moving);
}
