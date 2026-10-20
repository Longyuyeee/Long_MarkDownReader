//! The editor's own attachment folders contain user files, not private metadata.
pub(crate) fn hidden_name(name: &str) -> bool {
    (name.starts_with('.') && !name.eq_ignore_ascii_case(".assets"))
        || name.eq_ignore_ascii_case(".misty_order.json")
}
