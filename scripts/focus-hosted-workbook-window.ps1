param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$MainWindowTitle,[Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$Report,[switch]$ObserveOnly)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1'){throw 'Disposable hosted window activation only'}
$owner=[IO.Path]::GetFullPath($OwnerRoot);$reportFile=[IO.Path]::GetFullPath($Report);$workspace=[IO.Path]::GetFullPath($env:GITHUB_WORKSPACE).TrimEnd('\')+'\'
if(-not $owner.StartsWith('C:\LongEditR5ILibrary\',[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath (Join-Path $owner '.v119-installed-owner')) -or -not $reportFile.StartsWith($workspace,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $reportFile)){throw 'New owned hosted focus receipt required'}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public static class WorkbookFocusWindows {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumWindows(Callback f,IntPtr p);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")]static extern bool AttachThreadInput(uint first,uint second,bool attach);
 [DllImport("user32.dll")]static extern bool BringWindowToTop(IntPtr h);
 public static bool FocusWithinOwnedProcess(IntPtr h,uint process){uint foregroundPid;var foregroundThread=GetWindowThreadProcessId(GetForegroundWindow(),out foregroundPid);if(foregroundPid!=process)return false;var caller=GetCurrentThreadId();bool joined=caller!=foregroundThread&&AttachThreadInput(caller,foregroundThread,true);try{BringWindowToTop(h);return SetForegroundWindow(h);}finally{if(joined)AttachThreadInput(caller,foregroundThread,false);}}
 public class Item{public long Handle;public uint Pid;public string Title;public string ClassName;}
 public static Item[] Top(){var items=new List<Item>();EnumWindows((h,p)=>{uint pid;GetWindowThreadProcessId(h,out pid);var text=new StringBuilder(4096);var kind=new StringBuilder(256);GetWindowText(h,text,text.Capacity);GetClassName(h,kind,kind.Capacity);items.Add(new Item{Handle=h.ToInt64(),Pid=pid,Title=text.ToString(),ClassName=kind.ToString()});return true;},IntPtr.Zero);return items.ToArray();}
}
'@
$installed=[IO.Path]::GetFullPath($Executable)
$pids=@(Get-Process | Where-Object {try{$_.Path -ieq $installed}catch{$false}} | ForEach-Object Id)
$windows=@([WorkbookFocusWindows]::Top() | Where-Object {$_.Pid -in $pids -and $_.Title -ceq $MainWindowTitle -and $_.ClassName -eq 'Tauri Window'})
if($windows.Count -ne 1){throw 'Exactly one configured main window of the installed executable is required'}
$window=$windows[0];$handle=[IntPtr]$window.Handle
$result=[ordered]@{status='running';desktopUserSession='disposable-github-hosted';mainWindow=$window;foregroundBefore=[WorkbookFocusWindows]::GetForegroundWindow().ToInt64();nativeBridgeMocked=$false;sourceUserContentIncluded=$false}
if($ObserveOnly){
 $result.status='observed-no-input';$result.foregroundWindow=@([WorkbookFocusWindows]::Top() | Where-Object {$_.Handle -eq $result.foregroundBefore})
 $buttons=[System.Windows.Automation.AutomationElement]::FromHandle($handle).FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button))
 $result.mainWindowButtons=@(for($index=0;$index -lt [Math]::Min(100,$buttons.Count);$index++){$node=$buttons.Item($index);[ordered]@{name=$node.Current.Name;className=$node.Current.ClassName;enabled=$node.Current.IsEnabled}})
 [IO.File]::WriteAllText($reportFile,($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false));return
}
try{
 if([WorkbookFocusWindows]::IsIconic($handle)){$null=[WorkbookFocusWindows]::ShowWindow($handle,9)}
 if(-not [WorkbookFocusWindows]::IsWindowVisible($handle)){$null=[WorkbookFocusWindows]::ShowWindow($handle,5)}
 $null=[WorkbookFocusWindows]::SetForegroundWindow($handle)
 for($attempt=0;$attempt -lt 30 -and [WorkbookFocusWindows]::GetForegroundWindow() -ne $handle;$attempt++){
  if($attempt -eq 5){try{[System.Windows.Automation.AutomationElement]::FromHandle($handle).SetFocus()}catch{$result.focusNotice=[string]$_}}
  if($attempt -eq 15){$null=[WorkbookFocusWindows]::FocusWithinOwnedProcess($handle,$window.Pid)}
  Start-Sleep -Milliseconds 100
 }
 $result.foregroundAfter=[WorkbookFocusWindows]::GetForegroundWindow().ToInt64();$result.status=if($result.foregroundAfter -eq $window.Handle){'passed'}else{'failed'}
 if($result.status -ne 'passed'){throw 'The exact owned main window did not enter the foreground'}
}catch{$result.status='failed';$result.failure=[string]$_;throw}
finally{[IO.File]::WriteAllText($reportFile,($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))}
