use super::*;

fn remove(source: &str, path: &str) -> Result<TomlKeyChange, String> {
    let field = analyze_toml_source(source)
        .outline
        .into_iter()
        .find(|e| e.path == path)
        .and_then(|e| e.field)
        .unwrap();
    remove_toml_field_source(source, field.start, field.end)
}

fn selected(change: &TomlKeyChange) -> &str {
    &change.content[change.start..change.end]
}

#[test]
fn removes_whole_literal_and_basic_fields_and_selects_fresh_neighbor() {
    let source = "first = '''第一行😀\n第二行''' # first\nsecond = \"\"\"后段\\n\n尾行\"\"\" # second\nlast = 0xFF\n";
    let first = remove(source, "first").unwrap();
    assert_eq!(first.content, "# first\nsecond = \"\"\"后段\\n\n尾行\"\"\" # second\nlast = 0xFF\n");
    assert_eq!(selected(&first), "second");
    let middle = remove(source, "second").unwrap();
    assert_eq!(middle.content, "first = '''第一行😀\n第二行''' # first\n# second\nlast = 0xFF\n");
    assert_eq!(selected(&middle), "last");
    let last = remove(source, "last").unwrap();
    assert_eq!(selected(&last), "second");
}

#[test]
fn closing_comments_stay_independent_and_body_hash_lines_are_removed() {
    let source = "# before\n[a]\n  text = \"\"\"\n# body\n\n[not_a_table]\n\"\"\"  # closing\n# neighbor\nother = 8_080\n[b]\nkept='unchanged'\n";
    let changed = remove(source, "a.text").unwrap();
    assert_eq!(changed.content, "# before\n[a]\n  # closing\n# neighbor\nother = 8_080\n[b]\nkept='unchanged'\n");
    assert_eq!(selected(&changed), "other");
    let empty = remove(&changed.content, "a.other").unwrap();
    assert_eq!(empty.content, "# before\n[a]\n  # closing\n# neighbor\n[b]\nkept='unchanged'\n");
    assert!(selected(&empty).starts_with("[a]"));
}

#[test]
fn unique_root_and_table_fields_leave_valid_empty_parent() {
    for literal in ["'''a\nb'''", "\"\"\"\n\"\"\"", "''''''", "\"\"\"\"\"\""] {
        let root = remove(&format!("text={literal}"), "text").unwrap();
        assert_eq!(root.content, "");
        assert_eq!((root.start, root.end), (0, 0));
        let table = remove(&format!("[a]\ntext={literal}\n[b]\ny=1"), "a.text").unwrap();
        assert_eq!(table.content, "[a]\n[b]\ny=1");
        assert!(selected(&table).starts_with("[a]"));
        assert!(analyze_toml_source(&table.content).valid);
    }
}

#[test]
fn bom_crlf_unicode_quoted_nested_paths_and_no_final_newline_survive() {
    let source = "\u{feff}# 配置😀\r\n[\"a.b\".child]\r\n'中文' = '''\r\n# 正文\r\n尾巴''' # 保留\r\nother=1979-05-27\r\n[next]\r\nx=2";
    let changed = remove(source, "[\"a.b\"].child[\"中文\"]").unwrap();
    assert_eq!(changed.content, "\u{feff}# 配置😀\r\n[\"a.b\".child]\r\n# 保留\r\nother=1979-05-27\r\n[next]\r\nx=2");
    assert_eq!(selected(&changed), "other");
    let root = remove("\u{feff}text='''a\r\nb'''", "text").unwrap();
    assert_eq!(root.content, "\u{feff}");
    assert_eq!((root.start, root.end), (3, 3));
}

#[test]
fn closing_quote_runs_escaped_continuations_and_empty_values_are_whole() {
    for raw in [
        "'''\nfirst\nlast'''",
        "'''line\n'quote''''",
        "\"\"\"line\n\"quote\"\"\"\"",
        "\"\"\"\nfirst\\\n   folded\\nlast\"\"\"",
        "\"\"\"\n\n\"\"\"",
    ] {
        let source = format!("text={raw}\nnext=false");
        assert!(analyze_toml_source(&source).valid, "{raw}");
        let changed = remove(&source, "text").unwrap();
        assert_eq!(changed.content, "next=false");
        assert_eq!(selected(&changed), "next");
    }
}

