use super::*;

fn entry(s: &str, p: &str) -> TomlOutlineEntry {
    analyze_toml_source(s)
        .outline
        .into_iter()
        .find(|e| e.path == p)
        .unwrap()
}
fn move_item(s: &str, path: &str, index: usize, direction: &str) -> Result<TomlKeyChange, String> {
    let e = entry(s, path);
    let item = inspect_toml_array_items_source(s, e.start, e.end)?.remove(index);
    move_toml_array_item_source(s, e.start, e.end, item.start, item.end, direction)
}

#[test]
fn flow_keeps_raw_types_unicode_bom_crlf_and_other_tables() {
    let s = "\u{feff}# 中文😀\r\n[root]\r\nitems = [0xFF, '内容,#😀', true, 2026-10-25,]\r\n[other]\r\nitems = [8_080]\r\n";
    let r = move_item(s, "root.items", 1, "up").unwrap();
    assert_eq!(r.content, s.replace("0xFF, '内容,#😀'", "'内容,#😀', 0xFF"));
    assert_eq!(&r.content[r.start..r.end], "'内容,#😀'");
    assert_eq!(r.content.len(), s.len());
    assert_eq!(
        move_item(&r.content, "root.items", 0, "down")
            .unwrap()
            .content,
        s
    );
    let r = move_item(s, "root.items", 3, "up").unwrap();
    assert!(r.content.contains("2026-10-25, true,"));
    assert_eq!(&r.content[r.start..r.end], "2026-10-25");
}

#[test]
fn line_comments_travel_but_comma_slots_and_eol_stay() {
    for comma in ["", ","] {
        let s = format!("items = [\r\n  0xFF, # first\r\n\t'😀'{comma} # second, keep\r\n] # array\r\nother = 8_080");
        let want = format!("items = [\r\n  '😀', # second, keep\r\n\t0xFF{comma} # first\r\n] # array\r\nother = 8_080");
        let r = move_item(&s, "items", 1, "up").unwrap();
        assert_eq!(r.content, want);
        assert_eq!(&r.content[r.start..r.end], "'😀'");
        assert_eq!(
            move_item(&r.content, "items", 0, "down").unwrap().content,
            s
        );
    }
    let s = "x = [\n  1  , # one\n  2,\n]\n";
    let r = move_item(s, "x", 0, "down").unwrap();
    assert_eq!(r.content, "x = [\n  2  ,\n  1, # one\n]\n");
    assert_eq!(&r.content[r.start..r.end], "1");
}

#[test]
fn independent_comments_keep_slots_ambiguous_comments_fall_back() {
    let s = "x = [\n  1, # one\n\n# independent\n\n  2, # two\n]\n";
    let want = "x = [\n  2, # two\n\n# independent\n\n  1, # one\n]\n";
    assert_eq!(move_item(s, "x", 0, "down").unwrap().content, want);
    for s in [
        "x = [\n# attached\n  1,\n  2\n]\n",
        "x = [\n  1,\n# attached\n  2\n]\n",
        "x = [\n  1,\n  2\n# attached\n]\n",
        "x = [1, # ambiguous\n 2]\n",
        "x = [ # header\n 1,\n 2\n]\n",
    ] {
        assert!(move_item(s, "x", 0, "down").is_err(), "{s}");
    }
}

#[test]
fn rejects_complex_dotted_array_tables_and_wrong_ownership() {
    for (s, p) in [
        ("x = [[1], 2]", "x"),
        ("x = [{a=1}, 2]", "x"),
        ("x = ['''text''', 2]", "x"),
        ("x = [\"\"\"a\nb\"\"\", 2]", "x"),
        ("a.b = [1,2]", "a.b"),
        ("[[a]]\nx = [1,2]\n", "a[0].x"),
    ] {
        assert!(move_item(s, p, 0, "down").is_err(), "{s}");
    }
    let s = "a = [1,2]\nb = ['😀',4]\n";
    let a = entry(s, "a");
    let b = entry(s, "b");
    let i = inspect_toml_array_items_source(s, b.start, b.end)
        .unwrap()
        .remove(0);
    assert!(move_toml_array_item_source(s, a.start, a.end, i.start, i.end, "down").is_err());
    assert!(move_toml_array_item_source(s, b.start, b.end, i.start + 2, i.end, "down").is_err());
    assert!(move_toml_array_item_source(s, usize::MAX, 0, 0, 1, "down").is_err());
    assert!(move_toml_array_item_source("x = [1,", 4, 7, 5, 6, "down").is_err());
}

#[test]
fn boundaries_direction_and_identical_neighbors_are_local_errors() {
    let s = "x = [1,2]";
    assert!(move_item(s, "x", 0, "up").is_err());
    assert!(move_item(s, "x", 1, "down").is_err());
    assert!(move_item(s, "x", 0, "sideways").is_err());
    assert!(move_item("x = [1]", "x", 0, "down").is_err());
    assert!(move_item("x = [1,1]", "x", 0, "down").is_err());
    let e = entry("x = []", "x");
    assert!(move_toml_array_item_source("x = []", e.start, e.end, e.start, e.end, "down").is_err());
}

#[test]
fn obeys_analysis_and_item_limits_without_growing_source() {
    let s = format!("x = [{}]", vec!["1"; 2001].join(","));
    let e = entry(&s, "x");
    assert!(
        move_toml_array_item_source(&s, e.start, e.end, e.start + 1, e.start + 2, "down").is_err()
    );
    assert!(move_toml_array_item_source(
        &" ".repeat(MAX_TOML_SOURCE_BYTES + 1),
        0,
        1,
        0,
        1,
        "down"
    )
    .is_err());
}

#[test]
fn repeated_moves_then_copy_use_fresh_value_range_and_same_parent() {
    let s = "\"a.b\" = ['😀',0xFF,true]\nother=[9,8]\n";
    let r = move_item(s, "[\"a.b\"]", 0, "down").unwrap();
    let r = move_item(&r.content, "[\"a.b\"]", 1, "down").unwrap();
    assert_eq!(r.content, "\"a.b\" = [0xFF,true,'😀']\nother=[9,8]\n");
    let e = entry(&r.content, "[\"a.b\"]");
    let copy = copy_toml_array_item_source(&r.content, e.start, e.end, r.start, r.end).unwrap();
    assert_eq!(
        copy.content,
        "\"a.b\" = [0xFF,true,'😀', '😀']\nother=[9,8]\n"
    );
}

#[test]
fn equal_literals_with_distinct_comments_still_move_owned_items() {
    let s = "x = [\n  1, # first\n  1 # second\n]\n";
    let r = move_item(s, "x", 0, "down").unwrap();
    assert_eq!(r.content, "x = [\n  1, # second\n  1 # first\n]\n");
    assert_eq!(&r.content[r.start..r.end], "1");
    assert_eq!(move_item(&r.content, "x", 1, "up").unwrap().content, s);
}
