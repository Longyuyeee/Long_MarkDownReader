# Official app-scoped WebView2 debugger alternative to environment variables:
# https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code
# Elevated hosted runners ignore HKCU/env overrides on recent WebView2:
# https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security
# Only exact application values under HKLM on a disposable hosted runner. No
# wildcard, security switch or overwritten value; never run on user machines.
$script:nativePolicyEntries=New-Object System.Collections.Generic.List[object]
function Get-V118WebViewPolicyPlan([string]$UserDataRoot) {
  foreach($hostId in @('com.longedit.app.e2e','tauri-app.exe','tauri-app')) {
    [pscustomobject]@{key='HKLM:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments';name=$hostId;value='--remote-debugging-port=9458 --remote-allow-origins=http://127.0.0.1:9458'}
    [pscustomobject]@{key='HKLM:\Software\Policies\Microsoft\Edge\WebView2\UserDataFolder';name=$hostId;value=$UserDataRoot}
  }
}
function Enable-V118WebViewTestPolicy([string]$UserDataRoot) {
  if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows'){throw 'Never configure WebView2 test policy on a user/self-hosted machine'}
  $plan=@(Get-V118WebViewPolicyPlan $UserDataRoot)
  # Preflight every entry before creating any value.
  foreach($entry in $plan){if((Test-Path -LiteralPath $entry.key) -and ((Get-Item -LiteralPath $entry.key).GetValueNames() -contains $entry.name)){throw "Existing WebView2 test value preserved: $($entry.name)"}}
  foreach($entry in $plan){
    # Registry New-Item -Force erases an existing key's values. Create only
    # missing ancestors, without Force, and never reset the shared leaf key.
    $segments=$entry.key -split '\\'
    $cursor=$segments[0]+'\'
    foreach($segment in ($segments | Select-Object -Skip 1)){
      $cursor=$cursor.TrimEnd('\')+'\'+$segment
      if(-not(Test-Path -LiteralPath $cursor)){New-Item -Path $cursor | Out-Null}
    }
    New-ItemProperty -LiteralPath $entry.key -Name $entry.name -PropertyType String -Value $entry.value | Out-Null
    $script:nativePolicyEntries.Add($entry)
  }
}
function Disable-V118WebViewTestPolicy {
  for($n=$script:nativePolicyEntries.Count-1;$n -ge 0;$n--){
    $entry=$script:nativePolicyEntries[$n]
    if((Test-Path -LiteralPath $entry.key) -and ((Get-Item -LiteralPath $entry.key).GetValue($entry.name) -ceq $entry.value)){
      Remove-ItemProperty -LiteralPath $entry.key -Name $entry.name
    }
  }
  $script:nativePolicyEntries.Clear()
}
