use super::*;
fn entry(s: &str, p: &str) -> YamlOutlineEntry {
    let a = analyze_yaml_source(s);
    assert!(a.valid, "{s:?}: {:?}", a.diagnostics);
    a.outline.into_iter().find(|e| e.path == p).unwrap()
}
fn copy(s: &str, p: &str) -> Result<YamlKeyChange, String> {
    let e = entry(s, p);
    copy_yaml_sequence_item_source(s, e.start, e.end)
}
fn moved(s: &str, p: &str, d: &str) -> Result<YamlKeyChange, String> {
    let e = entry(s, p);
    move_yaml_sequence_item_source(s, e.start, e.end, d)
}
fn decoded(s: &str, p: &str) -> String {
    let e = entry(s, p);
    inspect_yaml_literal_source(s, e.start, e.end).unwrap()
}
#[test]
fn copy_preserves_full_block_header_inline_comment_and_all_other_bytes() {
    for marker in ["|-", ">-", "|2-", ">-2", "|", ">+"] {
        let raw = format!("  - {marker} # my paragraph\n    第一行😀\n    第二行\n");
        let s = format!(
            "label: 原稿\nitems:\n{raw}  - 0xFF # sibling\nother: 9007199254740993123456789\n"
        );
        let r = copy(&s, "$.items[0]").unwrap();
        assert_eq!(r.content, s.replace(&raw, &format!("{raw}{raw}")));
        assert_eq!(
            decoded(&r.content, "$.items[0]"),
            decoded(&r.content, "$.items[1]")
        );
        let e = entry(&r.content, "$.items[1]");
        assert_eq!((r.start, r.end), (e.start, e.end));
    }
}
#[test]
fn adjacent_blocks_swap_exactly_and_inverse_restores_original() {
    let a = "  - |- # first\n    第一段\n    多行\n";
    let b = "  - >- # second\n    第二段\n    折叠\n";
    let s = format!("items:\n{a}{b}next: 8_080\n");
    for (p, d) in [("$.items[0]", "down"), ("$.items[1]", "up")] {
        let r = moved(&s, p, d).unwrap();
        assert_eq!(r.content, format!("items:\n{b}{a}next: 8_080\n"));
        let path = if d == "up" {
            "$.items[0]"
        } else {
            "$.items[1]"
        };
        let e = entry(&r.content, path);
        assert_eq!((r.start, r.end), (e.start, e.end));
        assert_eq!(
            moved(&r.content, path, if d == "up" { "down" } else { "up" })
                .unwrap()
                .content,
            s
        );
    }
}
#[test]
fn mixed_single_line_neighbors_remain_copyable_and_movable() {
    let s = "items:\n  - |- # block\n    long\n    text\n  - 0xFF # number\nlast: true\n";
    let r = moved(s, "$.items[1]", "up").unwrap();
    assert_eq!(
        r.content,
        "items:\n  - 0xFF # number\n  - |- # block\n    long\n    text\nlast: true\n"
    );
    assert_eq!(
        copy(s, "$.items[1]").unwrap().content,
        s.replace("last:", "  - 0xFF # number\nlast:")
    );
}
#[test]
fn independent_comments_stay_in_their_slot_ambiguous_comments_reject() {
    let s = "items:\n  - |- # first\n    text\n\n  # independent\n\n  - true # second\nlast: 1\n";
    let r = moved(s, "$.items[0]", "down").unwrap();
    assert_eq!(
        r.content,
        "items:\n  - true # second\n\n  # independent\n\n  - |- # first\n    text\nlast: 1\n"
    );
    assert_eq!(
        copy(s, "$.items[0]").unwrap().content,
        s.replace(
            "\n\n  # independent",
            "\n  - |- # first\n    text\n\n  # independent"
        )
    );
    for s in [
        "items:\n  # attached?\n  - |-\n    old\n  - 1\n",
        "items:\n  - |-\n    old\n  # next?\n  - 1\n",
    ] {
        assert!(moved(s, "$.items[0]", "down").is_err());
    }
    let s = "items:\n  - |-\n    old\n  # next?\n  - false\n";
    assert!(copy(s, "$.items[0]").is_ok());
    assert!(copy(s, "$.items[1]").is_err());
}
#[test]
fn bom_crlf_nested_parent_and_quoted_keys_preserve_byte_ranges() {
    let s="\u{feff}# 中文😀\r\nroot:\r\n  'a.b':\r\n    - >2- # old\r\n      first\r\n      wrapped\r\n    - false\r\nother:\r\n  - |-\r\n    keep\r\n";
    let p = "$.root[\"a.b\"][0]";
    let r = moved(s, p, "down").unwrap();
    assert_eq!(
        r.content,
        s.replace(
            "    - >2- # old\r\n      first\r\n      wrapped\r\n    - false",
            "    - false\r\n    - >2- # old\r\n      first\r\n      wrapped"
        )
    );
    assert_eq!(decoded(&r.content, "$.root[\"a.b\"][1]"), decoded(s, p));
    assert!(r.content.starts_with('\u{feff}'));
    assert!(!r.content.replace("\r\n", "").contains('\n'));
}
#[test]
fn root_sequence_and_missing_final_newline_work_without_reformatting() {
    let s = "\u{feff}- |- # first\n  text\n- >- # second\n  other";
    let r = moved(s, "$[0]", "down").unwrap();
    assert_eq!(
        r.content,
        "\u{feff}- >- # second\n  other\n- |- # first\n  text"
    );
    let r = copy("- |-\n  text", "$[0]").unwrap();
    assert_eq!(r.content, "- |-\n  text\n- |-\n  text");
    assert_eq!(decoded(&r.content, "$[0]"), decoded(&r.content, "$[1]"));
}
#[test]
fn empty_blocks_keep_chomping_and_remain_addressable() {
    for m in ["|", ">-", "|+"] {
        let s = format!("items:\n  - {m}\n  - false\nnext: true\n");
        let r = copy(&s, "$.items[0]")
            .unwrap_or_else(|e| panic!("copy {s:?}: {e}; {:?}", analyze_yaml_source(&s).outline));
        assert_eq!(
            decoded(&r.content, "$.items[0]"),
            decoded(&r.content, "$.items[1]")
        );
        assert!(
            analyze_yaml_source(
                &moved(&s, "$.items[0]", "down")
                    .unwrap_or_else(|e| panic!("move {s:?}: {e}"))
                    .content
            )
            .valid
        );
    }
    // The loader gives an empty final clipped block a different value at EOF.
    // Keep the original draft instead of changing its chomping or its value.
    assert!(moved("items:\n  - |\n  - false\n", "$.items[0]", "down").is_err());
}
#[test]
fn keep_chomp_blank_lines_and_hash_text_travel_with_the_block() {
    let s = "items:\n  - |+ # header\n    # actual body\n    text\n\n\n  - true\nnext: 0xFF\n";
    let r = moved(s, "$.items[0]", "down").unwrap();
    assert_eq!(
        decoded(&r.content, "$.items[1]"),
        "# actual body\ntext\n\n\n"
    );
    let r = copy(s, "$.items[0]").unwrap();
    assert_eq!(decoded(&r.content, "$.items[1]"), decoded(s, "$.items[0]"));
}
#[test]
fn complex_reference_compact_multidoc_and_ambiguous_parent_stay_local() {
    for (s, p) in [
        ("items:\n  - |-\n    old\n  - [1]\n", "$.items[0]"),
        (
            "items: &id\n  - |-\n    old\n  - true\ncopy: *id\n",
            "$.items[0]",
        ),
        ("items:\n  - |-\n    old\n  - &id true\n", "$.items[0]"),
        ("- - |-\n    old\n  - true\n", "$[0][0]"),
        (
            "items:\n - |-\n   old\n - true\n---\nother: 1\n",
            "$.items[0]",
        ),
        ("<<: {a: 1}\nitems:\n - |-\n   old\n - true\n", "$.items[0]"),
    ] {
        assert!(copy(s, p).is_err(), "{s}");
        assert!(moved(s, p, "down").is_err(), "{s}");
    }
}
#[test]
fn boundaries_stale_ranges_utf8_invalid_source_and_budgets_do_not_mutate() {
    let s = "- |-\n  文😀\n- true\n";
    let e = entry(s, "$[0]");
    assert!(moved(s, "$[0]", "up").is_err());
    assert!(moved(s, "$[1]", "down").is_err());
    assert!(moved(s, "$[0]", "sideways").is_err());
    for (a, b) in [(e.start + 1, e.end), (0, usize::MAX), (usize::MAX, 0)] {
        assert!(copy_yaml_sequence_item_source(s, a, b).is_err());
        assert!(move_yaml_sequence_item_source(s, a, b, "down").is_err());
    }
    assert!(copy_yaml_sequence_item_source("items: [broken", 0, 1).is_err());
    let s = format!(
        "- |-\n  {}\n- true\n",
        "x".repeat(MAX_YAML_SOURCE_BYTES / 2)
    );
    assert!(copy(&s, "$[0]").is_err());
}
#[test]
fn block_forms_and_paragraph_corpus_preserve_values_through_copy_move_and_inverse() {
    for marker in ["|-", ">-", "|2-", ">2-", "|", ">", "|+", ">+"] {
        for text in ["plain", "中文😀", "# body", "  code", "first\n\nlast", ""] {
            let body = text
                .split('\n')
                .map(|l| format!("    {l}\n"))
                .collect::<String>();
            let s = format!("items:\n  - {marker} # attached\n{body}  - 0xFF\nnext: true\n");
            let r = copy(&s, "$.items[0]").unwrap_or_else(|e| panic!("copy {s:?}: {e}"));
            assert_eq!(decoded(&r.content, "$.items[1]"), decoded(&s, "$.items[0]"));
            let r = moved(&s, "$.items[0]", "down").unwrap_or_else(|e| panic!("move {s:?}: {e}"));
            assert_eq!(decoded(&r.content, "$.items[1]"), decoded(&s, "$.items[0]"));
            assert_eq!(moved(&r.content, "$.items[1]", "up").unwrap().content, s);
        }
    }
}
