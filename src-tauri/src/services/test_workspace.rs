//! Exclusively owned temporary workspaces for native command regressions.
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
pub(crate) struct TestWorkspace(pub(crate) PathBuf);
impl TestWorkspace {
    pub(crate) fn new() -> Self {
        Self::new_in(&std::env::temp_dir())
    }
    pub(crate) fn new_in(parent: &Path) -> Self {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        for _ in 0..100 {
            let path = parent.join(format!(
                "longedit-command-regression-{}-{}-{}",
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
                Err(error) => panic!("cannot create owned fixture: {error}"),
            }
        }
        panic!("could not allocate owned fixture");
    }
    pub(crate) fn root(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
    pub(crate) fn dir(&self, name: &str) -> PathBuf {
        let path = self.0.join(name);
        fs::create_dir(&path).unwrap();
        path
    }
}
impl Drop for TestWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
