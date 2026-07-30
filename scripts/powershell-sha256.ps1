function Get-Sha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $stream = [System.IO.File]::OpenRead($resolved)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $algorithm.ComputeHash($stream)
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
  }
  finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}
