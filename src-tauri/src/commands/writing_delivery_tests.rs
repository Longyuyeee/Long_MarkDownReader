use super::*;
struct Fixture {
    base: PathBuf,
    root: PathBuf,
    note: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!(
            "longedit-writing-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("中文 资料库");
        fs::create_dir_all(root.join("文章")).unwrap();
        fs::create_dir(root.join("共享 图")).unwrap();
        let note = root.join("文章/未保存方案.md");
        fs::write(&note, "# 原稿\n不能代存").unwrap();
        fs::write(root.join("共享 图/测试.png"), STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==").unwrap()).unwrap();
        Self { base, root, note }
    }
    fn prepare(&self, md: &str) -> Result<DeliveryResources, String> {
        prepare(self.root.to_str().unwrap(), self.note.to_str().unwrap(), md)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}
#[test]
fn draft_images_use_decoded_relative_paths_and_preserve_source_and_shared_resource() {
    let f = Fixture::new();
    let image = f.root.join("共享 图/测试.png");
    let before = fs::read(&image).unwrap();
    let result = f
        .prepare("# 正在写的文章\n![图](../共享%20图/测试.png)\n![重复](../共享%20图/测试.png)")
        .unwrap();
    assert_eq!(result.images.len(), 1);
    assert!(result.images[0]
        .data_uri
        .starts_with("data:image/png;base64,"));
    assert_eq!(fs::read(image).unwrap(), before);
    assert_eq!(fs::read_to_string(&f.note).unwrap(), "# 原稿\n不能代存");
}
#[test]
fn reference_style_and_html_images_are_authorized_without_remote_fetching() {
    let f = Fixture::new();
    let value=f.prepare("![引用][pic]\n\n[pic]: ../共享%20图/测试.png\n\n<img src='../共享%20图/测试.png'>\n\n![网络](https://example.invalid/private.png)").unwrap();
    assert_eq!(value.images.len(), 1);
    assert_eq!(value.warnings.len(), 1);
}
#[test]
fn missing_outside_arbitrary_scheme_and_forged_bitmaps_fail_honestly() {
    let f = Fixture::new();
    fs::write(f.base.join("外部.png"), "private").unwrap();
    for source in [
        "不存在.png",
        "../../外部.png",
        "file:///private.png",
        "C:/private.png",
        "data:image/png;base64,bm90LWFuLWltYWdl",
    ] {
        assert!(f.prepare(&format!("![图]({source})")).is_err(), "{source}");
    }
}
#[test]
fn image_and_draft_budgets_are_enforced_before_unbounded_read() {
    let f = Fixture::new();
    assert!(f.prepare(&"x".repeat(MAX_DRAFT + 1)).is_err());
    let oversized = f.root.join("文章/大图.png");
    let file = fs::File::create(&oversized).unwrap();
    file.set_len(MAX_IMAGE + 1).unwrap();
    assert!(f.prepare("![大图](大图.png)").is_err());
    let many = (0..129)
        .map(|n| format!("![图](https://example.invalid/{n}.png)\n"))
        .collect::<String>();
    assert!(f.prepare(&many).is_err());
}
#[test]
fn new_delivery_cannot_overwrite_source_existing_or_wrong_extension() {
    let f = Fixture::new();
    assert!(save_new(&f.note, "different", "md").is_err());
    let target = f.base.join("交付.html");
    assert!(save_new(&target, "中文内容", "html").is_ok());
    assert_eq!(fs::read_to_string(&target).unwrap(), "中文内容");
    assert!(save_new(&target, "replacement", "html").is_err());
    assert!(save_new(&target, "replacement", "md").is_err());
    assert!(save_new(&f.base.join("缺失/交付.md"), "test", "md").is_err());
    assert_eq!(fs::read_to_string(&f.note).unwrap(), "# 原稿\n不能代存");
}
#[test]
fn image_insert_paths_are_content_addressed_relative_reusable_and_do_not_modify_draft() {
    let f = Fixture::new();
    let bytes = fs::read(f.root.join("共享 图/测试.png")).unwrap();
    let first = store_image(f.root.to_str().unwrap(), f.note.to_str().unwrap(), &bytes).unwrap();
    let second = store_image(f.root.to_str().unwrap(), f.note.to_str().unwrap(), &bytes).unwrap();
    assert_eq!(first, second);
    assert!(first.starts_with(".assets/"));
    assert_eq!(
        fs::read(f.note.parent().unwrap().join(first)).unwrap(),
        bytes
    );
    assert_eq!(fs::read_to_string(&f.note).unwrap(), "# 原稿\n不能代存");
}
#[cfg(windows)]
#[test]
fn junction_outside_the_library_cannot_grant_image_access() {
    let f = Fixture::new();
    let outside = f.base.join("outside");
    fs::create_dir(&outside).unwrap();
    fs::copy(f.root.join("共享 图/测试.png"), outside.join("private.png")).unwrap();
    let link = f.root.join("文章/捷径");
    let result = std::process::Command::new("cmd")
        .args(["/c", "mklink", "/J"])
        .arg(&link)
        .arg(&outside)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "junction fixture must actually exist"
    );
    assert!(f.prepare("![秘密](捷径/private.png)").is_err());
    fs::remove_dir(&link).unwrap();
}
