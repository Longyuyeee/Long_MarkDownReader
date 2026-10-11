//! Window-state protocol support, not execution permission.
#![allow(dead_code)]
use std::{
    collections::BTreeMap,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct WindowVersion {
    pub generation: u64,
    pub revision: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Reply {
    pub version: WindowVersion,
    pub ready: bool,
    pub dirty: bool,
    pub saving: bool,
}

pub(crate) struct Confirmation {
    id: u64,
    deadline: Instant,
    expected: BTreeMap<String, WindowVersion>,
    replies: BTreeMap<String, Reply>,
    invalidated: bool,
    consumed: bool,
}

#[derive(Default)]
pub(crate) struct WindowRegistry {
    windows: BTreeMap<String, (WindowVersion, Option<bool>)>,
    next_generation: u64,
    active: Option<Confirmation>,
}

impl WindowRegistry {
    fn versions(&self) -> BTreeMap<String, WindowVersion> {
        self.windows
            .iter()
            .map(|(label, (version, _))| (label.clone(), version.clone()))
            .collect()
    }
    fn invalidate_changed(&mut self) {
        let versions = self.versions();
        if let Some(active) = &mut self.active {
            active.observe(&versions);
        }
    }
    fn insert_unknown(&mut self, label: &str) -> Result<(), &'static str> {
        if label.is_empty() || self.windows.len() >= 64 {
            return Err("invalid_window_inventory");
        }
        self.next_generation = self
            .next_generation
            .checked_add(1)
            .ok_or("window_generation_exhausted")?;
        self.windows.insert(
            label.into(),
            (
                WindowVersion {
                    generation: self.next_generation,
                    revision: 0,
                },
                None,
            ),
        );
        Ok(())
    }
    /// Synchronize native inventory without marking a newly found window ready.
    pub(crate) fn reconcile(&mut self, labels: &[String]) -> Result<(), &'static str> {
        let labels: std::collections::BTreeSet<_> = labels.iter().cloned().collect();
        if labels.len() > 64 || labels.iter().any(|s| s.is_empty()) {
            if let Some(active) = &mut self.active {
                active.invalidated = true;
            }
            return Err("invalid_window_inventory");
        }
        self.windows.retain(|label, _| labels.contains(label));
        for label in labels {
            if !self.windows.contains_key(&label) {
                self.insert_unknown(&label)?;
            }
        }
        self.invalidate_changed();
        Ok(())
    }
    pub(crate) fn report(&mut self, label: &str, dirty: bool) -> Result<(), &'static str> {
        // Every report is a revision, even if its boolean value is unchanged.
        if let Some(active) = &mut self.active {
            active.invalidated = true;
        }
        if !self.windows.contains_key(label) {
            self.insert_unknown(label)?;
        }
        let (version, state) = self.windows.get_mut(label).ok_or("unknown_window")?;
        version.revision = version
            .revision
            .checked_add(1)
            .ok_or("window_revision_exhausted")?;
        *state = Some(dirty);
        Ok(())
    }
    pub(crate) fn destroyed(&mut self, label: &str) {
        self.windows.remove(label);
        if let Some(active) = &mut self.active {
            active.invalidated = true;
        }
    }
    /// Internal only; native inventory must be reconciled before this call.
    pub(crate) fn begin(&mut self, now: Instant, timeout: Duration) -> Result<u64, &'static str> {
        if self
            .active
            .as_ref()
            .is_some_and(|request| request.check(now).is_ok())
        {
            return Err("confirmation_already_pending");
        }
        if self
            .windows
            .values()
            .any(|(_, dirty)| *dirty != Some(false))
        {
            return Err("window_state_not_clean");
        }
        let request = Confirmation::new(now, timeout, self.versions())?;
        let id = request.id();
        self.active = Some(request);
        Ok(id)
    }
}

#[derive(Default)]
pub(crate) struct WindowConfirmationState(pub std::sync::Mutex<WindowRegistry>);

