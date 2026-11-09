param(
    [Parameter(Mandatory)][string]$Serial,
    [string]$Adb = 'E:\Android\Sdk\platform-tools\adb.exe'
)

# Development test helper: dot-source with an explicit test-device serial.
# Each action uses a fresh accessibility dump; failed dumps are never reused.
$mobileTestSerial = $Serial
$mobileTestAdb = $Adb
function Get-MobileUi {
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        $result = (& $mobileTestAdb -s $mobileTestSerial shell uiautomator dump /sdcard/longedit-window.xml 2>&1) -join "`n"
        if ($result -like '*dumped to*') {
            return [xml](& $mobileTestAdb -s $mobileTestSerial shell cat /sdcard/longedit-window.xml)
        }
        Start-Sleep -Milliseconds 300
    }
    throw 'Could not obtain a fresh Android accessibility dump.'
}
function Find-MobileNode {
    param([string]$Text, [string]$Class, [string]$Description, [switch]$Contains)
    for ($attempt = 0; $attempt -lt 6; $attempt++) {
        $ui = Get-MobileUi
        $found = $ui.SelectNodes('//node') | Where-Object {
            (-not $Class -or $_.class -eq $Class) -and
            (-not $Description -or $_.'content-desc' -eq $Description) -and
            (-not $Text -or $(if ($Contains) { $_.text.Contains($Text) } else { $_.text -eq $Text })) -and
            $_.bounds -ne '[0,0][0,0]'
        } | Select-Object -Last 1
        if ($found) { return $found }
        Start-Sleep -Milliseconds 300
    }
    throw "Expected Android UI element missing: $Text $Class"
}
function Tap-MobileNode {
    param([string]$Text, [string]$Class, [string]$Description, [switch]$Contains)
    $element = Find-MobileNode -Text $Text -Class $Class -Description $Description -Contains:$Contains
    $values = [regex]::Matches($element.bounds, '\d+') | ForEach-Object { [int]$_.Value }
    if ($values.Count -ne 4 -or $values[2] -le $values[0] -or $values[3] -le $values[1]) { throw 'Element is outside visible bounds.' }
    & $mobileTestAdb -s $mobileTestSerial shell input tap ([int](($values[0] + $values[2]) / 2)) ([int](($values[1] + $values[3]) / 2))
    if ($LASTEXITCODE -ne 0) { throw 'Android input failed.' }
}
