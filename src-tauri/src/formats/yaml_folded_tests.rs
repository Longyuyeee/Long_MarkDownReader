use super::*;

fn selected(source: &str, path: &str) -> YamlOutlineEntry {
    let analysis = analyze_yaml_source(source);
    assert!(analysis.valid, "{source:?}: {:?}", analysis.diagnostics);
    analysis
        .outline
        .into_iter()
        .find(|e| e.path == path)
        .unwrap()
}
fn text(source: &str, path: &str) -> String {
    let e = selected(source, path);
    inspect_yaml_literal_source(source, e.start, e.end).unwrap()
}
fn edit(source: &str, path: &str, value: &str) -> String {
    let e = selected(source, path);
    assert!(e.folded && e.editable && !e.literal, "{e:?}");
    replace_yaml_value_source(source, e.start, e.end, value)
        .unwrap_or_else(|error| panic!("{source:?} => {value:?}: {error}"))
}

#[test]
fn parser_prefill_decodes_wrapping_paragraphs_indent_and_chomping() {
    for (marker, ending) in [(">", "\n"), (">-", ""), (">+", "\n\n")] {
        let source = format!("text: {marker} # keep\n  first\n  wrapped\n\n  paragraph\n    indented\n    code\n  last\n\nnext: 0xFF\n");
        let value = format!("first wrapped\nparagraph\n  indented\n  code\nlast{ending}");
        assert_eq!(text(&source, "$.text"), value);
        assert_eq!(edit(&source, "$.text", &value), source);
    }
}

#[test]
fn paragraphs_keep_folded_form_and_all_other_bytes() {
    let s = "# 中文😀\ntext: >- # comment\n  original\n  wrap\n\n# outside\nnext: 9007199254740993123456789\n";
    let changed = edit(s, "$.text", "第一段😀\n第二段\n\n第三段");
    assert_eq!(
        changed,
        s.replace(
            "  original\n  wrap\n",
            "  第一段😀\n  \n  第二段\n  \n  \n  第三段\n"
        )
    );
    assert_eq!(text(&changed, "$.text"), "第一段😀\n第二段\n\n第三段");
    assert!(!changed.contains('|'));
}

#[test]
fn mixed_normal_more_indented_and_blank_lines_preserve_semantics() {
    let s = "text: >-\n  old\nnext: true\n";
    for value in [
        "plain\n  code\n  more\nplain",
        "plain\n\n  code\n\nplain",
        "plain\n\n\n  code\n\n\nplain",
        "\n\nfirst\nsecond\n",
        "  leading\nplain\n\tcode\nplain",
        "  \nplain\n  \nlast",
        "one  \ntwo \n\nthree  ",
        "title: text\n# still text\n---\n&anchor !tag [a,b]",
    ] {
        let changed = edit(s, "$.text", value);
        assert_eq!(text(&changed, "$.text"), value, "{changed:?}");
        assert!(changed.ends_with("next: true\n"));
    }
}

#[test]
fn each_chomp_handles_empty_text_only_newlines_and_trailing_whitespace() {
    for marker in [">", ">-", ">+", ">2-", ">-2", ">+2"] {
        let s = format!("text: {marker} # keep\n  old\n\nnext: true\n");
        for value in [
            "new",
            "new\n",
            "new\n\n",
            "new\n\n\n",
            "",
            "\n",
            "\n\n",
            "  ",
            "  \n",
            "a\n  ",
            "a\n  \n",
        ] {
            let changed = edit(&s, "$.text", value);
            assert_eq!(text(&changed, "$.text"), value, "{marker} {changed:?}");
            assert!(changed.contains("# keep\n"));
            assert!(changed.ends_with("next: true\n"));
        }
    }
}

#[test]
fn quoted_nested_and_sequence_fields_have_exact_ownership() {
    let s = "'a.b': >-\n  same\na:\n  text: >-\n    same\n  next: keep\nrows:\n  - text: >2- # header\n      same\n    next: keep\n  - text: >-\n      same\n    next: keep\n";
    for path in ["$[\"a.b\"]", "$.a.text", "$.rows[0].text", "$.rows[1].text"] {
        let changed = edit(s, path, "新\n段落\n  代码");
        assert_eq!(text(&changed, path), "新\n段落\n  代码");
        for other in ["$[\"a.b\"]", "$.a.text", "$.rows[0].text", "$.rows[1].text"] {
            if other != path {
                assert_eq!(text(&changed, other), "same");
            }
        }
    }
}

