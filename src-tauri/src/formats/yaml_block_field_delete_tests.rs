use super::*;

fn remove(source: &str, path: &str) -> Result<YamlKeyChange, String> {
    let a = analyze_yaml_source(source);
    assert!(a.valid, "{source:?}: {:?}", a.diagnostics);
    let field = a
        .outline
        .into_iter()
        .find(|e| e.path == path)
        .unwrap()
        .field
        .unwrap();
    remove_yaml_field_source(source, field.start, field.end)
}

#[test]
fn removes_complete_literal_folded_header_and_body_but_keeps_comments() {
    for marker in ["|", ">", "|-", ">-", "|+", ">+", "|2-", ">-2"] {
        let source = format!("# document\nroot:\n  # independent before\n  text: {marker} # header\n    中文😀\n    # actual paragraph\n    last\n\n  # independent after\n\n  next: 0xFF # untouched\nlast: 9007199254740993123456789\n");
        let result = remove(&source, "$.root.text").unwrap();
        let blank = if marker.contains('+') { "" } else { "\n" };
        assert_eq!(result.content, format!("# document\nroot:\n  # independent before\n  # header\n{blank}  # independent after\n\n  next: 0xFF # untouched\nlast: 9007199254740993123456789\n"), "{marker}");
        assert_eq!(&result.content[result.start..result.end], "next");
    }
}

#[test]
fn deletes_first_middle_last_with_adjacent_block_siblings_unchanged() {
    let a = "  a: |-\n    first\n";
    let b = "  b: >-\n    second\n    folded\n";
    let c = "  c: |+\n    third\n\n";
    let source = format!("root:\n{a}{b}{c}other: true\n");
    for (key, unit, next) in [("a", a, "b"), ("b", b, "c"), ("c", c, "b")] {
        let r = remove(&source, &format!("$.root.{key}")).unwrap();
        assert_eq!(r.content, source.replacen(unit, "", 1));
        assert_eq!(&r.content[r.start..r.end], next);
    }
}

#[test]
fn unique_nested_and_root_field_remain_explicit_empty_mappings() {
    for (s, p, want) in [
        ("text: |- # keep\n  body\n", "$.text", "{} # keep\n"),
        (
            "root:\n  text: >-\n    body\nlast: true\n",
            "$.root.text",
            "root:\n  {}\nlast: true\n",
        ),
        (
            "root:\n  # independent\n  text: |+ # keep\n    body\n\nlast: 1\n",
            "$.root.text",
            "root:\n  # independent\n  {} # keep\nlast: 1\n",
        ),
    ] {
        let r = remove(s, p).unwrap();
        assert_eq!(r.content, want);
        assert_eq!(&r.content[r.start..r.end], "{}");
    }
}

#[test]
fn bom_crlf_quoted_unicode_keys_and_missing_final_newline_are_preserved() {
    let s="\u{feff}# 中文😀\r\nroot:\r\n  'a.b':\r\n    '文字😀': >2- # keep\r\n      a\r\n      b\r\n    next: false\r\nlast: 8_080";
    let r = remove(s, "$.root[\"a.b\"][\"文字😀\"]").unwrap();
    assert_eq!(
        r.content,
        s.replace(
            "    '文字😀': >2- # keep\r\n      a\r\n      b\r\n",
            "    # keep\r\n"
        )
    );
    assert_eq!(&r.content[r.start..r.end], "next");
    assert!(!r.content.replace("\r\n", "").contains('\n'));
    let r = remove("first: true\ntext: |-\n  body", "$.text").unwrap();
    assert_eq!(r.content, "first: true\n");
    assert_eq!(&r.content[r.start..r.end], "first");
}

#[test]
fn empty_blocks_with_or_without_final_header_newline_are_deletable() {
    for m in ["|", ">-", "|+", ">2-", "|-2"] {
        for tail in ["", "\n", " # keep", " # keep\n"] {
            let s = format!("text: {m}{tail}");
            let r = remove(&s, "$.text").unwrap();
            assert_eq!(
                r.content,
                format!(
                    "{{}}{}{}",
                    if tail.contains('#') { " # keep" } else { "" },
                    if tail.ends_with('\n') { "\n" } else { "" }
                ),
                "{s:?}"
            );
        }
        let s = format!("root:\n  text: {m}\n  next: true\n");
        assert_eq!(
            remove(&s, "$.root.text").unwrap().content,
            "root:\n  next: true\n"
        );
    }
}

#[test]
fn repeated_deletion_selects_sibling_then_empty_parent() {
    let s = "root:\n  first: |- # one\n    a\n  second: >- # two\n    b\nlast: 0xFF\n";
    let r = remove(s, "$.root.first").unwrap();
    assert_eq!(&r.content[r.start..r.end], "second");
    let r = remove(&r.content, "$.root.second").unwrap();
    assert_eq!(r.content, "root:\n  # one\n  {} # two\nlast: 0xFF\n");
    assert_eq!(&r.content[r.start..r.end], "{}");
}

#[test]
fn indented_sequence_mapping_is_supported_but_shared_dash_header_is_local() {
    let s = "items:\n  -\n    text: |- # keep\n      body\n    next: true\nother: 1\n";
    let r = remove(s, "$.items[0].text").unwrap();
    assert_eq!(
        r.content,
        s.replace("    text: |- # keep\n      body\n", "    # keep\n")
    );
    assert!(remove(
        "items:\n  - text: |-\n      body\n    next: true\n",
        "$.items[0].text"
    )
    .is_err());
}

#[test]
fn aliases_anchors_tags_merge_keys_multidoc_and_collections_stay_local() {
    for (s, p) in [
        ("text: &id |-\n  body\ncopy: *id\n", "$.text"),
        (
            "root: &id\n  text: |-\n    body\ncopy: *id\n",
            "$.root.text",
        ),
        ("text: !!str |-\n  body\nother: true\n", "$.text"),
        ("<<: {other: true}\ntext: |-\n  body\n", "$.text"),
        ("text: |-\n  body\n---\nother: 1\n", "$.text"),
        ("text: [1,2]\nother: |-\n  body\n", "$.text"),
        ("text: 'multiple\n  lines'\nother: true\n", "$.text"),
    ] {
        assert!(remove(s, p).is_err(), "{s}");
    }
}

#[test]
fn stale_utf8_invalid_source_and_out_of_range_input_do_not_panic() {
    let s = "text: |-\n  中文😀\nother: true\n";
    for (a, b) in [(1, 4), (0, usize::MAX), (usize::MAX, 0), (0, 1)] {
        assert!(remove_yaml_field_source(s, a, b).is_err());
    }
    assert!(remove_yaml_field_source("text: [bad", 0, 4).is_err());
}

#[test]
fn marker_paragraph_corpus_deletes_only_the_selected_field() {
    for marker in ["|", ">", "|-", ">-", "|+", ">+", "|2-", ">-2"] {
        for body in ["plain", "中文😀", "# body", "  code", "first\n\nlast", ""] {
            let text = body
                .split('\n')
                .map(|l| format!("    {l}\n"))
                .collect::<String>();
            let s = format!("root:\n  value: {marker}\n{text}  other: 0xFF # keep\nlast: true\n");
            let r = remove(&s, "$.root.value").unwrap_or_else(|e| panic!("{s:?}: {e}"));
            assert!(r.content.ends_with("  other: 0xFF # keep\nlast: true\n"));
            assert!(!r.content.contains("value:"));
            assert_eq!(&r.content[r.start..r.end], "other");
        }
    }
}
