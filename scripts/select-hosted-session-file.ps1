param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Title,[Parameter(Mandatory=$true)][string]$SelectedPath,[Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1') { throw 'Only a disposable hosted Windows UI test may select this dialog' }
$resolvedRoot=[IO.Path]::GetFullPath($OwnerRoot).TrimEnd('\')+'\'
$resolvedFile=[IO.Path]::GetFullPath($SelectedPath)
if (-not $resolvedFile.StartsWith($resolvedRoot,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath (Join-Path $OwnerRoot '.v119-installed-owner'))) { throw 'File selection must stay in the owned generated fixture' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline=[DateTime]::UtcNow.AddSeconds(45)
$selected=$null
do {
  $processes=@(Get-Process | Where-Object { try { $_.Path -eq $Executable } catch { $false } })
  foreach ($process in $processes) {
    $conditions=[System.Windows.Automation.AndCondition]::new([System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$process.Id),[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,$Title))
    $window=[System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$conditions)
    if ($null -eq $window) { continue }
    $edits=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit))
    $edit=@($edits | Where-Object { $_.Current.AutomationId -in @('1001','1148') }) | Select-Object -First 1
    $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1'))
    if ($null -eq $edit -or $null -eq $button) { continue }
    $value=$edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $value.SetValue($resolvedFile)
    if ($value.Current.Value -ne $resolvedFile) { throw 'Native filename control did not retain the intended generated path' }
    $selected=[ordered]@{status='selected-real-native-dialog';processId=$process.Id;executable=$process.Path;title=$window.Current.Name;fileNameAutomationId=$edit.Current.AutomationId;selectedPath=$value.Current.Value;method='Windows-UIAutomation-ValuePattern-and-InvokePattern';desktopUserSession='disposable-github-hosted'}
    $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    break
  }
  if ($null -eq $selected) { Start-Sleep -Milliseconds 150 }
} while ($null -eq $selected -and [DateTime]::UtcNow -lt $deadline)
if ($null -eq $selected) { throw "Owned native file dialog was not found: $Title" }
[IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($selected | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
