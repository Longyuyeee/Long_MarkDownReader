#[derive(Debug, Default)]
pub(crate) struct SearchQuery {
    pub positive: Vec<String>,
    pub negative: Vec<String>,
}
impl SearchQuery {
    pub fn parse(query: &str) -> Result<Self, String> {
        if query.chars().count() > 500 {
            return Err("搜索内容不能超过 500 个字符".into());
        }
        let mut parsed = Self::default();
        let mut chars = query.chars().peekable();
        while chars.peek().is_some() {
            while chars.peek().is_some_and(|c| c.is_whitespace()) {
                chars.next();
            }
            if chars.peek().is_none() {
                break;
            }
            let mut negative = chars.peek() == Some(&'-');
            if negative {
                chars.next();
            }
            let mut value = String::new();
            let mut quoted = false;
            if negative && chars.peek().map_or(true, |c| c.is_whitespace()) {
                negative = false;
                value.push('-');
            } else {
                while let Some(character) = chars.peek().copied() {
                    if character.is_whitespace() && !quoted {
                        break;
                    }
                    chars.next();
                    match character {
                        '"' => quoted = !quoted,
                        '\\' if chars.peek().is_some_and(|c| *c == '"' || *c == '\\') => {
                            value.push(chars.next().unwrap())
                        }
                        _ => value.push(character),
                    }
                }
            }
            if quoted {
                return Err("搜索短语缺少结束双引号".into());
            }
            if value.is_empty() {
                return Err("双引号中请填写要查找的内容".into());
            }
            let terms = if negative {
                &mut parsed.negative
            } else {
                &mut parsed.positive
            };
            let value = value.to_lowercase();
            if !terms.contains(&value) {
                terms.push(value);
            }
            if parsed.positive.len() + parsed.negative.len() > 16 {
                return Err("搜索条件不能超过 16 项".into());
            }
        }
        Ok(parsed)
    }
    pub fn complex(&self, original: &str) -> bool {
        self.positive.len() != 1
            || !self.negative.is_empty()
            || original.trim().to_lowercase() != self.positive[0]
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_query_grammar_examples() {
        let examples: Vec<serde_json::Value> =
            serde_json::from_str(include_str!("../../../shared/search-query-examples.json"))
                .unwrap();
        for example in examples {
            let result = SearchQuery::parse(example["query"].as_str().unwrap());
            if example["error"] == true {
                assert!(result.is_err(), "{example}");
                continue;
            }
            let result = result.unwrap();
            assert_eq!(serde_json::json!(result.positive), example["positive"]);
            assert_eq!(serde_json::json!(result.negative), example["negative"]);
        }
        assert!(SearchQuery::parse(&"a".repeat(501)).is_err());
        assert!(
            SearchQuery::parse(&(0..17).map(|n| n.to_string()).collect::<Vec<_>>().join(" "))
                .is_err()
        );
    }
}
