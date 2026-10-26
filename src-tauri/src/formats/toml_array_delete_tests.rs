use super::*;

fn entry(s: &str, path: &str) -> TomlOutlineEntry {
    analyze_toml_source(s)
        .outline
        .into_iter()
        .find(|e| e.path == path)
        .unwrap()
}
fn del(s: &str, path: &str, index: usize) -> Result<TomlKeyChange, String> {
    let e = entry(s, path);
    let v = inspect_toml_array_items_source(s, e.start, e.end)?.remove(index);
    remove_toml_array_item_source(s, e.start, e.end, v.start, v.end)
}
fn selected(c: &TomlKeyChange) -> &str {
    &c.content[c.start..c.end]
}

#[test]
fn inline_first_middle_last_and_trailing_comma_select_actual_neighbor() {
    for raw in [
        "'''a\nb'''",
        "\"\"\"a\\n中\n末尾\"\"\"",
        "'''text'''",
        "\"\"\"末尾\"\"\"\"\"",
    ] {
        for comma in ["", ","] {
            let s = format!("x = [0xFF, {raw}, true{comma}]\nother = 8_080\n");
            let c = del(&s, "x", 1).unwrap();
            assert_eq!(
                c.content,
                format!("x = [0xFF,  true{comma}]\nother = 8_080\n")
            );
            assert_eq!(selected(&c), "true");
            let s = format!("x = [{raw}, 0xFF{comma}]");
            assert_eq!(
                del(&s, "x", 0).unwrap().content,
                format!("x = [ 0xFF{comma}]")
            );
            let s = format!("x = [0xFF, {raw}{comma}]");
            let c = del(&s, "x", 1).unwrap();
            assert_eq!(
                c.content,
                format!("x = [0xFF{} ]", if comma.is_empty() { "" } else { "," })
            );
            assert_eq!(selected(&c), "0xFF");
        }
    }
}

#[test]
fn unique_item_becomes_legal_empty_array_with_parent_selection() {
    for comma in ["", ","] {
        let s = format!("x = [\n  '''a\nb'''{comma} # keep\n]\nother = 8_080\n");
        let c = del(&s, "x", 0).unwrap();
        assert_eq!(c.content, "x = [\n   # keep\n]\nother = 8_080\n");
        assert_eq!(selected(&c), "[\n   # keep\n]");
        let e = entry(&c.content, "x");
        assert!(inspect_toml_array_items_source(&c.content, e.start, e.end)
            .unwrap()
            .is_empty());
    }
}

#[test]
fn physical_closing_comments_stay_standalone_and_independent_gap_is_exact() {
    let a = "  '''a\nb''', # first\n";
    let b = "  \"\"\"second\nbody\"\"\", # second\n";
    let gap = "\n# independent\n\n";
    for comma in ["", ","] {
        let c = format!("  0xFF{comma} # number\n");
        let s = format!("x = [\n{a}{gap}{b}{c}]\n");
        assert_eq!(
            del(&s, "x", 0).unwrap().content,
            s.replacen(a, "   # first\n", 1)
        );
        assert_eq!(
            del(&s, "x", 1).unwrap().content,
            s.replacen(b, "   # second\n", 1)
        );
        let r = del(&s, "x", 2).unwrap();
        let want = s.replacen(&c, "   # number\n", 1);
        assert_eq!(
            r.content,
            if comma.is_empty() {
                want.replace("body\"\"\", # second", "body\"\"\" # second")
            } else {
                want
            }
        );
    }
}

#[test]
fn bom_crlf_nested_quoted_key_and_unrelated_literal_spelling_survive() {
    let s="\u{feff}# 中文😀\r\n[root]\r\n\"a.b\" = [\r\n  '''first\r\nbody''', # own\r\n  0xFF\r\n]\r\n[other]\r\nx = 8_080\r\n";
    let c = del(s, "root[\"a.b\"]", 0).unwrap();
    assert_eq!(c.content, s.replace("'''first\r\nbody''',", ""));
    assert_eq!(selected(&c), "0xFF");
}

#[test]
fn opening_newline_hash_body_blank_and_empty_values_delete_whole_literal() {
    for raw in [
        "\"\"\"\n# body\n\ntext\\\n  continued\n\"\"\"",
        "'''# text\n\n'''",
        "''''''",
        "\"\"\"\n\"\"\"",
    ] {
        let s = format!("x = [{raw}, 8_080]\n");
        assert_eq!(del(&s, "x", 0).unwrap().content, "x = [ 8_080]\n");
    }
}