#[test]
fn bom_crlf_and_existing_explicit_indent_are_preserved() {
    let s = "\u{feff}# 中文😀\r\ntext: >2- # comment\r\n  old\r\n\r\nnext: 0xFF\r\n";
    let changed = edit(s, "$.text", "新😀\r\n  代码\r\n段落");
    assert_eq!(text(&changed, "$.text"), "新😀\n  代码\n段落");
    assert!(changed.starts_with("\u{feff}# 中文😀\r\ntext: >2- # comment\r\n"));
    assert!(changed.ends_with("\r\nnext: 0xFF\r\n"));
    assert!(!changed.replace("\r\n", "").contains('\n'));
}

#[test]
fn eof_newline_preserved_when_semantics_allow_it() {
    let s = "text: >\n  original";
    assert_eq!(edit(s, "$.text", "changed\n"), "text: >\n  changed");
    assert_eq!(edit(s, "$.text", "changed"), "text: >-\n  changed");
    assert_eq!(text(&edit(s, "$.text", "a\nb"), "$.text"), "a\nb");
}

#[test]
fn empty_blocks_and_consecutive_edits_remain_editable() {
    for s in [
        "text: >\n",
        "text: >-\nnext: keep\n",
        "text: >+\n\n# next\nnext: keep\n",
    ] {
        let first = edit(s, "$.text", "first\nsecond");
        let empty = edit(&first, "$.text", "");
        let third = edit(&empty, "$.text", "  code\nparagraph\n\n");
        assert_eq!(text(&third, "$.text"), "  code\nparagraph\n\n");
    }
}

#[test]
fn unsupported_ownership_stays_source_only_without_affecting_plain_field() {
    for body in [
        "text: &id >\n  value\ncopy: *id\n",
        "text: !custom >\n  value\n",
        "base: &id {other: x}\nm:\n  <<: *id\n  text: >\n    merged\n",
        "? 'multi\n  key'\n: >\n  value\n",
        "---\ntext: >\n  first\n---\ntext: >\n  second\n",
        ">\n  root\n",
    ] {
        let a = analyze_yaml_source(body);
        assert!(a.valid, "{body}");
        for e in a.outline.iter().filter(|e| e.kind == "scalar") {
            if e.path.contains("text") || e.path == "$" || e.path.contains("multi") {
                assert!(!e.folded && !e.editable, "{body}: {e:?}");
                assert!(replace_yaml_value_source(body, e.start, e.end, "new").is_err());
                assert!(inspect_yaml_literal_source(body, e.start, e.end).is_err());
            }
        }
    }
}

#[test]
fn stale_ranges_controls_and_size_fail_without_mutation() {
    let s = "# 中文😀\ntext: >-\n  old\nnext: keep\n";
    let e = selected(s, "$.text");
    for (start, end) in [
        (e.start + 1, e.end),
        (e.start, e.end - 1),
        (1, 3),
        (usize::MAX, usize::MAX),
    ] {
        assert!(replace_yaml_value_source(s, start, end, "new").is_err());
        assert!(inspect_yaml_literal_source(s, start, end).is_err());
    }
    for value in ["bad\0text", "bad\rtext", "bad\u{85}text", "bad\u{2028}text"] {
        assert!(replace_yaml_value_source(s, e.start, e.end, value).is_err());
    }
    assert!(
        replace_yaml_value_source(s, e.start, e.end, &"x".repeat(MAX_YAML_SOURCE_BYTES + 1))
            .is_err()
    );
}

#[test]
fn compact_paragraph_corpus_roundtrips_against_real_parser() {
    let lines = ["a", "b ", "  code", "\tcode", "  ", ""];
    for first in lines {
        for second in lines {
            for third in lines {
                let value = format!("{first}\n{second}\n{third}");
                let changed = edit("text: >-\n  old\nnext: keep\n", "$.text", &value);
                assert_eq!(text(&changed, "$.text"), value);
            }
        }
    }
}
