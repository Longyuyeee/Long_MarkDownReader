# Long编辑品牌图标

`longedit-icon-v1.0.1.png` 保留 v1.0.1 已发布的线框图标历史。`longedit-icon-v1.0.2.png` 是当前母版：深海军蓝圆角底与实心金色 `L`，强化 16px、32px 和任务栏场景的识别度。母版保留透明圆角外区，用于 Tauri 多平台图标生成。

生成命令：

```powershell
npx.cmd tauri icon "design\brand\longedit-icon-v1.0.2.png" -o "src-tauri\icons"
```

生成后将 `src-tauri/icons/icon.png` 同步到根目录 `icon.png` 和 `public/icon.png`，分别供 README 与应用内品牌入口使用。

不要提交 `.release-secrets/`；图标资产不包含更新签名私钥或其他发布凭据。
