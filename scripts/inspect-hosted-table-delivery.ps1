param([Parameter(Mandatory=$true)][string]$File,[Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1'){throw 'Disposable hosted table fixture only'}
$root=[IO.Path]::GetFullPath($OwnerRoot).TrimEnd('\')+'\';$target=[IO.Path]::GetFullPath($File)
if(-not $target.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath (Join-Path $OwnerRoot '.v119-installed-owner')) -or (Get-Item -LiteralPath $target).Length -gt 32MB){throw 'Bounded owned table fixture required'}
$result=[ordered]@{status='passed';sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant();reader='independent-dotnet-powershell-no-extraction';nativeBridgeMocked=$false;sourceUserContentIncluded=$false}
if([IO.Path]::GetExtension($target) -eq '.csv'){
 $bytes=[IO.File]::ReadAllBytes($target);$result.hasBom=($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191);$result.endsCrlf=($bytes[-2] -eq 13 -and $bytes[-1] -eq 10)
 $records=@(Get-Content -LiteralPath $target -Raw -Encoding UTF8 | ConvertFrom-Csv)
 $result.rows=@($records | ForEach-Object { ,@($_.PSObject.Properties | ForEach-Object {$_.Value}) })
}elseif([IO.Path]::GetExtension($target) -eq '.xlsx'){
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=[IO.Compression.ZipFile]::OpenRead($target)
 try{
  function Read-OwnedXml([string]$name){$entry=$zip.GetEntry($name);if(-not $entry -or $entry.Length -gt 4MB){throw 'Bounded expected XML member required'};$reader=[IO.StreamReader]::new($entry.Open(),[Text.Encoding]::UTF8);try{$text=$reader.ReadToEnd()}finally{$reader.Dispose()};$xml=[Xml.XmlDocument]::new();$xml.XmlResolver=$null;$xml.LoadXml($text);return $xml}
  $shared=Read-OwnedXml 'xl/sharedStrings.xml';$strings=@($shared.SelectNodes('//*[local-name()="si"]') | ForEach-Object {$_.InnerText})
  $sheet=Read-OwnedXml 'xl/worksheets/sheet1.xml';$cells=@{};$types=@{}
  foreach($cell in $sheet.SelectNodes('//*[local-name()="c"]')){$address=$cell.GetAttribute('r');$type=$cell.GetAttribute('t');$value=$cell.SelectSingleNode('./*[local-name()="v"]');if($value){$cells[$address]=if($type -eq 's'){$strings[[int]$value.InnerText]}else{$value.InnerText};$types[$address]=if($type){$type}else{'n'}}}
  $result.cells=$cells;$result.types=$types;$result.hasFormula=($sheet.SelectNodes('//*[local-name()="f"]').Count -gt 0)
 }finally{$zip.Dispose()}
}else{throw 'Only owned CSV/XLSX inspection is supported'}
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Report -Encoding UTF8
