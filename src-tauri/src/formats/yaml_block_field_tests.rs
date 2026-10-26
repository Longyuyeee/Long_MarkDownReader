use super::*;
fn entry(s: &str, p: &str) -> YamlOutlineEntry {
    let a = analyze_yaml_source(s);
    assert!(a.valid, "{s:?}: {:?}", a.diagnostics);
    a.outline.into_iter().find(|e| e.path == p).unwrap()
}
fn copy(s: &str, p: &str, n: &str) -> Result<YamlKeyChange, String> {
    let f = entry(s, p).field.unwrap();
    copy_yaml_field_source(s, f.start, f.end, n)
}
fn moved(s: &str, p: &str, d: &str) -> Result<YamlKeyChange, String> {
    let f = entry(s, p).field.unwrap();
    move_yaml_field_source(s, f.start, f.end, d)
}
fn decoded(s: &str, p: &str) -> String {
    let e = entry(s, p);
    inspect_yaml_literal_source(s, e.start, e.end).unwrap()
}

#[test]
fn copy_preserves_block_form_inline_comment_and_other_bytes() {
    for m in ["|-", ">-", "|2-", ">-2", "|", ">+"] {
        let raw = format!("  first: {m} # attached\n    第一行😀\n    第二行\n");
        let s = format!("root:\n{raw}  other: 0xFF # untouched\nlast: 9007199254740993123456789\n");
        let r = copy(&s, "$.root.first", "copy").unwrap();
        assert_eq!(
            r.content,
            s.replace(
                &raw,
                &format!("{raw}{}", raw.replacen("first:", "copy:", 1))
            )
        );
        assert_eq!(
            decoded(&r.content, "$.root.copy"),
            decoded(&s, "$.root.first")
        );
        assert_eq!(&r.content[r.start..r.end], "copy");
    }
}
#[test]
fn adjacent_blocks_swap_and_inverse_restores_exact_original() {
    let a = "  first: |- # first\n    第一段\n    text\n";
    let b = "  second: >- # second\n    后一段\n    folded\n";
    let s = format!("root:\n{a}{b}last: 8_080\n");
    for (p, d) in [("$.root.first", "down"), ("$.root.second", "up")] {
        let r = moved(&s, p, d).unwrap();
        assert_eq!(r.content, format!("root:\n{b}{a}last: 8_080\n"));
        let f = entry(&r.content, p).field.unwrap();
        assert_eq!((r.start, r.end), (f.start, f.end));
        assert_eq!(
            moved(&r.content, p, if d == "up" { "down" } else { "up" })
                .unwrap()
                .content,
            s
        );
    }
}
#[test]
fn single_line_neighbors_and_unrelated_collections_do_not_block() {
    let s="root:\n  text: |-\n    long\n    text\n  number: 0xFF # inline\n  unrelated: [1,2]\nlast: true\n";
    let r = moved(s, "$.root.number", "up").unwrap();
    assert_eq!(r.content,"root:\n  number: 0xFF # inline\n  text: |-\n    long\n    text\n  unrelated: [1,2]\nlast: true\n");
    assert!(copy(s, "$.root.text", "copy").is_ok());
    assert!(moved(s, "$.root.number", "down").is_err());
}
#[test]
fn independent_comments_keep_slot_ambiguous_comments_stay_local() {
    let s="root:\n  text: |- # header\n    text\n\n  # independent\n\n  other: true # inline\nlast: 1\n";
    assert_eq!(moved(s,"$.root.text","down").unwrap().content,"root:\n  other: true # inline\n\n  # independent\n\n  text: |- # header\n    text\nlast: 1\n");
    for s in [
        "root:\n  # attached?\n  text: |-\n    old\n  other: true\n",
        "root:\n  text: |-\n    old\n  # next?\n  other: true\n",
    ] {
        assert!(moved(s, "$.root.text", "down").is_err());
    }
    let s = "root:\n  # attached?\n  text: |-\n    old\n  other: true\n";
    assert!(copy(s, "$.root.text", "copy").is_err());
}
#[test]
fn bom_crlf_quoted_names_nested_parent_and_new_spans() {
    let s="\u{feff}# 中文😀\r\nroot:\r\n  'a.b':\r\n    'first': >2- # header\r\n      old\r\n      wrapped\r\n    other: false\r\nlast: 0xFF\r\n";
    let r = copy(s, "$.root[\"a.b\"].first", "a'b").unwrap();
    assert!(r.content.contains("    'a''b': >2- # header\r\n"));
    assert_eq!(&r.content[r.start..r.end], "'a''b'");
    assert!(r.content.starts_with('\u{feff}'));
    assert!(!r.content.replace("\r\n", "").contains('\n'));
    let r = moved(&r.content, "$.root[\"a.b\"][\"a'b\"]", "down").unwrap();
    assert_eq!(
        decoded(&r.content, "$.root[\"a.b\"][\"a'b\"]"),
        decoded(s, "$.root[\"a.b\"].first")
    );
}
#[test]
fn root_fields_and_missing_final_newline_keep_raw_bytes() {
    let s = "\u{feff}first: |- # a\n  text\nsecond: >- # b\n  other";
    assert_eq!(
        moved(s, "$.first", "down").unwrap().content,
        "\u{feff}second: >- # b\n  other\nfirst: |- # a\n  text"
    );
    assert_eq!(
        copy("first: |-\n  text", "$.first", "copy")
            .unwrap()
            .content,
        "first: |-\n  text\ncopy: |-\n  text"
    );
}
#[test]
fn empty_blocks_keep_chomping_and_eof_value_changes_are_rejected() {
    for m in ["|", ">-", "|+"] {
        let s = format!("root:\n  text: {m}\n  other: false\nnext: true\n");
        let r = copy(&s, "$.root.text", "copy").unwrap();
        assert_eq!(
            decoded(&r.content, "$.root.copy"),
            decoded(&s, "$.root.text")
        );
        assert!(moved(&s, "$.root.text", "down").is_ok());
    }
    assert!(moved("text: |\nother: false\n", "$.text", "down").is_err());
}
#[test]
fn keep_chomp_and_hash_body_travel_and_fresh_keys_allow_continuation() {
    let s = "root:\n  text: |+ # header\n    # body\n    text\n\n\n  other: true\nlast: 1\n";
    let r = moved(s, "$.root.text", "down").unwrap();
    assert_eq!(decoded(&r.content, "$.root.text"), "# body\ntext\n\n\n");
    let r = copy(s, "$.root.text", "copy").unwrap();
    assert_eq!(
        decoded(&r.content, "$.root.copy"),
        decoded(s, "$.root.text")
    );
    let r = copy(&r.content, "$.root.copy", "copy2").unwrap();
    assert_eq!(
        decoded(&r.content, "$.root.copy2"),
        decoded(s, "$.root.text")
    );
    assert!(moved("text: |-\n  # actual body\nother: true\n", "$.other", "up").is_ok());
}
#[test]
fn duplicate_invalid_names_references_compact_keys_and_multi_documents_keep_draft() {
    let s = "text: |-\n  old\nother: 1\n";
    for n in ["text", "other", "", "<<", "a\nb"] {
        assert!(copy(s, "$.text", n).is_err());
    }
    assert!(copy(s, "$.text", &"x".repeat(4097)).is_err());
    for (s, p) in [
        (
            "root: &id\n  text: |-\n    old\n  other: true\ncopy: *id\n",
            "$.root.text",
        ),
        ("text: &id |-\n  old\nother: true\n", "$.text"),
        ("text: !tag |-\n  old\nother: true\n", "$.text"),
        ("- text: |-\n    old\n  other: true\n", "$[0].text"),
        ("text: |-\n  old\nother: true\n---\nlast: 1\n", "$.text"),
        ("<<: {a: 1}\ntext: |-\n  old\nother: true\n", "$.text"),
        ("text: |-\n  old\ntext: duplicate\n", "$.text"),
    ] {
        assert!(copy(s, p, "copy").is_err(), "{s}");
        assert!(moved(s, p, "down").is_err(), "{s}");
    }
}
#[test]
fn boundaries_stale_ranges_utf8_invalid_source_and_size_budget_are_local() {
    let s = "text: |-\n  文😀\nother: true\n";
    let f = entry(s, "$.text").field.unwrap();
    assert!(moved(s, "$.text", "up").is_err());
    assert!(moved(s, "$.other", "down").is_err());
    assert!(moved(s, "$.text", "sideways").is_err());
    for (a, b) in [(f.start + 1, f.end), (0, usize::MAX), (usize::MAX, 0)] {
        assert!(copy_yaml_field_source(s, a, b, "copy").is_err());
        assert!(move_yaml_field_source(s, a, b, "down").is_err());
    }
    assert!(copy_yaml_field_source("text: [broken", 0, 4, "copy").is_err());
    let s = format!(
        "text: |-\n  {}\nother: true\n",
        "x".repeat(MAX_YAML_SOURCE_BYTES / 2)
    );
    assert!(copy(&s, "$.text", "copy").is_err());
}
#[test]
fn forms_and_paragraph_corpus_preserve_values_copy_order_and_inverse() {
    for marker in ["|-", ">-", "|2-", ">2-", "|", ">", "|+", ">+"] {
        for text in ["plain", "中文😀", "# body", "  code", "first\n\nlast", ""] {
            let body = text
                .split('\n')
                .map(|l| format!("    {l}\n"))
                .collect::<String>();
            let s =
                format!("root:\n  text: {marker} # attached\n{body}  other: 0xFF\nnext: true\n");
            let r = copy(&s, "$.root.text", "copy").unwrap_or_else(|e| panic!("copy {s:?}: {e}"));
            assert_eq!(
                decoded(&r.content, "$.root.copy"),
                decoded(&s, "$.root.text")
            );
            let r = moved(&s, "$.root.text", "down").unwrap_or_else(|e| panic!("move {s:?}: {e}"));
            assert_eq!(
                decoded(&r.content, "$.root.text"),
                decoded(&s, "$.root.text")
            );
            assert_eq!(moved(&r.content, "$.root.text", "up").unwrap().content, s);
        }
    }
}
