use super::*;

fn copy(s: &str, path: &str, name: &str) -> Result<TomlKeyChange, String> {
    let field = analyze_toml_source(s).outline.into_iter().find(|e| e.path == path).unwrap().field.unwrap();
    copy_toml_field_source(s, field.start, field.end, name)
}

#[test]
fn copies_raw_scalar_types_quotes_dates_and_unicode() {
    for raw in ["'内容😀'", "\"转义\\n字符\"", "0xFF", "8_080", "1.20e+2", "true", "1979-05-27T07:32:00Z", "07:32:00", "nan", "+inf"] {
        let s = format!("# 中文😀\nx\t=  {raw} # keep\ny=2\n");
        let c = copy(&s, "x", "新字段😀").unwrap();
        assert_eq!(c.content, s.replace("y=2", &format!("\"新字段😀\"\t=  {raw} # keep\ny=2")));
        assert_eq!(&c.content[c.start..c.end], "\"新字段😀\"");
    }
}

#[test]
fn inserts_adjacent_and_retains_attached_and_independent_comments() {
    let s = "# before\nx=1 # attached\n\n# independent\ny=2\n";
    assert_eq!(copy(s,"x","x_copy").unwrap().content,"# before\nx=1 # attached\nx_copy=1 # attached\n\n# independent\ny=2\n");
}

#[test]
fn keeps_table_ownership_and_same_parent_names() {
    let s="x_copy=0\n[a]\nx=1\n[a.child]\nx=2\n[b]\nx=3\nx_copy=4\n";
    let c=copy(s,"a.x","x_copy").unwrap();
    assert_eq!(c.content,s.replace("x=1\n","x=1\nx_copy=1\n"));
    assert!(copy(s,"b.x","x_copy").is_err());
    assert!(copy(s,"a.x","child").is_err());
    assert!(copy(s,"a.child.x","x_copy").is_ok());
}

#[test]
fn preserves_bom_crlf_indent_and_missing_final_newline() {
    let s="\u{feff}  x = '文😀' # 注释\r\ny=2";
    assert_eq!(copy(s,"x","副本").unwrap().content,s.replace("y=2","  \"副本\" = '文😀' # 注释\r\ny=2"));
    assert_eq!(copy("x=1 # keep","x","next").unwrap().content,"x=1 # keep\nnext=1 # keep");
    assert_eq!(copy("x=1\r\ny=2","y","next").unwrap().content,"x=1\r\ny=2\r\nnext=2");
}

#[test]
fn validates_names_and_quotes_literal_names_without_new_paths() {
    let s="'old name'=1\n";
    assert_eq!(copy(s,"[\"old name\"]","new name").unwrap().content,"'old name'=1\n'new name'=1\n");
    for name in ["", "x\ny", "x\ty", "\0", "old name"] { assert!(copy(s,"[\"old name\"]",name).is_err(),"{name:?}"); }
    assert!(copy("x=1\n","x",&"文".repeat(1366)).is_err());
    assert!(copy("x=1\n","x",&"a".repeat(4096)).is_ok());
    let c=copy("x=1\n","x","a.b").unwrap();
    assert_eq!(c.content,"x=1\n\"a.b\"=1\n");
}

#[test]
fn rejects_complex_multiline_dotted_keys_and_array_tables_locally() {
    for s in ["x=[1,2]\n", "x={a=1}\n"] { assert!(copy(s,"x","next").is_err()); }
    for (s,p) in [("a.x=1\n","a.x"),("[[a]]\nx=1\n","a[0].x")] {
        let e=analyze_toml_source(s).outline.into_iter().find(|e|e.path==p).unwrap();
        let f=e.field.unwrap(); assert!(copy_toml_field_source(s,f.start,f.end,"next").is_err());
    }
    assert!(copy_toml_field_source("[a]\nx=1\n",1,2,"next").is_err());
}

#[test]
fn rejects_stale_invalid_utf8_non_key_and_invalid_source_ranges() {
    let s="'中文😀'=1\n";
    for (a,b) in [(0,0),(2,4),(usize::MAX,usize::MAX),(12,11),(0,100)] { assert!(copy_toml_field_source(s,a,b,"next").is_err()); }
    assert!(copy_toml_field_source("x=1\nx=2\n",0,1,"next").is_err());
    let c=copy("x=0xFF\n","x","x_copy").unwrap();
    let c=copy(&c.content,"x_copy","x_copy2").unwrap();
    assert_eq!(c.content,"x=0xFF\nx_copy=0xFF\nx_copy2=0xFF\n");
}

#[test]
fn rejects_copy_exceeding_existing_source_budget() {
    let mut s=String::from("x='");s.push_str(&"a".repeat(MAX_TOML_SOURCE_BYTES/2));s.push_str("'\n");
    assert!(copy(&s,"x","next").unwrap_err().contains("上限"));
}
