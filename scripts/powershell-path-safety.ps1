function Get-TrustedTempRoots {
  $candidates = @(
    $env:TEMP,
    $env:TMP,
    $env:RUNNER_TEMP,
    [System.IO.Path]::GetTempPath()
  )

  return @($candidates |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    ForEach-Object { [System.IO.Path]::GetFullPath($_).TrimEnd('\', '/') } |
    Sort-Object -Unique)
}

function Test-PathWithinTrustedTemp {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $candidate = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
  foreach ($root in Get-TrustedTempRoots) {
    if ($candidate.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -or
        $candidate.StartsWith(
          $root + [System.IO.Path]::DirectorySeparatorChar,
          [System.StringComparison]::OrdinalIgnoreCase
        )) {
      return $true
    }
  }
  return $false
}
