use super::*;

fn change(
    s: &str,
    path: &str,
    index: usize,
    direction: Option<&str>,
) -> Result<TomlKeyChange, String> {
    let e = analyze_toml_source(s)
        .outline
        .into_iter()
        .find(|e| e.path == path)
        .unwrap();
    let item = inspect_toml_array_items_source(s, e.start, e.end)?.remove(index);
    match direction {
        Some(d) => move_toml_array_item_source(s, e.start, e.end, item.start, item.end, d),
        None => copy_toml_array_item_source(s, e.start, e.end, item.start, item.end),
    }
}

#[test]
fn inline_literal_and_basic_copy_exact_spelling_and_selection() {
    for raw in [
        "'''第一行😀\n第二行'''",
        "\"\"\"转义\\n\\u4E2D\\\\路径\n段落\"\"\"",
        "'''text'''",
        "\"\"\"末尾\"\"\"\"\"",
    ] {
        let s = format!("x = [{raw}, 0xFF]\nother = 8_080\n");
        let c = change(&s, "x", 0, None).unwrap();
        assert_eq!(c.content, s.replacen(raw, &format!("{raw}, {raw}"), 1));
        assert_eq!(&c.content[c.start..c.end], raw);
    }
}

#[test]
fn physical_copy_carries_closing_comment_and_keeps_independent_gap() {
    let a = "  '''first\nline''', # first\n";
    let gap = "\n# independent\n\n";
    let s = format!("x = [\n{a}{gap}  \"\"\"second\"\"\", # second\n]\n");
    let c = change(&s, "x", 0, None).unwrap();
    assert_eq!(c.content, s.replacen(a, &format!("{a}{a}"), 1));
    assert_eq!(&c.content[c.start..c.end], "'''first\nline'''");
}

#[test]
fn last_copy_inserts_required_comma_before_comment_and_keeps_trailing_policy() {
    for comma in ["", ","] {
        let s = format!("x = [\n  0xFF,\n  '''last'''{comma} # last\n]\n");
        let c = change(&s, "x", 1, None).unwrap();
        assert_eq!(
            c.content,
            format!("x = [\n  0xFF,\n  '''last''', # last\n  '''last'''{comma} # last\n]\n")
        );
        assert_eq!(&c.content[c.start..c.end], "'''last'''");
    }
}

#[test]
fn move_keeps_comma_slots_comment_ownership_and_is_reversible() {
    for comma in ["", ","] {
        let s = format!("x = [\n  '''first\nline'''  , # first\n\n# independent\n\n\t\"\"\"second\"\"\"{comma} # second\n]\n");
        let c = change(&s, "x", 0, Some("down")).unwrap();
        assert_eq!(c.content,format!("x = [\n  \"\"\"second\"\"\"  , # second\n\n# independent\n\n\t'''first\nline'''{comma} # first\n]\n"));
        assert_eq!(&c.content[c.start..c.end], "'''first\nline'''");
        assert_eq!(change(&c.content, "x", 1, Some("up")).unwrap().content, s);
    }
}

#[test]
fn bom_crlf_nested_quoted_keys_and_unrelated_raw_values_are_untouched() {
    let s = "\u{feff}# 中文😀\r\n[root]\r\n\"a.b\" = [\r\n  '''first\r\nline''', # one\r\n  0xFF # number\r\n]\r\n[other]\r\nx = 8_080\r\n";
    let c = change(s, "root[\"a.b\"]", 1, Some("up")).unwrap();
    assert_eq!(
        c.content,
        s.replace("'''first\r\nline''', # one", "0xFF, # number")
            .replace("0xFF # number", "'''first\r\nline''' # one")
    );
    let c = change(&c.content, "root[\"a.b\"]", 1, None).unwrap();
    assert!(c
        .content
        .contains("'''first\r\nline''', # one\r\n  '''first\r\nline''' # one"));
}

#[test]
fn opening_newline_escaped_line_continuation_hash_body_and_blank_paragraphs_survive() {
    let raw = "\"\"\"\n# body\n\ntext\\\n  continued\n\"\"\"";
    let s = format!("x = [{raw}, 0xFF]");
    let c = change(&s, "x", 0, Some("down")).unwrap();
    assert_eq!(c.content, format!("x = [0xFF, {raw}]"));
    let c = change(&c.content, "x", 1, None).unwrap();
    assert_eq!(c.content, format!("x = [0xFF, {raw}, {raw}]"));
}