#[test]
fn ordinary_scalars_among_multiline_items_delete_without_rewriting_neighbors() {
    let raw = "'''first\nbody'''";
    for scalar in ["0xFF", "8_080", "1.20e+2", "true", "2026-10-27", "'字😀'"] {
        let s = format!("x = [{raw}, {scalar}, \"\"\"last\"\"\"]");
        let c = del(&s, "x", 1).unwrap();
        assert_eq!(c.content, format!("x = [{raw},  \"\"\"last\"\"\"]"));
        assert_eq!(selected(&c), "\"\"\"last\"\"\"");
    }
}

#[test]
fn repeated_deletion_and_existing_copy_move_use_current_ranges() {
    let s = "x = ['''a\nb''', 0xFF, \"\"\"last\"\"\"]\n";
    let c = del(s, "x", 1).unwrap();
    let e = entry(&c.content, "x");
    let v = inspect_toml_array_items_source(&c.content, e.start, e.end)
        .unwrap()
        .remove(0);
    let copied = copy_toml_array_item_source(&c.content, e.start, e.end, v.start, v.end).unwrap();
    let d = del(&copied.content, "x", 1).unwrap();
    assert_eq!(d.content, c.content.replace(",  ", ",   "));
    let mut current = s.to_string();
    for _ in 0..3 {
        current = del(&current, "x", 0).unwrap().content;
    }
    assert!(analyze_toml_source(&current).valid);
    assert_eq!(current, "x = [  ]\n");
}

#[test]
fn complex_scopes_stale_partial_utf8_and_invalid_source_are_local_errors() {
    for (s, p) in [
        ("x = ['''a''',[1]]", "x"),
        ("x = ['''a''',{a=1}]", "x"),
        ("a.x = ['''a''']", "a.x"),
        ("[[a]]\nx = ['''a''']", "a[0].x"),
    ] {
        assert!(del(s, p, 0).is_err(), "{s}");
    }
    let s = "x = ['''中文😀''',true]";
    let e = entry(s, "x");
    for (a, b) in [(8, 9), (usize::MAX, 0), (e.start, e.end), (e.end, e.start)] {
        assert!(remove_toml_array_item_source(s, e.start, e.end, a, b).is_err());
    }
    assert!(remove_toml_array_item_source("x = [", 4, 5, 4, 5).is_err());
}

#[test]
fn shared_line_comments_fallback_but_retained_standalone_comments_allow_next_delete() {
    for s in [
        "x = ['''a''', # inline\n 1]",
        "x = [\n '''a\nb''', 1, # shared\n true\n]",
    ] {
        assert!(del(s, "x", 0).is_err(), "{s}");
    }
    let s = "x = [\n# keep\n '''a\nb''', # first\n '''next''', # next\n]\n";
    let c = del(s, "x", 0).unwrap();
    let d = del(&c.content, "x", 0).unwrap();
    assert_eq!(d.content, "x = [\n# keep\n  # first\n  # next\n]\n");
}

#[test]
fn item_source_budgets_and_duplicate_values_do_not_guess_target() {
    let s = format!("x = ['''a''',{}]", vec!["1"; 1999].join(","));
    let c = del(&s, "x", 0).unwrap();
    let e = entry(&c.content, "x");
    assert_eq!(
        inspect_toml_array_items_source(&c.content, e.start, e.end)
            .unwrap()
            .len(),
        1999
    );
    let s = format!("x = ['''a''',{}]", vec!["1"; 2000].join(","));
    assert!(del(&s, "x", 0).is_err());
    assert!(
        remove_toml_array_item_source(&" ".repeat(MAX_TOML_SOURCE_BYTES + 1), 0, 0, 0, 0).is_err()
    );
    assert_eq!(
        del("x = ['''a''','''a''','''a''']", "x", 1)
            .unwrap()
            .content,
        "x = ['''a''','''a''']"
    );
}

#[test]
fn physical_form_corpus_preserves_every_byte_outside_literal_and_one_comma() {
    for eol in ["\n", "\r\n"] {
        for bom in ["", "\u{feff}"] {
            for comma in ["", ","] {
                for raw in [
                    "'''a\nb'''",
                    "\"\"\"a\\n中\n末尾\"\"\"",
                    "'''# body\n\n'''",
                    "\"\"\"\nopening\n\"\"\"",
                ] {
                    let s=format!("{bom}x = [\n  {raw}, # own\n\n# independent\n\n  0xFF{comma} # number\n]\nother = 8_080\n").replace('\n',eol);
                    let c = del(&s, "x", 0).unwrap();
                    assert_eq!(
                        c.content,
                        s.replacen(&(raw.to_string() + ",").replace('\n', eol), "", 1)
                    );
                    assert_eq!(selected(&c), "0xFF");
                }
            }
        }
    }
}
