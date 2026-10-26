use super::*;
fn moved(s: &str, p: &str, d: &str) -> Result<YamlKeyChange, String> {
    let f = analyze_yaml_source(s)
        .outline
        .into_iter()
        .find(|e| e.path == p)
        .unwrap()
        .field
        .unwrap();
    move_yaml_field_source(s, f.start, f.end, d)
}
#[test]
fn block_preserves_raw_keys_values_attached_comments_and_history_inverse() {
    let s = "label: 原稿\nfirst : 0xFF # first\n'二😀': '内容' # second\nthird: true\n";
    let c = moved(s, "$[\"二😀\"]", "up").unwrap();
    assert_eq!(
        c.content,
        "label: 原稿\n'二😀': '内容' # second\nfirst : 0xFF # first\nthird: true\n"
    );
    assert_eq!(&c.content[c.start..c.end], "'二😀'");
    assert_eq!(moved(&c.content, "$[\"二😀\"]", "down").unwrap().content, s);
}
#[test]
fn flow_delimiters_spaces_trailing_comma_and_unrelated_values_stay_exact() {
    let s = "x: {a: 0xFF,  b : '文😀', c: true,}\nother: [1, 2]\n";
    let c = moved(s, "$.x.b", "up").unwrap();
    assert_eq!(
        c.content,
        "x: {b : '文😀',  a: 0xFF, c: true,}\nother: [1, 2]\n"
    );
    assert_eq!(&c.content[c.start..c.end], "b");
    assert_eq!(moved(&c.content, "$.x.b", "down").unwrap().content, s);
}
#[test]
fn nested_parent_and_quoted_dotted_names_are_not_display_path_guesses() {
    let s = "outer:\n  a: 1\n  b: 2\nnext:\n  a: 3\n  b: 4\n'a.b': literal\nz: false\n";
    assert_eq!(
        moved(s, "$.outer.b", "up").unwrap().content,
        s.replace("  a: 1\n  b: 2", "  b: 2\n  a: 1")
    );
    assert!(moved(s, "$.outer.a", "up").is_err());
    assert_eq!(
        moved(s, "$[\"a.b\"]", "down").unwrap().content,
        s.replace("'a.b': literal\nz: false", "z: false\n'a.b': literal")
    );
}
#[test]
fn separated_comments_keep_their_slot_but_ambiguous_comments_are_refused() {
    let s = "label: x\na: 1 # a\n\n# independent\n\nb: 2 # b\n";
    assert_eq!(
        moved(s, "$.a", "down").unwrap().content,
        "label: x\nb: 2 # b\n\n# independent\n\na: 1 # a\n"
    );
    for s in [
        "a: 1\n# next\nb: 2\n",
        "# header\na: 1\nb: 2\n",
        "x: {a: 1, # note\n b: 2}\n",
    ] {
        let p = if s.starts_with("x:") { "$.x.a" } else { "$.a" };
        assert!(moved(s, p, "down").is_err());
    }
}
#[test]
fn bom_crlf_blank_lines_and_missing_final_newline_remain_exact() {
    let s = "\u{feff}a: 1 # a\r\n\r\nb: '文😀' # b";
    let c = moved(s, "$.b", "up").unwrap();
    assert_eq!(c.content, "\u{feff}b: '文😀' # b\r\n\r\na: 1 # a");
    assert_eq!(&c.content[c.start..c.end], "b");
    assert_eq!(moved(&c.content, "$.b", "down").unwrap().content, s);
}
#[test]
fn rejects_complex_multiline_anchors_tags_merge_multidoc_and_compact_rows() {
    for (s, p) in [
        ("a: [1]\nb: 2\n", "$.a"),
        ("a: &id 1\nb: 2\n", "$.a"),
        ("a: !tag 1\nb: 2\n", "$.a"),
        ("<<: {x: 1}\na: 1\nb: 2\n", "$.a"),
        ("a: 1\nb: 2\n---\nc: 3\n", "$.a"),
        ("- a: 1\n  b: 2\n", "$[0].a"),
    ] {
        assert!(moved(s, p, "down").is_err(), "{s}");
    }
}
#[test]
fn rejects_boundaries_invalid_directions_stale_utf8_and_non_key_ranges() {
    let s = "'文😀': 1\nb: 2\n";
    assert!(moved(s, "$[\"文😀\"]", "up").is_err());
    assert!(moved(s, "$.b", "down").is_err());
    assert!(moved(s, "$.b", "left").is_err());
    for (a, b) in [(0, 0), (2, 4), (usize::MAX, usize::MAX), (12, 11), (0, 999)] {
        assert!(move_yaml_field_source(s, a, b, "down").is_err());
    }
    assert!(move_yaml_field_source("a: 1\na: 2\n", 0, 1, "down").is_err());
}
#[test]
fn repeated_moves_use_fresh_ranges_and_existing_source_budget() {
    let s = "a: 1\nb: 2\nc: 3\n";
    let c = moved(s, "$.a", "down").unwrap();
    let c = moved(&c.content, "$.a", "down").unwrap();
    assert_eq!(c.content, "b: 2\nc: 3\na: 1\n");
    assert_eq!(&c.content[c.start..c.end], "a");
    assert!(move_yaml_field_source(&" ".repeat(8 * 1024 * 1024 + 1), 0, 1, "down").is_err());
}