impl Confirmation {
    pub(crate) fn new(
        now: Instant,
        timeout: Duration,
        expected: BTreeMap<String, WindowVersion>,
    ) -> Result<Self, &'static str> {
        if expected.is_empty()
            || expected.len() > 64
            || expected.keys().any(|label| label.is_empty())
        {
            return Err("invalid_window_inventory");
        }
        if timeout.is_zero() || timeout > Duration::from_secs(30) {
            return Err("invalid_confirmation_timeout");
        }
        static NEXT: AtomicU64 = AtomicU64::new(1);
        let id = NEXT
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_add(1))
            .map_err(|_| "confirmation_id_exhausted")?;
        Ok(Self {
            id,
            deadline: now
                .checked_add(timeout)
                .ok_or("invalid_confirmation_deadline")?,
            expected,
            replies: BTreeMap::new(),
            invalidated: false,
            consumed: false,
        })
    }
    pub(crate) fn id(&self) -> u64 {
        self.id
    }

    /// Called on every topology/revision change, not only immediately before consume.
    pub(crate) fn observe(&mut self, current: &BTreeMap<String, WindowVersion>) {
        if current != &self.expected {
            self.invalidated = true;
        }
    }

    fn check(&self, now: Instant) -> Result<(), &'static str> {
        if self.consumed {
            return Err("confirmation_consumed");
        }
        if self.invalidated {
            return Err("confirmation_invalidated");
        }
        if now >= self.deadline {
            return Err("confirmation_expired");
        }
        Ok(())
    }

    /// Sender identity must come from the native command context, never a payload label.
    pub(crate) fn reply(
        &mut self,
        now: Instant,
        request_id: u64,
        sender: &str,
        reply: Reply,
    ) -> Result<(), &'static str> {
        self.check(now)?;
        if request_id != self.id {
            return Err("confirmation_request_mismatch");
        }
        let expected = self
            .expected
            .get(sender)
            .ok_or("unexpected_confirmation_sender")?;
        if &reply.version != expected || !reply.ready || reply.dirty || reply.saving {
            self.invalidated = true;
            return Err("window_not_stable_for_confirmation");
        }
        if let Some(previous) = self.replies.get(sender) {
            if previous != &reply {
                self.invalidated = true;
                return Err("conflicting_confirmation_reply");
            }
            return Ok(());
        }
        self.replies.insert(sender.to_owned(), reply);
        Ok(())
    }

    /// Consumes only protocol evidence. The caller still needs execution locks,
    /// immutable plan validation and draft protection through the entire operation.
    pub(crate) fn consume(
        &mut self,
        now: Instant,
        current: &BTreeMap<String, WindowVersion>,
    ) -> Result<(), &'static str> {
        self.observe(current);
        self.check(now)?;
        if self.replies.len() != self.expected.len() {
            return Err("confirmation_pending");
        }
        self.consumed = true;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn archive_registry_unknown_windows_block_and_recreated_labels_get_new_generation() {
        let mut r = WindowRegistry::default();
        r.reconcile(&["main".into(), "quick".into()]).unwrap();
        r.report("main", false).unwrap();
        assert_eq!(
            r.begin(Instant::now(), Duration::from_secs(2)),
            Err("window_state_not_clean")
        );
        let old = r.versions()["quick"].generation;
        r.destroyed("quick");
        r.reconcile(&["main".into(), "quick".into()]).unwrap();
        assert!(r.versions()["quick"].generation > old);
        r.report("quick", false).unwrap();
        assert!(r.begin(Instant::now(), Duration::from_secs(2)).is_ok());
    }
    #[test]
    fn archive_registry_reports_and_topology_changes_invalidate_active_requests() {
        let now = Instant::now();
        let mut r = WindowRegistry::default();
        r.report("main", false).unwrap();
        r.begin(now, Duration::from_secs(2)).unwrap();
        assert_eq!(
            r.begin(now, Duration::from_secs(2)),
            Err("confirmation_already_pending")
        );
        let old = r.versions()["main"].revision;
        r.report("main", false).unwrap();
        assert!(r.versions()["main"].revision > old);
        assert_eq!(
            r.active.as_ref().unwrap().check(now),
            Err("confirmation_invalidated")
        );
        let id = r.begin(now, Duration::from_secs(2)).unwrap();
        r.reconcile(&["main".into(), "new".into()]).unwrap();
        assert_eq!(
            r.active.as_ref().unwrap().check(now),
            Err("confirmation_invalidated")
        );
        r.destroyed("new");
        assert!(r.begin(now, Duration::from_secs(2)).unwrap() > id);
    }
    fn windows() -> BTreeMap<String, WindowVersion> {
        BTreeMap::from([
            (
                "main".into(),
                WindowVersion {
                    generation: 1,
                    revision: 4,
                },
            ),
            (
                "quick-note".into(),
                WindowVersion {
                    generation: 2,
                    revision: 0,
                },
            ),
        ])
    }
    fn clean(version: &WindowVersion) -> Reply {
        Reply {
            version: version.clone(),
            ready: true,
            dirty: false,
            saving: false,
        }
    }
    #[test]
    fn archive_confirmation_requires_every_window_and_consumes_once() {
        let now = Instant::now();
        let windows = windows();
        let mut c = Confirmation::new(now, Duration::from_secs(2), windows.clone()).unwrap();
        for (label, version) in &windows {
            assert_eq!(c.consume(now, &windows), Err("confirmation_pending"));
            c.reply(now, c.id(), label, clean(version)).unwrap();
            c.reply(now, c.id(), label, clean(version)).unwrap();
        }
        assert!(c.consume(now, &windows).is_ok());
        assert_eq!(c.consume(now, &windows), Err("confirmation_consumed"));
    }
    #[test]
    fn archive_confirmation_rejects_wrong_request_sender_and_deadline() {
        let now = Instant::now();
        let windows = windows();
        let mut c = Confirmation::new(now, Duration::from_secs(2), windows.clone()).unwrap();
        assert_eq!(
            c.reply(now, c.id() + 1, "main", clean(&windows["main"])),
            Err("confirmation_request_mismatch")
        );
        assert_eq!(
            c.reply(now, c.id(), "other", clean(&windows["main"])),
            Err("unexpected_confirmation_sender")
        );
        assert_eq!(
            c.reply(
                now + Duration::from_secs(2),
                c.id(),
                "main",
                clean(&windows["main"])
            ),
            Err("confirmation_expired")
        );
        assert_eq!(
            c.consume(now + Duration::from_secs(2), &windows),
            Err("confirmation_expired")
        );
    }
    #[test]
    fn archive_confirmation_invalidates_dirty_saving_unready_and_stale_revisions() {
        let now = Instant::now();
        let windows = windows();
        for index in 0..4 {
            let mut c = Confirmation::new(now, Duration::from_secs(2), windows.clone()).unwrap();
            let mut reply = clean(&windows["main"]);
            match index {
                0 => reply.dirty = true,
                1 => reply.saving = true,
                2 => reply.ready = false,
                _ => reply.version.revision += 1,
            }
            assert!(c.reply(now, c.id(), "main", reply).is_err());
            assert_eq!(
                c.reply(now, c.id(), "main", clean(&windows["main"])),
                Err("confirmation_invalidated")
            );
        }
    }
    #[test]
    fn archive_confirmation_recreated_or_transient_windows_invalidate_permanently() {
        let now = Instant::now();
        let windows = windows();
        for change in 0..3 {
            let mut c = Confirmation::new(now, Duration::from_secs(2), windows.clone()).unwrap();
            let mut changed = windows.clone();
            match change {
                0 => {
                    changed.get_mut("main").unwrap().generation += 1;
                }
                1 => {
                    changed.remove("quick-note");
                }
                _ => {
                    changed.insert(
                        "new".into(),
                        WindowVersion {
                            generation: 3,
                            revision: 0,
                        },
                    );
                }
            }
            c.observe(&changed);
            c.observe(&windows);
            assert_eq!(c.consume(now, &windows), Err("confirmation_invalidated"));
        }
    }
}
