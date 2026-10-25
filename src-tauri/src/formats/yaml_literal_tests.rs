use super::*;
fn selected(source: &str, path: &str) -> YamlOutlineEntry {
    let a = analyze_yaml_source(source);
    assert!(a.valid, "{:?}", a.diagnostics);
    a.outline.into_iter().find(|e| e.path == path).unwrap()
}
fn edit(source: &str, path: &str, text: &str) -> String {
    let e = selected(source, path);
    assert!(e.literal && e.editable, "{path} {e:?}");
    replace_yaml_value_source(source, e.start, e.end, text).unwrap()
}
fn text(source: &str, path: &str) -> String {
    let e = selected(source, path);
    inspect_yaml_literal_source(source, e.start, e.end).unwrap()
}

#[test]
fn readable_prefill_preserves_each_chomping_mode_and_noop_exactly() {
    for (marker, expected) in [
        ("|", "one\ntwo\n"),
        ("|-", "one\ntwo"),
        ("|+", "one\ntwo\n\n"),
    ] {
        let s = format!("text: {marker} # 保留\n  one\n  two\n\nnext: 0xFF\n");
        assert_eq!(text(&s, "$.text"), expected);
        assert_eq!(edit(&s, "$.text", expected), s);
    }
}

#[test]
fn preserves_bom_crlf_header_comments_indentation_and_unrelated_literals() {
    let s="\u{feff}# 我的草稿😀\r\n'a.b': |2- # 头注释\r\n  原文\r\n    缩进文字\r\n\r\n# 其他注释\r\nnext: 9007199254740993123456789\r\nquoted: 'literal'\r\n";
    assert_eq!(text(s, "$[\"a.b\"]"), "原文\n  缩进文字");
    let changed = edit(s, "$[\"a.b\"]", "新的😀\n  缩进文字");
    assert_eq!(changed, s.replace("  原文\r\n", "  新的😀\r\n"));
    assert_eq!(text(&changed, "$[\"a.b\"]"), "新的😀\n  缩进文字");
}

#[test]
fn nested_and_sequence_mapping_fields_keep_next_field_indent_and_ownership() {
    let s="a:\n  text: |-\n    same\n  next: keep\nb:\n  text: |-\n    same\n  next: keep\nrows:\n  - text: |2-\n      same\n    next: keep\n  - text: |-\n      same\n    next: keep\n";
    let changed = edit(s, "$.rows[0].text", "新\n内容");
    assert_eq!(
        changed,
        s.replacen(
            "text: |2-\n      same\n",
            "text: |2-\n      新\n      内容\n",
            1
        )
    );
    assert_eq!(
        edit(s, "$.b.text", "新"),
        s.replace("b:\n  text: |-\n    same", "b:\n  text: |-\n    新")
    );
}

#[test]
fn text_controls_trailing_newlines_without_manual_yaml_syntax() {
    for marker in ["|", "|-", "|+", "|2-", "|-2"] {
        let s = format!("text: {marker} # keep\n  old\n\nnext: true\n");
        for value in ["new", "new\n", "new\n\n", "new\n\n\n", "", "\n", "\n\n"] {
            let changed = edit(&s, "$.text", value);
            assert_eq!(
                text(&changed, "$.text"),
                value,
                "{marker} {value:?} {changed:?}"
            );
            assert!(changed.contains("# keep\n"));
            assert!(changed.ends_with("next: true\n"));
            if marker.contains('2') {
                assert!(changed.contains('2'));
            }
        }
    }
}

#[test]
fn empty_existing_blocks_remain_editable_and_consecutive_edits_keep_draft() {
    for s in [
        "text: |\n",
        "text: |-\nnext: keep\n",
        "text: |\n\n# comment\nnext: keep\n",
    ] {
        let first = edit(s, "$.text", "first\nsecond");
        assert_eq!(text(&first, "$.text"), "first\nsecond");
        let second = edit(&first, "$.text", "");
        assert_eq!(text(&second, "$.text"), "");
        let third = edit(&second, "$.text", "中文😀\n");
        assert_eq!(text(&third, "$.text"), "中文😀\n");
    }
}

#[test]
fn keeps_no_eof_newline_when_its_value_is_representable() {
    let s = "text: |\n  original";
    assert_eq!(text(s, "$.text"), "original\n");
    assert_eq!(edit(s, "$.text", "changed\n"), "text: |\n  changed");
    assert_eq!(edit(s, "$.text", "changed"), "text: |-\n  changed");
}

