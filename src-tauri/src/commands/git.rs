use serde::Serialize;

#[derive(Serialize)]
pub struct GitStatus {
    initialized: bool,
    branch: String,
    remote: String,
    ahead: i32,
    behind: i32,
    dirty_count: i32,
    last_commit: String,
}

fn run_git(path: &str, args: &[&str]) -> Result<String, String> {
    let mut command = std::process::Command::new("git");
    command.args(args).current_dir(path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command
        .output()
        .map_err(|error| format!("git 命令失败: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn git_status(library_path: String) -> GitStatus {
    let path = library_path.as_str();
    let initialized = run_git(path, &["rev-parse", "--is-inside-work-tree"]).is_ok();
    if !initialized {
        return GitStatus {
            initialized: false,
            branch: String::new(),
            remote: String::new(),
            ahead: 0,
            behind: 0,
            dirty_count: 0,
            last_commit: String::new(),
        };
    }
    let branch = run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    let remote = run_git(path, &["remote", "get-url", "origin"]).unwrap_or_default();
    let behind = run_git(
        path,
        &["rev-list", "--count", &format!("HEAD..origin/{branch}")],
    )
    .ok()
    .and_then(|value| value.parse().ok())
    .unwrap_or(0);
    let ahead = run_git(
        path,
        &["rev-list", "--count", &format!("origin/{branch}..HEAD")],
    )
    .ok()
    .and_then(|value| value.parse().ok())
    .unwrap_or(0);
    let dirty_count = run_git(path, &["status", "--porcelain"])
        .map(|status| status.lines().count() as i32)
        .unwrap_or(0);
    let last_commit = run_git(path, &["log", "-1", "--format=%s"]).unwrap_or_default();
    GitStatus {
        initialized: true,
        branch,
        remote,
        ahead,
        behind,
        dirty_count,
        last_commit,
    }
}

#[tauri::command]
pub fn git_init(library_path: String, remote: String, branch: String) -> Result<String, String> {
    run_git(&library_path, &["init"])?;
    run_git(&library_path, &["checkout", "-b", &branch])?;
    if !remote.is_empty() {
        run_git(&library_path, &["remote", "add", "origin", &remote])?;
    }
    Ok("仓库已初始化".into())
}

#[tauri::command]
pub fn git_commit(library_path: String, message: String) -> Result<String, String> {
    run_git(&library_path, &["add", "-A"])?;
    run_git(&library_path, &["commit", "-m", &message])?;
    Ok("已提交".into())
}

#[tauri::command]
pub fn git_push(library_path: String) -> Result<String, String> {
    let branch = run_git(&library_path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    run_git(&library_path, &["push", "-u", "origin", &branch])?;
    Ok("推送成功".into())
}

#[tauri::command]
pub fn git_pull(library_path: String) -> Result<String, String> {
    run_git(&library_path, &["pull", "--rebase"])?;
    Ok("拉取成功".into())
}