#[test]
fn sequential_deletion_uses_current_source_and_never_crosses_table() {
    let source = "[a]\nx='''a\nb''' # x\n# alone\ny=\"\"\"c\nd\"\"\" # y\nlast=true\n[a.child]\nz=1\n[b]\nx='keep'";
    let a = remove(source, "a.x").unwrap();
    assert_eq!(selected(&a), "y");
    let b = remove(&a.content, "a.y").unwrap();
    assert_eq!(selected(&b), "last");
    let c = remove(&b.content, "a.last").unwrap();
    assert_eq!(c.content, "[a]\n# x\n# alone\n# y\n[a.child]\nz=1\n[b]\nx='keep'");
    assert!(selected(&c).starts_with("[a]"));
}

#[test]
fn single_line_delete_uses_same_precise_neighbor_selection() {
    let source = "x=1 # x\ny=[1,2]\nz={keep=0xFF}\n";
    let changed = remove(source, "y").unwrap();
    assert_eq!(changed.content, "x=1 # x\nz={keep=0xFF}\n");
    assert_eq!(selected(&changed), "z");
    let last = remove(&changed.content, "z").unwrap();
    assert_eq!(selected(&last), "x");
}

#[test]
fn complex_multiline_dotted_array_table_and_stale_ranges_stay_local() {
    for (source, path) in [
        ("x=[\n1,\n2]\n", "x"),
        ("a.b='''a\nb'''\n", "a.b"),
        ("[[a]]\nx='''a\nb'''\n", "a[0].x"),
    ] {
        assert!(remove(source, path).is_err());
    }
    let source = "text='''a\nb'''\n";
    for (start, end) in [(1, 4), (0, 99), (99, 100), (0, 0), (3, 1)] {
        assert!(remove_toml_field_source(source, start, end).is_err());
    }
    assert!(remove_toml_field_source("text='''unfinished", 0, 4).is_err());
    assert!(remove_toml_field_source("中文=1", 1, 3).is_err());
}

#[test]
fn independent_comments_do_not_block_deletion_and_keep_exact_slots() {
    let source = "[a]\n# attached?\ntext='''old\nbody''' # ending\n# after\nother=false";
    let changed = remove(source, "a.text").unwrap();
    assert_eq!(changed.content, "[a]\n# attached?\n# ending\n# after\nother=false");
    assert_eq!(selected(&changed), "other");
    let eof = remove("text='''x\ny''' # EOF", "text").unwrap();
    assert_eq!(eof.content, "# EOF");
}

#[test]
fn delete_copy_and_move_continue_from_same_raw_draft() {
    let source = "[a]\ntext='''a\nb''' # tail\nother=false\n";
    let field = analyze_toml_source(source).outline.into_iter().find(|e| e.path == "a.text").unwrap().field.unwrap();
    let copied = copy_toml_field_source(source, field.start, field.end, "copied").unwrap();
    let deleted = remove(&copied.content, "a.text").unwrap();
    assert_eq!(selected(&deleted), "copied");
    assert_eq!(deleted.content, "[a]\n# tail\ncopied='''a\nb''' # tail\nother=false\n");
    let moved = move_toml_field_source(source, field.start, field.end, "down").unwrap();
    let deleted = remove(&moved.content, "a.text").unwrap();
    assert_eq!(deleted.content, "[a]\nother=false\n# tail\n");
    assert_eq!(selected(&deleted), "other");
}

#[test]
fn physical_form_corpus_preserves_every_unselected_byte() {
    let mut count = 0;
    for bom in ["", "\u{feff}"] {
        for eol in ["\n", "\r\n"] {
            for final_eol in ["", eol] {
                for raw in ["'''a\nb'''", "\"\"\"\n# body\ntext\"\"\"", "''''''", "\"\"\"\n\"\"\""] {
                    let source = format!("{bom}[a]{eol}  text={} # tail{eol}other=8_080{final_eol}", raw.replace('\n', eol));
                    let changed = remove(&source, "a.text").unwrap();
                    assert_eq!(changed.content, format!("{bom}[a]{eol}  # tail{eol}other=8_080{final_eol}"));
                    assert_eq!(selected(&changed), "other");
                    count += 1;
                }
            }
        }
    }
    assert_eq!(count, 32);
}
