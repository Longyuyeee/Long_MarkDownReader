param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$MainWindowTitle,[Parameter(Mandatory=$true)][string]$QuickNoteWindowTitle,[Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$Target,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1'){throw 'Only the disposable hosted Windows test may print'}
$root=[IO.Path]::GetFullPath($OwnerRoot).TrimEnd('\')+'\';$targetFile=[IO.Path]::GetFullPath($Target)
if(-not $targetFile.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($targetFile) -ne '.pdf' -or (Test-Path -LiteralPath $targetFile) -or -not(Test-Path -LiteralPath (Join-Path $OwnerRoot '.v119-installed-owner'))){throw 'A new generated PDF inside the owned fixture is required'}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -Path (Join-Path $PSScriptRoot 'lib/hosted-writing-print-invoke.cs') -ReferencedAssemblies @([System.Windows.Automation.AutomationElement].Assembly.Location,[System.Windows.Automation.AutomationProperty].Assembly.Location,'System.dll')
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
 [DllImport("user32.dll")]public static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")]static extern bool AttachThreadInput(uint first,uint second,bool attach);
 [DllImport("user32.dll")]static extern bool BringWindowToTop(IntPtr h);
 [StructLayout(LayoutKind.Sequential)]public struct Rect{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]static extern bool GetClientRect(IntPtr h,out Rect r);
 public static int[] ClientSize(long handle){Rect r;if(!GetClientRect(new IntPtr(handle),out r))throw new Exception("Cannot inspect the owned main client bounds");return new[]{r.Right-r.Left,r.Bottom-r.Top};}
 public static bool FocusWithOwnedForeground(long target,uint process){var h=new IntPtr(target);uint foregroundPid;var foregroundThread=GetWindowThreadProcessId(GetForegroundWindow(),out foregroundPid);if(foregroundPid!=process)return false;var caller=GetCurrentThreadId();bool joined=caller!=foregroundThread&&AttachThreadInput(caller,foregroundThread,true);try{BringWindowToTop(h);return SetForegroundWindow(h);}finally{if(joined)AttachThreadInput(caller,foregroundThread,false);}}
 [DllImport("user32.dll",EntryPoint="SendMessageW")]public static extern IntPtr Send(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 public class Item{public long Handle;public uint Pid;public uint OwnerPid;public string Title;public string ClassName;public int Id;}
 static Item Read(IntPtr h){uint pid,owner;GetWindowThreadProcessId(h,out pid);GetWindowThreadProcessId(GetWindow(h,4),out owner);var t=new StringBuilder(4096);var c=new StringBuilder(256);GetWindowText(h,t,t.Capacity);GetClassName(h,c,c.Capacity);return new Item{Handle=h.ToInt64(),Pid=pid,OwnerPid=owner,Title=t.ToString(),ClassName=c.ToString(),Id=GetDlgCtrlID(h)};}
 public static Item[] Top(){var a=new List<Item>();EnumWindows((h,p)=>{a.Add(Read(h));return true;},IntPtr.Zero);return a.ToArray();}
 public static Item[] Children(long n){var a=new List<Item>();EnumChildWindows(new IntPtr(n),(h,p)=>{a.Add(Read(h));return true;},IntPtr.Zero);return a.ToArray();}
}
'@
$result=[ordered]@{status='running';desktopUserSession='disposable-github-hosted';target=$targetFile;actions=@();windows=@();controls=@();temporarilyMinimizedWindows=@()}
try{
 $appRoots=@(Get-Process|Where-Object {try{$_.Path -eq $Executable}catch{$false}}|ForEach-Object Id)
 $mainWindows=@([WritingPrintWindows]::Top()|Where-Object {$_.Pid -in $appRoots -and $_.OwnerPid -eq 0 -and $_.Title -ceq $MainWindowTitle -and $_.ClassName -eq 'Tauri Window'})
 if($mainWindows.Count -ne 1){throw 'Exactly one configured main window of the installed executable is required; a quick-note or external document window is not equivalent'}
 $mainWindow=$mainWindows[0]
 foreach($companion in @([WritingPrintWindows]::Top()|Where-Object {$_.Pid -eq $mainWindow.Pid -and $_.Handle -ne $mainWindow.Handle -and $_.ClassName -eq 'Tauri Window' -and $_.Title -ceq $QuickNoteWindowTitle -and [WritingPrintWindows]::IsWindowVisible([IntPtr]$_.Handle) -and -not[WritingPrintWindows]::IsIconic([IntPtr]$_.Handle)})){$result.temporarilyMinimizedWindows+=@($companion);$null=[WritingPrintWindows]::ShowWindow([IntPtr]$companion.Handle,6)}
 $result.mainWindow=[ordered]@{handle=$mainWindow.Handle;pid=$mainWindow.Pid;title=$mainWindow.Title;configuredMainTitle=$MainWindowTitle;className=$mainWindow.ClassName;wasVisible=[WritingPrintWindows]::IsWindowVisible([IntPtr]$mainWindow.Handle)}
 if(-not $result.mainWindow.wasVisible){$null=[WritingPrintWindows]::ShowWindow([IntPtr]$mainWindow.Handle,4)}
 $result.mainWindow['visibleBeforePrint']=[WritingPrintWindows]::IsWindowVisible([IntPtr]$mainWindow.Handle)
 if(-not $result.mainWindow.visibleBeforePrint){throw 'The owned test window cannot become visible; do not claim print acceptance'}
 $result.mainWindow['foregroundBefore']=[WritingPrintWindows]::GetForegroundWindow().ToInt64()
 $result.mainWindow['foregroundRequestAccepted']=[WritingPrintWindows]::SetForegroundWindow([IntPtr]$mainWindow.Handle)
 for($attempt=0;$attempt -lt 30 -and [WritingPrintWindows]::GetForegroundWindow().ToInt64() -ne $mainWindow.Handle;$attempt++){
  if($attempt -eq 5){try{[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$mainWindow.Handle).SetFocus()}catch{$result.focusNotice=[string]$_}}
  if($attempt -eq 15){$result.mainWindow['ownedForegroundRequestAccepted']=[WritingPrintWindows]::FocusWithOwnedForeground($mainWindow.Handle,$mainWindow.Pid)}
  Start-Sleep -Milliseconds 100
 }
 $result.mainWindow['foregroundBeforePrint']=[WritingPrintWindows]::GetForegroundWindow().ToInt64() -eq $mainWindow.Handle
 if(-not $result.mainWindow.foregroundBeforePrint){throw 'The actual user print scenario requires the exact main window in the foreground'}
 $client=[WritingPrintWindows]::ClientSize($mainWindow.Handle);$result.mainWindow['clientWidth']=$client[0];$result.mainWindow['clientHeight']=$client[1]
 if($client[0] -lt 200 -or $client[1] -lt 200){throw 'The actual main client viewport is too small for the user print scenario'}
 try { $spooler=Get-Service Spooler -ErrorAction Stop;if($spooler.Status -ne 'Running'){Start-Service Spooler -ErrorAction Stop} } catch { $result.spoolerNotice=[string]$_ }
 $printers=@(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue);$result.printers=@($printers|Select-Object Name,Default,DriverName)
 $pdfPrinter=$printers|Where-Object Name -eq 'Microsoft Print to PDF'|Select-Object -First 1
 if($pdfPrinter){$null=(New-Object -ComObject WScript.Network).SetDefaultPrinter('Microsoft Print to PDF');$result.defaultPrinter='Microsoft Print to PDF'}
 $result.status='ready-for-native-print'
 [IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 $deadline=[DateTime]::UtcNow.AddSeconds(45);$printed=$false;$saved=$false;$invocation=$null;$result.controlWindows=[ordered]@{}
 $interactiveTypes=[System.Windows.Automation.OrCondition]::new([System.Windows.Automation.Condition[]]@(
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button),
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ComboBox),
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ListItem)
 ))
 do{
  if($invocation -and $invocation.Completed -and $invocation.Error){throw $invocation.Error}
  $all=@(Get-CimInstance Win32_Process);$rootProcesses=@($all|Where-Object {$_.ExecutablePath -eq $Executable});$owned=@($rootProcesses.ProcessId)
  for($i=0;$i -lt 8;$i++){$next=@($all|Where-Object {$_.ParentProcessId -in $owned}|ForEach-Object ProcessId);$owned=@($owned+$next|Select-Object -Unique)}
  if(-not $rootProcesses){throw 'The exact installed application is no longer running'}
  $topWindows=@([WritingPrintWindows]::Top());$result.diagnosticTopWindows=@($topWindows|Where-Object {$_.Title -or [WritingPrintWindows]::IsWindowVisible([IntPtr]$_.Handle)})
  $result.diagnosticProcesses=@($all|Where-Object {$_.ProcessId -in $result.diagnosticTopWindows.Pid}|Select-Object ProcessId,ParentProcessId,Name,ExecutablePath)
  $windows=@($topWindows|Where-Object {($_.Pid -in $owned -or $_.OwnerPid -in $owned) -and [WritingPrintWindows]::IsWindowVisible([IntPtr]$_.Handle) -and $_.ClassName -notmatch 'IME|tooltips|tray_icon' -and ($_.ClassName -ne 'Tauri Window' -or $_.Handle -eq $mainWindow.Handle)});$result.windows=@($windows)
  $result.stage='enumerated-owned-windows';[IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
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
    if($win.Title -match '^(Print|打印)$' -and $result.defaultPrinter -eq 'Microsoft Print to PDF'){
     $children=@([WritingPrintWindows]::Children($win.Handle));$result.nativePrintControls=$children
     $printOk=$children|Where-Object {$_.ClassName -eq 'Button' -and $_.Id -eq 1}|Select-Object -First 1
     if($printOk -and [WritingPrintWindows]::IsWindowEnabled([IntPtr]$printOk.Handle)){
      if(-not [WritingPrintWindows]::PostMessage([IntPtr]$win.Handle,273,[IntPtr]1,[IntPtr]$printOk.Handle)){throw 'Could not confirm the exact owned native Print dialog'}
      $result.actions+=@('confirmed-owned-native-system-print-dialog-with-PDF-default');$result.selectedDestination=$result.defaultPrinter;$result.printUiObserved=$true;$printed=$true;break
     }
    }
    try{
     $element=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$win.Handle)
     $result.stage='reading-owned-print-controls';$result.observingWindow=$win.Title;[IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
     $controls=@($element.FindAll([System.Windows.Automation.TreeScope]::Descendants,$interactiveTypes))
     $names=@($controls|ForEach-Object {$_.Current.Name});$result.controls=@($controls|Select-Object -First 300|ForEach-Object {[ordered]@{name=$_.Current.Name;type=$_.Current.ControlType.ProgrammaticName;id=$_.Current.AutomationId}})
     $result.controlWindows[[string]$win.Handle]=[ordered]@{title=$win.Title;className=$win.ClassName;controls=$result.controls}
     $result.stage='read-owned-print-controls';[IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
     # Only the isolated app/its verified descendants are searched. No global
     # keyboard or mouse input, and no default website or DOM handler is called.
     $printUi=($controls|Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -in @('Print','Save','打印','保存')}) -and ($controls|Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -in @('Cancel','取消')})
     $destinationValues=@();$pdfDestinationCombo=$null
     if($printUi){foreach($combo in @($controls|Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox})){
      $comboValues=@()
      try{$comboValues+=@($combo.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern).GetCurrentSelection()|ForEach-Object {$_.Current.Name})}catch{}
      try{$comboValues+=@($combo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value)}catch{}
      try{$comboValues+=@($combo.GetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern).Current.Value)}catch{}
      $destinationValues+=@($comboValues)
      if($comboValues|Where-Object {$_ -in @('Microsoft Print to PDF','Save as PDF')}){$pdfDestinationCombo=$combo}
     }
      $pdfName=[System.Windows.Automation.OrCondition]::new([System.Windows.Automation.Condition[]]@([System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'Microsoft Print to PDF'),[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'Save as PDF')))
      $pdfEntry=$element.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$pdfName)
      if($pdfEntry -and -not $pdfEntry.Current.IsOffscreen -and $pdfEntry.Current.ControlType -in @([System.Windows.Automation.ControlType]::Text,[System.Windows.Automation.ControlType]::ComboBox)){$destinationValues+=@($pdfEntry.Current.Name)}
      $result.destinationValues=@($destinationValues|Select-Object -Unique)
      $chosen=$destinationValues|Where-Object {$_ -in @('Microsoft Print to PDF','Save as PDF')}|Select-Object -First 1
      if($chosen){$result.selectedDestination=$chosen;$result.printUiObserved=$true}
     }
     if($printUi -and $pdfDestinationCombo -and $result.selectedDestination -ne 'Save as PDF' -and -not $result.destinationChoiceAttempted){
      $result.destinationChoiceAttempted=$true;$pdfDestinationCombo.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand();$result.actions+=@('expanded-owned-PDF-destination')
      $picked=$false;$savePdfName=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'Save as PDF')
      for($choiceAttempt=0;$choiceAttempt -lt 25 -and -not $picked;$choiceAttempt++){
       $choiceWindows=@([WritingPrintWindows]::Top()|Where-Object {($_.Pid -in $owned -or $_.OwnerPid -in $owned) -and [WritingPrintWindows]::IsWindowVisible([IntPtr]$_.Handle)})
       foreach($choiceWindow in $choiceWindows){
        $choiceRoot=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$choiceWindow.Handle);$choice=$choiceRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$savePdfName)
        if($choice -and -not $choice.Current.IsOffscreen){try{$choice.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select();$picked=$true}catch{try{$choice.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();$picked=$true}catch{}}}
        if($picked){break}
       }
       if(-not $picked){Start-Sleep -Milliseconds 100}
      }
      $result.destinationChoiceRequested=if($picked){'Save as PDF'}else{'not-selected'}
      if($picked){$result.actions+=@('selected-browser-save-as-PDF-through-owned-native-menu')}
     }
     $destination=$controls|Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox -and $_.Current.Name -match 'Destination|Printer|目标|打印机'}|Select-Object -First 1
     if($destination -and -not $printed){
      try{
       $destination.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()
       $entries=@($element.FindAll([System.Windows.Automation.TreeScope]::Descendants,$interactiveTypes))
       $entry=$entries|Where-Object {$_.Current.Name -in @('Microsoft Print to PDF','Save as PDF')}|Select-Object -Last 1
       if($entry){$entry.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select();$result.actions+=@('selected-PDF-destination-in-owned-print-UI')}
      }catch{$result.destinationNotice=[string]$_}
     }
     if($printUi -and $result.selectedDestination -eq 'Save as PDF'){
      $button=$controls|Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -in @('Print','Save','打印','保存') -and $_.Current.IsEnabled}|Select-Object -Last 1
      if($button){$invocation=[HostedWritingPrintInvocation]::Begin($Executable,$win.Handle,[int]$win.Pid,$button.Current.Name);$result.actions+=@('queued-owned-native-print-ui-'+$button.Current.Name);$printed=$true;break}
     }
    }catch{$result.lastUiaError=[string]$_}
   }
  }
  if($saved -and (Test-Path -LiteralPath $targetFile)){break}
  Start-Sleep -Milliseconds 200
 }while([DateTime]::UtcNow -lt $deadline)
 if(-not $saved -or -not(Test-Path -LiteralPath $targetFile)){throw 'A real native print output was not produced; preserve print UI diagnostics'}
 $wait=[DateTime]::UtcNow.AddSeconds(20)
 $complete=$false
 do{
  $length=(Get-Item -LiteralPath $targetFile).Length
  if($length -gt 1000){
   try{
    $stream=[IO.File]::Open($targetFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    try{$null=$stream.Seek([Math]::Max(0,$stream.Length-1024),[IO.SeekOrigin]::Begin);$tail=New-Object byte[] 1024;$count=$stream.Read($tail,0,$tail.Length);$complete=[Text.Encoding]::ASCII.GetString($tail,0,$count).Contains('%%EOF')}finally{$stream.Dispose()}
   }catch{$result.outputWaitNotice=[string]$_}
  }
  if($complete){break};Start-Sleep -Milliseconds 100
 }while([DateTime]::UtcNow -lt $wait)
 if(-not $complete){throw 'The native print output is empty, still open for writing, or lacks its PDF end marker'}
 if($invocation){for($attempt=0;$attempt -lt 50 -and -not $invocation.Completed;$attempt++){Start-Sleep -Milliseconds 100};if(-not $invocation.Completed -or $invocation.Error){throw 'The real print invocation did not finish cleanly'}}
 $result.status='saved-real-native-print-pdf';$result.sizeBytes=$length;$result.sha256=(Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash.ToLowerInvariant();$result.executable=$Executable
}catch{$result.status='failed';$result.failure=[string]$_;throw}
finally{
 if($invocation){$result.buttonInvocation=[ordered]@{started=$invocation.Started;completed=$invocation.Completed;error=$invocation.Error}}
 if($result.status -eq 'failed'){
  try{
   Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing
   $screenBounds=[Windows.Forms.SystemInformation]::VirtualScreen
   if($screenBounds.Width -le 0 -or $screenBounds.Height -le 0 -or [long]$screenBounds.Width*$screenBounds.Height -gt 16000000){throw 'Hosted diagnostic desktop has invalid bounds'}
   $bitmap=[Drawing.Bitmap]::new($screenBounds.Width,$screenBounds.Height)
   try{$graphics=[Drawing.Graphics]::FromImage($bitmap);try{$graphics.CopyFromScreen($screenBounds.Location,[Drawing.Point]::Empty,$screenBounds.Size)}finally{$graphics.Dispose()};$screenshot=Join-Path ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Report))) 'installed-v1114-native-print-desktop.png';$bitmap.Save($screenshot,[Drawing.Imaging.ImageFormat]::Png);$result.diagnosticDesktopFile=[IO.Path]::GetFileName($screenshot)}finally{$bitmap.Dispose()}
  }catch{$result.diagnosticDesktopNotice=[string]$_}
 }
 $result.companionsRestored=$true
 foreach($companion in @($result.temporarilyMinimizedWindows)){$null=[WritingPrintWindows]::ShowWindow([IntPtr]$companion.Handle,4);if([WritingPrintWindows]::IsIconic([IntPtr]$companion.Handle) -or -not[WritingPrintWindows]::IsWindowVisible([IntPtr]$companion.Handle)){$result.companionsRestored=$false}}
 [IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
}