#[test]
fn preserves_nonsemantic_blank_separators_and_outdented_comments() {
    let s = "a:\n  text: |- # header\n    one\n    two\n\n  # next field\n  next: keep\n";
    assert_eq!(
        edit(s, "$.a.text", "新\n文字"),
        s.replace("    one\n    two\n", "    新\n    文字\n")
    );
    assert!(edit(s, "$.a.text", "新\n\n").ends_with("  # next field\n  next: keep\n"));
    // Exact installed-workflow outcome: the parser owns ignored blank rows
    // after a strip block; switching to keep must not append an extra one.
    let installed = include_str!("../../tests/fixtures/formats/yaml-literal-edit.yaml").replace("\r\n", "\n").replace("原稿", "我的草稿");
    let edited = installed.replace("  第二行\n", "  修改后的第二行\n");
    let conflict = edited.replace("strip: |- # 保留\n  第一行😀\n  修改后的第二行\n\n", "strip: |+ # 保留\n  第一行😀\n  修改后的第二行\n  \n");
    for eol in ["\n", "\r\n"] {
        let original = installed.replace('\n', eol);
        let edited = edited.replace('\n', eol);
        assert_eq!(edit(&original, "$.strip", "第一行😀\n修改后的第二行"), edited);
        assert_eq!(edit(&edited, "$.strip", "第一行😀\n修改后的第二行\n\n"), conflict.replace('\n', eol));
    }
}

#[test]
fn folded_anchored_tagged_merged_complex_and_multidoc_stay_local_fallback() {
    for s in [
        "text: >\n  folded\n",
        "text: &id |\n  anchor\ncopy: *id\n",
        "text: !custom |\n  tagged\n",
        "base: &id {other: x}\nm:\n  <<: *id\n  text: |\n    merged\n",
        "? 'multi\n  key'\n: |\n  value\n",
        "---\ntext: |\n  first\n---\ntext: |\n  second\n",
        "|\n  root\n",
    ] {
        let a = analyze_yaml_source(s);
        assert!(a.valid, "{s} {:?}", a.diagnostics);
        for e in a.outline.iter().filter(|e| {
            e.kind == "scalar"
                && (e.path.contains("text") || e.path == "$" || e.path.contains("multi"))
        }) {
            assert!(!e.literal && !e.editable, "{s} {e:?}");
            assert!(replace_yaml_value_source(s, e.start, e.end, "new").is_err());
            assert!(inspect_yaml_literal_source(s, e.start, e.end).is_err());
        }
    }
}

#[test]
fn text_that_looks_like_yaml_is_encoded_as_text_and_other_values_stay_identical() {
    let s = "text: |-\n  old\nother: true\n";
    let value = "title: evil\n# still text\n---\n&anchor !tag [a,b]\n  leading\n\t代码\n";
    let changed = edit(s, "$.text", value);
    assert_eq!(text(&changed, "$.text"), value);
    assert!(changed.ends_with("other: true\n"));
    assert_eq!(selected(&changed, "$.other").preview, "true");
}

#[test]
fn invalid_ranges_control_input_and_budgets_never_replace_source() {
    let s = "# 中文😀\ntext: |-\n  old\nnext: keep\n";
    let e = selected(s, "$.text");
    for (a, b) in [
        (e.start + 1, e.end),
        (e.start, e.end - 1),
        (1, 3),
        (usize::MAX, usize::MAX),
    ] {
        assert!(replace_yaml_value_source(s, a, b, "new").is_err());
        assert!(inspect_yaml_literal_source(s, a, b).is_err());
    }
    for v in ["bad\0text", "bad\rtext", "bad\u{85}text", "bad\u{2028}text"] {
        assert!(replace_yaml_value_source(s, e.start, e.end, v).is_err());
    }
    assert!(
        replace_yaml_value_source(s, e.start, e.end, &"a".repeat(MAX_YAML_SOURCE_BYTES + 1))
            .is_err()
    );
    assert!(inspect_yaml_literal_source("text: [broken", 0, 4).is_err());
    assert_eq!(text(&edit(s, "$.text", "one\r\ntwo"), "$.text"), "one\ntwo");
}
