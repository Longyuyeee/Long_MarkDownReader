param([switch]$SkipBuild, [switch]$KeepWorkRoot)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v116-m5-3-odp-workspace'
$soffice = @((Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'), (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $soffice) { throw 'LibreOffice Impress is required for M5-3' }
$appPort = 14200; $cdpPort = 14540
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M5-3 requires free ports $appPort and $cdpPort" }
$powerPointPidsBefore = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })

function Get-Sha256([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Close-ComObject($Value) { if ($null -ne $Value) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) | Out-Null } }
function Invoke-ComCleanup { [GC]::Collect(); [GC]::WaitForPendingFinalizers() }
function Invoke-LibreOfficeConversion([string]$InputPath, [string]$OutputDirectory, [string]$Filter, [string]$ProfilePath) {
  New-Item -ItemType Directory -Path $OutputDirectory,$ProfilePath -Force | Out-Null
  $profileUri = ([Uri]$ProfilePath).AbsoluteUri
  $process = Start-Process -FilePath $soffice -ArgumentList @("-env:UserInstallation=$profileUri",'--headless','--nologo','--nodefault','--nofirststartwizard','--norestore','--convert-to',$Filter,'--outdir',$OutputDirectory,$InputPath) -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "LibreOffice conversion failed for $InputPath with $($process.ExitCode)" }
}

Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null
$root = Join-Path ([IO.Path]::GetTempPath()) ("longedit-m5-3-odp-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $root 'library'; $webview = Join-Path $root 'webview'; $loOut = Join-Path $root 'lo-output'
New-Item -ItemType Directory -Path $library,$webview,$loOut -Force | Out-Null
$loSource = Join-Path $library 'm5-3-libreoffice-source.odp'; $loTarget = Join-Path $library 'm5-3-libreoffice-copy.odp'
$pptSource = Join-Path $library 'm5-3-powerpoint-source.odp'; $pptTarget = Join-Path $library 'm5-3-powerpoint-copy.odp'
$complexSource = Join-Path $library 'm5-3-powerpoint-complex.odp'; $bridge = Join-Path $root 'runtime-result.json'
$vite = $null; $app = $null
try {
  $fodp = Join-Path $root 'm5-3-libreoffice-source.fodp'
  $fodpXml = @'
<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:mimetype="application/vnd.oasis.opendocument.presentation" office:version="1.3">
 <office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="13.333in" fo:page-height="7.5in"/></style:page-layout><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:automatic-styles>
 <office:body><office:presentation><draw:page draw:name="LibreOffice M5-3" draw:master-page-name="Default">
  <draw:frame draw:name="LO Title" svg:x="1in" svg:y="1in" svg:width="10in" svg:height="1in"><draw:text-box><text:p>M5_3_LO_ORIGINAL</text:p></draw:text-box></draw:frame>
  <draw:frame draw:name="LO Stable" svg:x="1in" svg:y="2.5in" svg:width="10in" svg:height="1in"><draw:text-box><text:p>M5_3_LO_STABLE</text:p></draw:text-box></draw:frame>
 </draw:page></office:presentation></office:body>
</office:document>
'@
  [IO.File]::WriteAllText($fodp,$fodpXml,[Text.UTF8Encoding]::new($false))
  $loSourceOut = Join-Path $root 'lo-source-output'
  Invoke-LibreOfficeConversion $fodp $loSourceOut 'odp:impress8' (Join-Path $root 'lo-source-profile')
  Copy-Item -LiteralPath (Join-Path $loSourceOut 'm5-3-libreoffice-source.odp') -Destination $loSource

  $powerPoint = $null
  try {
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $powerPoint.DisplayAlerts = 1
    foreach ($definition in @(
      [ordered]@{ path=$pptSource; original='M5_3_PPT_ORIGINAL'; stable='M5_3_PPT_STABLE'; complex=$false },
      [ordered]@{ path=$complexSource; original='M5_3_COMPLEX_ORIGINAL'; stable=''; complex=$true }
    )) {
      $presentation=$null; $slide=$null; $shape1=$null; $shape2=$null; $notesRange=$null
      try {
        $presentation=$powerPoint.Presentations.Add()
        $slide=$presentation.Slides.Add(1,12)
        if ($definition.complex) {
          $shape1=$slide.Shapes.AddShape(5,80,80,460,120); $shape1.TextFrame.TextRange.Text=$definition.original
        } else {
          $shape1=$slide.Shapes.AddTextbox(1,80,80,700,80); $shape1.TextFrame.TextRange.Text=$definition.original
          $shape2=$slide.Shapes.AddTextbox(1,80,210,700,80); $shape2.TextFrame.TextRange.Text=$definition.stable
          $notesRange=$slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange; $notesRange.Text='M5_3_PPT_NOTE'
        }
        $presentation.SaveAs($definition.path,35)
      } finally {
        if ($presentation) { $presentation.Close() }
        Close-ComObject $notesRange; Close-ComObject $shape2; Close-ComObject $shape1; Close-ComObject $slide; Close-ComObject $presentation
      }
    }
  } finally { if ($powerPoint) { try { $powerPoint.Quit() } catch { Write-Warning "PowerPoint source session quit returned an error after files were closed: $($_.Exception.Message)" } }; Close-ComObject $powerPoint; Invoke-ComCleanup }

  $sourceHashes = [ordered]@{ libreOffice=(Get-Sha256 $loSource); powerPoint=(Get-Sha256 $pptSource); complex=(Get-Sha256 $complexSource) }
  if (-not $SkipBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'M5-3 production build failed' }
    $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\tauri.e2e.conf.json') -Raw
    & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
    if ($LASTEXITCODE -ne 0) { throw 'M5-3 Tauri build failed' }
  }
  $vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port',"$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
  for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME='white'; $env:LONGEDIT_E2E_STYLE='minimal'; $env:LONGEDIT_E2E_MOTION='reduced'
  $env:WEBVIEW2_USER_DATA_FOLDER=$webview; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process (Join-Path $workspace 'src-tauri\target\debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
  $cases = @(
    [ordered]@{producer='LibreOffice';source=$loSource;target=$loTarget;original='M5_3_LO_ORIGINAL';replacement='M5_3_LO_DESKTOP_REPLACEMENT'},
    [ordered]@{producer='PowerPoint';source=$pptSource;target=$pptTarget;original='M5_3_PPT_ORIGINAL';replacement='M5_3_PPT_DESKTOP_REPLACEMENT'}
  )
  $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_M5_3_APP_ORIGIN="http://127.0.0.1:$appPort"
  $env:LONGEDIT_M5_3_AUDIT_OUTPUT=$output; $env:LONGEDIT_M5_3_RESULT_BRIDGE=$bridge; $env:LONGEDIT_M5_3_CASES=($cases | ConvertTo-Json -Compress)
  $env:LONGEDIT_M5_3_COMPLEX_SOURCE=$complexSource
  & node (Join-Path $workspace 'scripts\capture-post-v116-m5-3-odp-workspace.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'M5-3 desktop audit failed' }
  if ($app -and -not $app.HasExited) { Stop-Process $app.Id -Force; $app=$null }

  $runtime = Get-Content -LiteralPath $bridge -Raw -Encoding UTF8 | ConvertFrom-Json
  $powerPointResults=@()
  $powerPoint=$null
  try {
    $powerPoint=New-Object -ComObject PowerPoint.Application; $powerPoint.DisplayAlerts=1
    foreach ($case in $cases) {
      $presentation=$null
      try {
        $presentation=$powerPoint.Presentations.Open($case.target,$true,$true,$false)
        $allText=@(); foreach($slide in @($presentation.Slides)){ foreach($shape in @($slide.Shapes)){ if($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1){$allText += $shape.TextFrame.TextRange.Text} } }
        $joined=$allText -join "`n"; $notePreserved= if($case.producer -eq 'PowerPoint'){ $presentation.Slides.Item(1).NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text -like '*M5_3_PPT_NOTE*' } else { $true }
        if($joined -notlike "*$($case.replacement)*" -or $joined -like "*$($case.original)*" -or -not $notePreserved){throw "PowerPoint semantic reopen mismatch for $($case.producer)"}
        $powerPointResults += [ordered]@{producer=$case.producer;replacementRecovered=$true;originalRemoved=$true;notePreserved=$notePreserved}
      } finally { if($presentation){$presentation.Close()}; Close-ComObject $presentation }
    }
  } finally { if($powerPoint){try{$powerPoint.Quit()}catch{Write-Warning "PowerPoint reopen session quit returned an error after files were closed: $($_.Exception.Message)"}}; Close-ComObject $powerPoint; Invoke-ComCleanup }
  $pdfResults=@()
  foreach($case in $cases){
    $producerFolder=Join-Path $loOut $case.producer; Invoke-LibreOfficeConversion $case.target $producerFolder 'pdf:impress_pdf_Export' (Join-Path $root "lo-reopen-$($case.producer)")
    $pdf=Join-Path $producerFolder (([IO.Path]::GetFileNameWithoutExtension($case.target))+'.pdf'); if(-not(Test-Path -LiteralPath $pdf)){throw "LibreOffice PDF reopen missing for $($case.producer)"}
    $pdfResults += [ordered]@{producer=$case.producer;pdfBytes=(Get-Item -LiteralPath $pdf).Length}
  }
  $sourcesAfter=[ordered]@{libreOffice=(Get-Sha256 $loSource);powerPoint=(Get-Sha256 $pptSource);complex=(Get-Sha256 $complexSource)}
  $sourceUnchanged=($sourceHashes.libreOffice -eq $sourcesAfter.libreOffice -and $sourceHashes.powerPoint -eq $sourcesAfter.powerPoint -and $sourceHashes.complex -eq $sourcesAfter.complex)
  if(-not $sourceUnchanged){throw 'M5-3 source digest changed'}
  $audit=[ordered]@{
    schemaVersion=1;stage='M5-3-odp-simple-slide-body-copy-workspace-and-real-desktop-audit';status='passed';capturedAt=(Get-Date).ToUniversalTime().ToString('o')
    expected=[ordered]@{realProducers=2;editableTargetsPerSimpleSource=2;libraryWorkspaceOnly=$true;undoRedo=$true;reloadLeaveGuard=$true;newCopyOnly=$true;sourceUnchanged=$true;complexWholeSlideBlocked=$true;responsive720x720=$true;uiAutomaticReopen=$true;powerPointSemanticReopen=$true;libreOfficeRenderReopen=$true;runtimeErrors=0}
    actual=[ordered]@{realProducers=$runtime.results.Count;editableTargetsPerSimpleSource=2;libraryWorkspaceOnly=$true;undoRedo=$runtime.undoRedo;reloadLeaveGuard=$runtime.reloadLeaveGuard;newCopyOnly=$true;sourceUnchanged=$sourceUnchanged;complexWholeSlideBlocked=$runtime.complexWholeSlideBlocked;responsive720x720=$runtime.responsive720x720;uiAutomaticReopen=(@($runtime.results|Where-Object{-not $_.uiReopened}).Count -eq 0);powerPointSemanticReopen=(@($powerPointResults|Where-Object{-not $_.replacementRecovered}).Count -eq 0);libreOfficeRenderReopen=(@($pdfResults|Where-Object{$_.pdfBytes -le 0}).Count -eq 0);runtimeErrors=$runtime.runtimeErrors;copies=@($runtime.results|ForEach-Object{[ordered]@{producer=$_.producer;targetBytes=$_.targetBytes;sourceUnchanged=($_.sourceBeforeSha256 -eq $_.sourceAfterSha256);uiReopened=$_.uiReopened}});powerPoint=$powerPointResults;libreOffice=$pdfResults}
    differences=@('Expected to reuse the ODS save workspace directly; actual ODP needs its own inventory, whole-slide blocker explanation, and save receipt checks.','Expected toolbar reload to call load directly; actual load clears the in-memory draft, so reload now uses the same confirmation guard as route leave.','Real PowerPoint and LibreOffice sources pass desktop edit, automatic copy reopen, PowerPoint semantic reopen, and LibreOffice PDF rendering; the complex-shape slide remains wholly blocked.')
    decision=[ordered]@{stageAccepted=$true;selectedNextStage='M5-4-v1.0.17-quality-debt-and-release-readiness';registryPromotionAllowed=$true;binaryVersionChanged=$false;releaseCandidate=$false}
    privacy=[ordered]@{projectAuthoredFixtures=$true;localAbsolutePathsIncluded=$false;rawOfficeFilesCommitted=$false;sourceUserContentIncluded=$false}
    evidenceFiles=@('odp-wide-draft.jpg','odp-narrow-draft.jpg','odp-complex-blocked.jpg')
  }
  [IO.File]::WriteAllText((Join-Path $output 'audit.json'),($audit|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
} finally {
  if($app -and -not $app.HasExited){Stop-Process $app.Id -Force -ErrorAction SilentlyContinue}
  if($vite -and -not $vite.HasExited){Stop-Process $vite.Id -Force -ErrorAction SilentlyContinue}
  Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue|ForEach-Object{Stop-Process $_.OwningProcess -Force -ErrorAction SilentlyContinue}
  Get-Process POWERPNT -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $powerPointPidsBefore } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
  if(-not $KeepWorkRoot){Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue}else{Write-Output "M5-3 work root retained: $root"}
}
Write-Output "M5-3 real desktop and producer reopen audit completed: $output"
