//! Protocol core only. Not yet connected to window events or execution permission.
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
