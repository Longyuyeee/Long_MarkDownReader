param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Title,[Parameter(Mandatory=$true)][string]$SelectedPath,[Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1') { throw 'Only a disposable hosted Windows UI test may select this dialog' }
$resolvedRoot=[IO.Path]::GetFullPath($OwnerRoot).TrimEnd('\')+'\'
$resolvedFile=[IO.Path]::GetFullPath($SelectedPath)
if (-not $resolvedFile.StartsWith($resolvedRoot,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath (Join-Path $OwnerRoot '.v119-installed-owner'))) { throw 'File selection must stay in the owned generated fixture' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class SessionPickerWindows {
  public delegate bool Callback(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback f, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, Callback f, IntPtr p);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder b,int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h,uint flag);
  [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,string value);
  [DllImport("user32.dll",EntryPoint="SendMessageW",CharSet=CharSet.Unicode)] static extern IntPtr ReadControlText(IntPtr h,uint m,IntPtr capacity,StringBuilder text);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
  public class Item { public long Handle; public uint Pid; public uint OwnerPid; public string Title; public string ClassName; public int ControlId; }
  static Item Read(IntPtr h) { uint pid,owner;GetWindowThreadProcessId(h,out pid);GetWindowThreadProcessId(GetWindow(h,4),out owner);var title=new StringBuilder(4096);var cls=new StringBuilder(256);GetWindowText(h,title,title.Capacity);GetClassName(h,cls,cls.Capacity);return new Item{Handle=h.ToInt64(),Pid=pid,OwnerPid=owner,Title=title.ToString(),ClassName=cls.ToString(),ControlId=GetDlgCtrlID(h)}; }
  public static Item[] Top() {var list=new List<Item>();EnumWindows((h,p)=>{list.Add(Read(h));return true;},IntPtr.Zero);return list.ToArray();}
  public static Item[] Children(long root) {var list=new List<Item>();EnumChildWindows(new IntPtr(root),(h,p)=>{list.Add(Read(h));return true;},IntPtr.Zero);return list.ToArray();}
  public static string Text(long handle) {var text=new StringBuilder(4096);ReadControlText(new IntPtr(handle),13,new IntPtr(text.Capacity),text);return text.ToString();}
}
'@
$deadline=[DateTime]::UtcNow.AddSeconds(45)
$selected=$null
$diagnostics=@()
do {
  $processes=@(Get-Process | Where-Object { try { $_.Path -eq $Executable } catch { $false } })
  $ownedPids=@($processes | ForEach-Object Id)
  # Hidden test hosts do not necessarily enter UIA's desktop tree. Resolve
  # the real HWND by exact native caption and verified process/owner instead.
  $windows=@([SessionPickerWindows]::Top() | Where-Object { $_.Pid -in $ownedPids -or $_.OwnerPid -in $ownedPids })
  $diagnostics=@($windows | ForEach-Object { [ordered]@{handle=$_.Handle;pid=$_.Pid;ownerPid=$_.OwnerPid;title=$_.Title;className=$_.ClassName} })
  foreach ($native in @($windows | Where-Object Title -eq $Title)) {
    $process=$processes | Where-Object { $_.Id -eq $native.Pid -or $_.Id -eq $native.OwnerPid } | Select-Object -First 1
    try {
    $window=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$native.Handle)
    $edits=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit))
    $edit=@($edits | Where-Object { $_.Current.AutomationId -in @('1001','1148') }) | Select-Object -First 1
    $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1'))
    if ($null -ne $edit -and $null -ne $button) {
      $value=$edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      $value.SetValue($resolvedFile)
      if ($value.Current.Value -ne $resolvedFile) { throw 'Native filename control did not retain the intended generated path' }
      $selected=[ordered]@{status='selected-real-native-dialog';processId=$process.Id;dialogProcessId=$native.Pid;executable=$process.Path;title=$native.Title;fileNameAutomationId=$edit.Current.AutomationId;selectedPath=$value.Current.Value;method='Windows-UIAutomation-ValuePattern-and-InvokePattern';desktopUserSession='disposable-github-hosted'}
      $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      break
    }
    } catch {
      $selected=$null
      $diagnostics+=[ordered]@{dialog=$native.Title;uiaError=[string]$_}
    }
    # Keep the real common dialog and its controls, even when UIA omits the
    # hidden HWND. No returned path, IPC result, DOM handler or bridge is faked.
    $children=@([SessionPickerWindows]::Children($native.Handle))
    $diagnostics+=[ordered]@{dialog=$native.Title;controls=@($children)}
    $field=$children | Where-Object { $_.ClassName -eq 'Edit' -and $_.ControlId -in @(1001,1148,1152) } | Select-Object -First 1
    $ok=$children | Where-Object { $_.ClassName -eq 'Button' -and $_.ControlId -eq 1 } | Select-Object -First 1
    if ($null -eq $field -or $null -eq $ok -or -not [SessionPickerWindows]::IsWindowEnabled([IntPtr]$ok.Handle)) { continue }
    [SessionPickerWindows]::SendMessage([IntPtr]$field.Handle,12,[IntPtr]::Zero,$resolvedFile) > $null
    $actual=[SessionPickerWindows]::Text($field.Handle)
    if ($actual -ne $resolvedFile) { throw 'Real native filename edit did not retain the intended generated path' }
    if (-not [SessionPickerWindows]::PostMessage([IntPtr]$native.Handle,273,[IntPtr]1,[IntPtr]$ok.Handle)) { throw 'Could not notify the real native OK button' }
    $selected=[ordered]@{status='selected-real-native-dialog';processId=$process.Id;dialogProcessId=$native.Pid;executable=$process.Path;title=$native.Title;fileNameAutomationId=[string]$field.ControlId;selectedPath=$actual;method='Windows-Win32-filename-edit-and-OK-notification';desktopUserSession='disposable-github-hosted'}
    break
  }
  if ($null -eq $selected) { Start-Sleep -Milliseconds 150 }
} while ($null -eq $selected -and [DateTime]::UtcNow -lt $deadline)
if ($null -eq $selected) {
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),([ordered]@{status='failed';expectedTitle=$Title;expectedExecutable=$Executable;ownedProcesses=@($processes | Select-Object Id,Path);ownedWindows=$diagnostics} | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  throw "Owned native file dialog was not found: $Title"
}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($selected | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
