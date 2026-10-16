//! Short-lived process-local exclusion between library relocation and file IO.
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    thread::ThreadId,
};
struct Entry {
    owner: ThreadId,
    paths: Vec<String>,
    exclusive: bool,
}
#[derive(Default)]
struct State {
    next: u64,
    entries: BTreeMap<u64, Entry>,
    moved: Vec<(PathBuf, PathBuf)>,
}
fn state() -> &'static Mutex<State> {
    static VALUE: OnceLock<Mutex<State>> = OnceLock::new();
    VALUE.get_or_init(Mutex::default)
}
fn normalized(path: &Path) -> Result<PathBuf, String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join(path)
    };
    let mut parent = absolute.as_path();
    while !parent.try_exists().map_err(|e| e.to_string())? {
        parent = parent.parent().ok_or("无法核对文件目录")?;
    }
    let canonical = parent.canonicalize().map_err(|e| e.to_string())?;
    let suffix = absolute.strip_prefix(parent).map_err(|e| e.to_string())?;
    Ok(if suffix.as_os_str().is_empty() {
        canonical
    } else {
        canonical.join(suffix)
    })
}
fn key(path: &Path) -> Result<String, String> {
    let s = normalized(path)?.to_string_lossy().replace('\\', "/");
    Ok(if cfg!(windows) { s.to_lowercase() } else { s })
}
fn overlap(a: &str, b: &str) -> bool {
    a == b || a.starts_with(&format!("{b}/")) || b.starts_with(&format!("{a}/"))
}
pub(crate) struct Activity(u64);
impl Drop for Activity {
    fn drop(&mut self) {
        if let Ok(mut s) = state().lock() {
            s.entries.remove(&self.0);
        }
    }
}
fn acquire(paths: &[&Path], exclusive: bool) -> Result<Activity, String> {
    let paths = paths
        .iter()
        .map(|p| key(p))
        .collect::<Result<Vec<_>, _>>()?;
    let owner = std::thread::current().id();
    let mut s = state().lock().map_err(|_| "文件整理状态不可用")?;
    if s.entries.values().any(|e| {
        e.owner != owner
            && (exclusive || e.exclusive)
            && paths.iter().any(|p| e.paths.iter().any(|q| overlap(p, q)))
    }) {
        return Err("文档正在保存或整理，请保留修改并稍后重试".into());
    }
    s.next = s.next.checked_add(1).ok_or("文件整理序号耗尽")?;
    let id = s.next;
    s.entries.insert(
        id,
        Entry {
            owner,
            paths,
            exclusive,
        },
    );
    Ok(Activity(id))
}
pub(crate) fn read_write(paths: &[&Path]) -> Result<Activity, String> {
    acquire(paths, false)
}
pub(crate) fn current_directory_for_comparison(path: &Path) -> Result<PathBuf, String> {
    normalized(path)
}
pub(crate) fn relocate(root: &Path) -> Result<Activity, String> {
    acquire(&[root], true)
}
pub(crate) fn remember_move(old: &Path, new: &Path) {
    if let Ok(mut s) = state().lock() {
        if s.moved.len() >= 2000 {
            s.moved.remove(0);
        }
        s.moved.push((old.to_owned(), new.to_owned()));
    }
}
/// A delayed create follows a directory which the application itself moved.
/// An explicitly recreated old directory takes priority over the remembered path.
pub(crate) fn current_directory(path: &Path) -> Result<PathBuf, String> {
    let mut current = normalized(path)?;
    let s = state().lock().map_err(|_| "文件位置状态不可用")?;
    for _ in 0..s.moved.len() + 1 {
        let mut changed = false;
        for (old, new) in s.moved.iter() {
            if !old.try_exists().map_err(|e| e.to_string())? {
                if let Ok(suffix) = current.strip_prefix(old) {
                    current = new.join(suffix);
                    changed = true;
                    break;
                }
            }
        }
        if !changed {
            return Ok(current);
        }
    }
    Err("文件位置反复变化，请刷新列表后重试".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn library_move_excludes_other_thread_writers_but_keeps_its_own_atomic_writes() {
        let f = crate::services::test_workspace::TestWorkspace::new();
        let p = f.0.join("a.md");
        let lease = relocate(&f.0).unwrap();
        let own = read_write(&[&p]).unwrap();
        assert!(std::thread::spawn(move || read_write(&[&p]).is_err())
            .join()
            .unwrap());
        drop(own);
        drop(lease);
        assert!(read_write(&[&f.0.join("b.md")]).is_ok());
    }
    #[test]
    fn in_flight_output_prevents_move_before_mutation() {
        let f = crate::services::test_workspace::TestWorkspace::new();
        let output = f.0.join("new.pdf");
        let writing = read_write(&[&output]).unwrap();
        let root = f.0.clone();
        assert!(std::thread::spawn(move || relocate(&root).is_err())
            .join()
            .unwrap());
        drop(writing);
        assert!(relocate(&f.0).is_ok());
    }
    #[test]
    fn delayed_creation_follows_directory_moves_without_recreating_old_tree() {
        let f = crate::services::test_workspace::TestWorkspace::new();
        let old = f.dir("before");
        let new = f.0.join("after");
        std::fs::rename(&old, &new).unwrap();
        remember_move(&old, &new);
        assert_eq!(
            current_directory(&old.join("notes")).unwrap(),
            new.join("notes")
        );
        assert!(!old.exists());
        std::fs::create_dir(&old).unwrap();
        assert_eq!(current_directory(&old).unwrap(), old);
    }
}
