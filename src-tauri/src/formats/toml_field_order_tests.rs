use super::*;
fn moved(s: &str, p: &str, d: &str) -> Result<TomlKeyChange, String> {
    let f = analyze_toml_source(s)
        .outline
        .into_iter()
        .find(|e| e.path == p)
        .unwrap()
        .field
        .unwrap();
    move_toml_field_source(s, f.start, f.end, d)
}
#[test]
fn preserves_raw_keys_values_dates_comments_and_inverse() {
    let s = "label='原稿'\nfirst = 0xFF # first\n'二😀' = '内容' # second\nthird = 1979-05-27T07:32:00Z\n";
    let c = moved(s, "[\"二😀\"]", "up").unwrap();
    assert_eq!(c.content, "label='原稿'\n'二😀' = '内容' # second\nfirst = 0xFF # first\nthird = 1979-05-27T07:32:00Z\n");
    assert_eq!(&c.content[c.start..c.end], "'二😀'");
    assert_eq!(moved(&c.content, "[\"二😀\"]", "down").unwrap().content, s);
    let c = moved(s, "third", "up").unwrap();
    assert_eq!(
        c.content,
        s.replace(
            "'二😀' = '内容' # second\nthird = 1979-05-27T07:32:00Z",
            "third = 1979-05-27T07:32:00Z\n'二😀' = '内容' # second"
        )
    );
}
#[test]
fn ordinary_tables_nested_and_literal_dotted_keys_use_parser_ownership() {
    let s = "root=1\nnext=2\n[a.b]\nx=1\ny=2\n[a]\nx=3\ny=4\n'z.q'=true\n";
    assert_eq!(
        moved(s, "a.b.y", "up").unwrap().content,
        s.replace("x=1\ny=2", "y=2\nx=1")
    );
    assert_eq!(
        moved(s, "a[\"z.q\"]", "up").unwrap().content,
        s.replace("y=4\n'z.q'=true", "'z.q'=true\ny=4")
    );
    assert!(moved(s, "a.b.x", "up").is_err());
    assert!(moved(s, "next", "down").is_err());
}
#[test]
fn separated_comments_keep_slots_but_ambiguous_comments_stay_local() {
    let s = "[a]\nx=1 # x\n\n# independent\n\ny=2 # y\n";
    assert_eq!(
        moved(s, "a.x", "down").unwrap().content,
        "[a]\ny=2 # y\n\n# independent\n\nx=1 # x\n"
    );
    for s in [
        "x=1\n# next\ny=2\n",
        "# header\nx=1\ny=2\n",
        "x=1\n\n# next\ny=2\n",
        "x=1\n# next\n\ny=2\n",
    ] {
        assert!(moved(s, "x", "down").is_err(), "{s}");
    }
}
#[test]
fn bom_crlf_indentation_and_missing_final_newline_stay_exact() {
    let s = "\u{feff} \tx = 8_080 # x\r\n\r\n  y='文😀' # y";
    let c = moved(s, "y", "up").unwrap();
    assert_eq!(c.content, "\u{feff}  y='文😀' # y\r\n\r\n \tx = 8_080 # x");
    assert_eq!(&c.content[c.start..c.end], "y");
    assert_eq!(moved(&c.content, "y", "down").unwrap().content, s);
}
#[test]
fn rejects_collections_multiline_dotted_and_array_tables_without_rewriting() {
    for (s, p) in [
        ("x=[1]\ny=2\n", "x"),
        ("x={a=1}\ny=2\n", "x"),
        ("x='''a\nb'''\ny=2\n", "x"),
        ("a.x=1\na.y=2\n", "a.x"),
        ("[[a]]\nx=1\ny=2\n", "a[0].x"),
    ] {
        assert!(moved(s, p, "down").is_err(), "{s}");
    }
    assert!(moved("x=1\ny=[2]\n", "x", "down").is_err());
}
#[test]
fn boundaries_invalid_directions_non_key_and_utf8_ranges_are_rejected() {
    let s = "'文😀'=1\ny=2\n";
    assert!(moved(s, "[\"文😀\"]", "up").is_err());
    assert!(moved(s, "y", "down").is_err());
    assert!(moved(s, "y", "left").is_err());
    for (a, b) in [
        (0, 0),
        (2, 4),
        (usize::MAX, usize::MAX),
        (12, 11),
        (0, 999),
        (10, 11),
    ] {
        assert!(move_toml_field_source(s, a, b, "down").is_err());
    }
    assert!(move_toml_field_source("x=1\nx=2\n", 0, 1, "down").is_err());
}
#[test]
fn fresh_ranges_repeat_moves_and_keep_whole_document_bytes() {
    let s = "[a]\nx=1\ny=2\nz=3\n[b]\nx='keep'\n";
    let c = moved(s, "a.x", "down").unwrap();
    let c = moved(&c.content, "a.x", "down").unwrap();
    assert_eq!(c.content, "[a]\ny=2\nz=3\nx=1\n[b]\nx='keep'\n");
    assert_eq!(&c.content[c.start..c.end], "x");
    assert!(moved(&c.content, "a.x", "down").is_err());
}
#[test]
fn source_budget_and_invalid_source_remain_bounded() {
    assert!(move_toml_field_source(&" ".repeat(MAX_TOML_SOURCE_BYTES + 1), 0, 1, "down").is_err());
    for s in ["x=1\ny=", "x=1\n[a]\nx=1\n[a]\ny=2"] {
        assert!(move_toml_field_source(s, 0, 1, "down").is_err());
    }
}
