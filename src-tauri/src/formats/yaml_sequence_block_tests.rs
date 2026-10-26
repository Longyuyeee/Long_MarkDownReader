use super::*;

fn selected(source: &str, path: &str) -> YamlOutlineEntry {
    let a = analyze_yaml_source(source);
    assert!(a.valid, "{source:?}: {:?}", a.diagnostics);
    a.outline.into_iter().find(|e| e.path == path).unwrap()
}
fn text(source: &str, path: &str) -> String {
    let e = selected(source, path);
    inspect_yaml_literal_source(source, e.start, e.end).unwrap()
}
fn edit(source: &str, path: &str, value: &str) -> String {
    let e = selected(source, path);
    assert!(
        e.editable && (e.literal || e.folded) && e.field.is_none(),
        "{source:?}: {e:?}"
    );
    replace_yaml_value_source(source, e.start, e.end, value)
        .unwrap_or_else(|error| panic!("{source:?} => {value:?}: {error}"))
}
#[test]
fn readable_prefill_and_exact_noop_for_both_block_styles() {
    for (marker, expected) in [
        ("|-", "first\nwrapped"),
        (">-", "first wrapped"),
        ("|", "first\nwrapped\n"),
        (">+", "first wrapped\n\n"),
    ] {
        let s = format!(
            "items:\n  - {marker} # keep\n    first\n    wrapped\n\n  - sibling\nnext: 0xFF\n"
        );
        assert_eq!(text(&s, "$.items[0]"), expected);
        assert_eq!(edit(&s, "$.items[0]", expected), s);
    }
}
#[test]
fn only_selected_body_changes_and_following_item_comments_survive() {
    for marker in ["|-", ">-"] {
        let s = format!("# before\nitems:\n  - {marker} # header\n    old\n\n  # sibling comment\n  - keep\nnext: 9007199254740993123456789\n");
        let result = edit(&s, "$.items[0]", "新😀\n段落");
        assert_eq!(text(&result, "$.items[0]"), "新😀\n段落");
        assert!(result.starts_with(&format!("# before\nitems:\n  - {marker} # header\n")));
        assert!(
            result.ends_with("\n  # sibling comment\n  - keep\nnext: 9007199254740993123456789\n")
        );
    }
}
#[test]
fn nested_sequences_and_same_text_select_one_item_only() {
    let s =
        "root:\n  -\n    - |-\n      same\n    - >-\n      same\n  - |-\n    same\nother: same\n";
    for path in ["$.root[0][0]", "$.root[0][1]", "$.root[1]"] {
        let result = edit(s, path, "new\n  code");
        for other in ["$.root[0][0]", "$.root[0][1]", "$.root[1]"] {
            assert_eq!(
                text(&result, other),
                if path == other { "new\n  code" } else { "same" }
            );
        }
    }
}
#[test]
fn bom_crlf_and_explicit_indentation_keep_all_other_bytes() {
    for marker in ["|2-", ">-2", "|+2", ">2+"] {
        let s = format!("\u{feff}# 中文😀\r\nitems:\r\n  - {marker} # keep\r\n    old\r\n  - keep\r\nlast: true\r\n");
        let r = edit(&s, "$.items[0]", "新😀\r\n  代码\r\n末尾");
        assert_eq!(text(&r, "$.items[0]"), "新😀\n  代码\n末尾");
        assert!(r.starts_with("\u{feff}# 中文😀\r\nitems:\r\n"));
        assert!(r.ends_with("  - keep\r\nlast: true\r\n"));
        assert!(!r.replace("\r\n", "").contains('\n'));
    }
}
#[test]
fn root_sequence_bom_and_missing_eof_newline_are_supported() {
    for s in ["- |-\n  old", "\u{feff}- >-\n  old"] {
        let r = edit(s, "$[0]", "new\nparagraph");
        assert_eq!(text(&r, "$[0]"), "new\nparagraph");
        assert!(!r.ends_with('\n'));
    }
}
#[test]
fn empty_blocks_and_repeated_edits_remain_addressable() {
    for s in [
        "items:\n  - |\n  - next\n",
        "items:\n  - >-\n",
        "items:\n  - |+\n\n# keep\nnext: true\n",
    ] {
        let r = edit(s, "$.items[0]", "first\nsecond");
        let r = edit(&r, "$.items[0]", "");
        let r = edit(&r, "$.items[0]", "  code\nparagraph\n\n");
        assert_eq!(text(&r, "$.items[0]"), "  code\nparagraph\n\n");
    }
}
#[test]
fn body_corpus_roundtrips_chomping_and_paragraph_boundaries() {
    let parts = [
        "plain",
        "中文😀",
        "  code",
        "\tcode",
        "# text",
        "- text",
        "",
        "  ",
    ];
    for marker in ["|-", ">-"] {
        let s = format!("items:\n  - {marker}\n    old\n  - keep\nlast: 0xFF\n");
        for a in parts {
            for b in parts {
                for trailing in ["", "\n", "\n\n", "\n\n\n"] {
                    let v = format!("{a}\n{b}{trailing}");
                    let r = edit(&s, "$.items[0]", &v);
                    assert_eq!(text(&r, "$.items[0]"), v);
                    assert!(r.ends_with("  - keep\nlast: 0xFF\n"));
                }
            }
        }
    }
}
#[test]
fn anchors_tags_merge_multidoc_compact_and_root_scalar_stay_source_only() {
    for s in [
        "items: &id\n  - |\n    old\ncopy: *id\n",
        "items:\n  - &id >\n    old\n  - *id\n",
        "items:\n  - !custom |\n    old\n",
        "base: &id {a: b}\nm:\n  <<: *id\n  items:\n    - |\n      old\n",
        "---\n- |\n  old\n---\n- |\n  next\n",
        "- - |\n    compact\n",
        "|\n  root\n",
    ] {
        let a = analyze_yaml_source(s);
        assert!(a.valid, "{s:?}");
        for e in a.outline.iter().filter(|e| {
            e.kind == "scalar" && e.preview.contains("old")
                || e.preview.contains("compact")
                || e.path == "$" && e.kind == "scalar"
        }) {
            assert!(!e.editable && !e.literal && !e.folded, "{s:?}: {e:?}");
            assert!(replace_yaml_value_source(s, e.start, e.end, "new").is_err());
            assert!(inspect_yaml_literal_source(s, e.start, e.end).is_err());
        }
    }
}
#[test]
fn invalid_input_and_stale_ranges_do_not_modify_source() {
    let s = "items:\n  - |-\n    old\n  - keep\n";
    let e = selected(s, "$.items[0]");
    for v in ["bad\0text", "bad\rtext", "bad\u{85}text", "bad\u{2028}text"] {
        assert!(replace_yaml_value_source(s, e.start, e.end, v).is_err());
    }
    assert!(replace_yaml_value_source(s, e.start + 1, e.end, "new").is_err());
    assert!(inspect_yaml_literal_source(s, e.start, e.end + 1).is_err());
    assert_eq!(text(s, "$.items[0]"), "old");
}
