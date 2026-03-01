# 此脚本将“使用胧编辑打开”添加到 Windows 右键菜单
$currentDir = Get-Location
$exePath = "$currentDir\src-tauri\target\release\胧编辑·md助手.exe"
if (-not (Test-Path $exePath)) {
    $exePath = "$currentDir\src-tauri\target\debug\胧编辑·md助手.exe"
}

$regPath = "Registry::HKEY_CLASSES_ROOT\SystemFileAssociations\.md\shell\胧编辑"
if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force
}
Set-ItemProperty -Path $regPath -Name "" -Value "使用胧编辑打开"
Set-ItemProperty -Path $regPath -Name "Icon" -Value "$exePath"

$commandPath = "$regPath\command"
if (-not (Test-Path $commandPath)) {
    New-Item -Path $commandPath -Force
}
Set-ItemProperty -Path $commandPath -Name "" -Value "`"$exePath`" `"%1`""

Write-Host "已成功添加右键菜单集成！" -ForegroundColor Green