#[test]
fn scalar_neighbors_and_repeated_copy_move_use_new_parser_ranges() {
    let s = "x = ['''a\nb''', 0xFF, true]\ny = 8_080\n";
    let c = change(s, "x", 1, None).unwrap();
    assert_eq!(c.content, s.replace("0xFF, true", "0xFF, 0xFF, true"));
    let c = change(&c.content, "x", 0, Some("down")).unwrap();
    let c = change(&c.content, "x", 1, None).unwrap();
    assert_eq!(
        c.content,
        "x = [0xFF, '''a\nb''', '''a\nb''', 0xFF, true]\ny = 8_080\n"
    );
    assert_eq!(&c.content[c.start..c.end], "'''a\nb'''");
}

#[test]
fn ambiguous_leading_closing_and_header_comments_keep_source_unchanged() {
    for s in [
        "x = [\n# attached?\n  '''a''',\n  1\n]",
        "x = [\n  '''a''',\n  1\n# attached?\n]",
        "x = [ # header\n  '''a''',\n  1\n]",
        "x = ['''a''', # inline\n 1]",
    ] {
        assert!(change(s, "x", 0, None).is_err(), "{s}");
        assert!(change(s, "x", 0, Some("down")).is_err(), "{s}");
    }
}

#[test]
fn complex_nested_array_table_dotted_key_and_stale_ranges_are_local_errors() {
    for (s, p) in [
        ("x = ['''a''', [1]]", "x"),
        ("x = ['''a''', {a=1}]", "x"),
        ("a.x = ['''a''',1]", "a.x"),
        ("[[a]]\nx = ['''a''',1]", "a[0].x"),
    ] {
        assert!(change(s, p, 0, None).is_err());
        assert!(change(s, p, 0, Some("down")).is_err());
    }
    let s = "x = ['''中文😀''',1]";
    let e = analyze_toml_source(s).outline.remove(0);
    for (a, b) in [(8, 9), (usize::MAX, 0), (e.start, e.end)] {
        assert!(copy_toml_array_item_source(s, e.start, e.end, a, b).is_err());
        assert!(move_toml_array_item_source(s, e.start, e.end, a, b, "down").is_err());
    }
}

#[test]
fn budgets_boundaries_and_identical_literals_remain_local() {
    let s = format!("x = ['''a''',{}]", vec!["1"; 1999].join(","));
    assert!(change(&s, "x", 0, None).is_err());
    let s = "x = ['''a''','''a''']";
    assert!(change(s, "x", 0, Some("up")).is_err());
    assert!(change(s, "x", 1, Some("down")).is_err());
    assert!(change(s, "x", 0, Some("down")).is_err());
    let s = format!("x = ['''{}''']", "a".repeat(MAX_TOML_SOURCE_BYTES / 2));
    assert!(change(&s, "x", 0, None).is_err());
}

#[test]
fn physical_literal_corpus_preserves_all_bytes_except_owned_clone_or_swap() {
    for eol in ["\n", "\r\n"] {
        for bom in ["", "\u{feff}"] {
            for comma in ["", ","] {
                for raw in [
                    "'''a\nb'''",
                    "\"\"\"a\\n中\n末尾\"\"\"",
                    "'''# text\n\n'''",
                    "\"\"\"\nopening\n\"\"\"",
                ] {
                    let a = format!("  {raw}, # selected\n");
                    let b = format!("  0xFF{comma} # number\n");
                    let s = format!("{bom}x = [\n{a}\n# independent\n\n{b}]\nother = 8_080\n")
                        .replace('\n', eol);
                    let c = change(&s, "x", 0, None).unwrap();
                    assert_eq!(
                        c.content,
                        s.replacen(
                            &a.replace('\n', eol),
                            &format!("{a}{a}").replace('\n', eol),
                            1
                        )
                    );
                    let m = change(&s, "x", 0, Some("down")).unwrap();
                    assert_eq!(change(&m.content, "x", 1, Some("up")).unwrap().content, s);
                }
            }
        }
    }
}
