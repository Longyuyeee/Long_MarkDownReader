use crate::services::credentials::read_ai_secret;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
struct AiChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct AiChatRequest {
    model: String,
    messages: Vec<AiChatMessage>,
    stream: bool,
}

#[derive(Deserialize)]
struct AiChatResponse {
    choices: Vec<AiChatChoice>,
}

#[derive(Deserialize)]
struct AiChatChoice {
    message: AiChatMessage,
}

fn endpoint_is_loopback(url: &reqwest::Url) -> bool {
    url.host_str().is_some_and(|host| {
        host.eq_ignore_ascii_case("localhost")
            || host
                .trim_matches(['[', ']'])
                .parse::<std::net::IpAddr>()
                .is_ok_and(|address| address.is_loopback())
    })
}

fn validate_endpoint(url: &reqwest::Url) -> Result<bool, String> {
    let is_loopback = endpoint_is_loopback(url);
    match url.scheme() {
        "https" => Ok(is_loopback),
        "http" if is_loopback => Ok(true),
        "http" => Err("远程 AI 接口必须使用 HTTPS".into()),
        _ => Err("AI 接口仅支持 HTTPS，或本机 HTTP 地址".into()),
    }
}

#[tauri::command]
pub async fn ai_chat_completion(
    endpoint: String,
    model: String,
    system_prompt: String,
    user_content: String,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    let parsed_url = reqwest::Url::parse(&url).map_err(|_| "AI 接口地址无效")?;
    let is_loopback = validate_endpoint(&parsed_url)?;
    let api_key = tauri::async_runtime::spawn_blocking(read_ai_secret)
        .await
        .map_err(|error| format!("系统凭据任务失败: {error}"))??;
    if api_key.is_none() && !is_loopback {
        return Err("尚未在系统凭据存储中配置 API Key".into());
    }
    let body = AiChatRequest {
        model,
        messages: vec![
            AiChatMessage {
                role: "system".into(),
                content: system_prompt,
            },
            AiChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
        stream: false,
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| format!("客户端创建失败: {error}"))?;
    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body);
    if let Some(secret) = api_key {
        request = request.header("Authorization", format!("Bearer {secret}"));
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("请求失败: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误 ({status}): {error_text}"));
    }
    let completion: AiChatResponse = response
        .json()
        .await
        .map_err(|error| format!("解析响应失败: {error}"))?;
    completion
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .ok_or_else(|| "API 未返回有效结果".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_loopback_hosts_bypass_remote_credentials() {
        for url in [
            "http://localhost:11434/v1/chat/completions",
            "http://127.0.0.1:11434/v1/chat/completions",
            "http://[::1]:11434/v1/chat/completions",
        ] {
            assert!(endpoint_is_loopback(&reqwest::Url::parse(url).unwrap()));
        }
        for url in [
            "https://api.openai.com/v1/chat/completions",
            "https://localhost.example.com/v1/chat/completions",
            "http://192.168.1.2:11434/v1/chat/completions",
        ] {
            assert!(!endpoint_is_loopback(&reqwest::Url::parse(url).unwrap()));
        }
    }

    #[test]
    fn remote_endpoints_require_https() {
        let remote_http =
            reqwest::Url::parse("http://api.example.com/v1/chat/completions").unwrap();
        let remote_https =
            reqwest::Url::parse("https://api.example.com/v1/chat/completions").unwrap();
        let local_http = reqwest::Url::parse("http://127.0.0.1:11434/v1/chat/completions").unwrap();
        assert!(validate_endpoint(&remote_http).is_err());
        assert_eq!(validate_endpoint(&remote_https), Ok(false));
        assert_eq!(validate_endpoint(&local_http), Ok(true));
    }
}
