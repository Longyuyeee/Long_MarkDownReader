param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$Target,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1'){throw 'Only the disposable hosted Windows test may print'}
$root=[IO.Path]::GetFullPath($OwnerRoot).TrimEnd('\')+'\';$targetFile=[IO.Path]::GetFullPath($Target)
if(-not $targetFile.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($targetFile) -ne '.pdf' -or (Test-Path -LiteralPath $targetFile) -or -not(Test-Path -LiteralPath (Join-Path $OwnerRoot '.v119-installed-owner'))){throw 'A new generated PDF inside the owned fixture is required'}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public static class WritingPrintWindows {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumWindows(Callback f,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumChildWindows(IntPtr h,Callback f,IntPtr p);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")]static extern int GetDlgCtrlID(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr h,uint f);
 [DllImport("user32.dll",EntryPoint="SendMessageW")]public static extern IntPtr Send(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 public class Item{public long Handle;public uint Pid;public uint OwnerPid;public string Title;public string ClassName;public int Id;}
 static Item Read(IntPtr h){uint pid,owner;GetWindowThreadProcessId(h,out pid);GetWindowThreadProcessId(GetWindow(h,4),out owner);var t=new StringBuilder(4096);var c=new StringBuilder(256);GetWindowText(h,t,t.Capacity);GetClassName(h,c,c.Capacity);return new Item{Handle=h.ToInt64(),Pid=pid,OwnerPid=owner,Title=t.ToString(),ClassName=c.ToString(),Id=GetDlgCtrlID(h)};}
 public static Item[] Top(){var a=new List<Item>();EnumWindows((h,p)=>{a.Add(Read(h));return true;},IntPtr.Zero);return a.ToArray();}
 public static Item[] Children(long n){var a=new List<Item>();EnumChildWindows(new IntPtr(n),(h,p)=>{a.Add(Read(h));return true;},IntPtr.Zero);return a.ToArray();}
}
'@
$result=[ordered]@{status='running';desktopUserSession='disposable-github-hosted';target=$targetFile;actions=@();windows=@();controls=@()}
try{
 try { $spooler=Get-Service Spooler -ErrorAction Stop;if($spooler.Status -ne 'Running'){Start-Service Spooler -ErrorAction Stop} } catch { $result.spoolerNotice=[string]$_ }
 $printers=@(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue);$result.printers=@($printers|Select-Object Name,Default,DriverName)
 $pdfPrinter=$printers|Where-Object Name -eq 'Microsoft Print to PDF'|Select-Object -First 1
 if($pdfPrinter){$null=(New-Object -ComObject WScript.Network).SetDefaultPrinter('Microsoft Print to PDF');$result.defaultPrinter='Microsoft Print to PDF'}
 $result.status='ready-for-native-print'
 [IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 $deadline=[DateTime]::UtcNow.AddSeconds(70);$printed=$false;$saved=$false
 do{
  $all=@(Get-CimInstance Win32_Process);$rootProcesses=@($all|Where-Object {$_.ExecutablePath -eq $Executable});$owned=@($rootProcesses.ProcessId)
  for($i=0;$i -lt 8;$i++){$next=@($all|Where-Object {$_.ParentProcessId -in $owned}|ForEach-Object ProcessId);$owned=@($owned+$next|Select-Object -Unique)}
  if(-not $rootProcesses){throw 'The exact installed application is no longer running'}
  $windows=@([WritingPrintWindows]::Top()|Where-Object {$_.Pid -in $owned -or $_.OwnerPid -in $owned});$result.windows=@($windows)
  foreach($win in $windows){
   if($printed -and $win.Title -match '^(Save Print Output As|Save As|将打印输出另存为|另存为)$'){
    $children=@([WritingPrintWindows]::Children($win.Handle));$result.saveControls=$children
    $field=$children|Where-Object {$_.ClassName -eq 'Edit' -and $_.Id -in @(1148,1152,1001)}|Sort-Object {if($_.Id -eq 1148){0}elseif($_.Id -eq 1152){1}else{2}}|Select-Object -First 1
    $ok=$children|Where-Object {$_.ClassName -eq 'Button' -and $_.Id -eq 1}|Select-Object -First 1
    if($field -and $ok){
     [WritingPrintWindows]::Send([IntPtr]$field.Handle,177,[IntPtr]::Zero,[IntPtr](-1))>$null
     [WritingPrintWindows]::Send([IntPtr]$field.Handle,258,[IntPtr]8,[IntPtr]1)>$null
     foreach($character in $targetFile.ToCharArray()){[WritingPrintWindows]::Send([IntPtr]$field.Handle,258,[IntPtr]([int]$character),[IntPtr]1)>$null}
     if(-not [WritingPrintWindows]::PostMessage([IntPtr]$win.Handle,273,[IntPtr]1,[IntPtr]$ok.Handle)){throw 'Could not confirm the owned print filename'}
     $result.actions+=@('typed-owned-native-print-output-path-and-confirmed');$saved=$true;break
    }
   }
   if(-not $printed){
    try{
     $element=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$win.Handle)
     $controls=@($element.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition))
     $names=@($controls|ForEach-Object {$_.Current.Name});$result.controls=@($controls|Select-Object -First 300|ForEach-Object {[ordered]@{name=$_.Current.Name;type=$_.Current.ControlType.ProgrammaticName;id=$_.Current.AutomationId}})
     # Only the isolated app/its verified descendants are searched. No global
     # keyboard or mouse input, and no default website or DOM handler is called.
     $destination=$controls|Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox -and $_.Current.Name -match 'Destination|Printer|目标|打印机'}|Select-Object -First 1
     if($destination -and -not $printed){
      try{
       $destination.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()
       $entries=@($element.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition))
       $entry=$entries|Where-Object {$_.Current.Name -in @('Microsoft Print to PDF','Save as PDF')}|Select-Object -Last 1
       if($entry){$entry.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select();$result.actions+=@('selected-PDF-destination-in-owned-print-UI')}
      }catch{$result.destinationNotice=[string]$_}
     }
     if(($names -join ' ') -match 'Microsoft Print to PDF|Save as PDF'){
      $button=$controls|Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -in @('Print','Save','打印','保存')}|Select-Object -Last 1
      if($button){$button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();$result.actions+=@('invoked-owned-native-print-ui-'+$button.Current.Name);$printed=$true;break}
     }
    }catch{$result.lastUiaError=[string]$_}
   }
  }
  if($saved -and (Test-Path -LiteralPath $targetFile)){break}
  Start-Sleep -Milliseconds 200
 }while([DateTime]::UtcNow -lt $deadline)
 if(-not $saved -or -not(Test-Path -LiteralPath $targetFile)){throw 'A real native print output was not produced; preserve print UI diagnostics'}
 $wait=[DateTime]::UtcNow.AddSeconds(20)
 do{$length=(Get-Item -LiteralPath $targetFile).Length;if($length -gt 1000){break};Start-Sleep -Milliseconds 100}while([DateTime]::UtcNow -lt $wait)
 if($length -le 1000){throw 'The native print output is empty or incomplete'}
 $result.status='saved-real-native-print-pdf';$result.sizeBytes=$length;$result.sha256=(Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash.ToLowerInvariant();$result.executable=$Executable
}catch{$result.status='failed';$result.failure=[string]$_;throw}
finally{[IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))}
