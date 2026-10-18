$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1'){throw 'Disposable hosted XLSX producer only'}
$root=Join-Path $env:RUNNER_TEMP ('longedit-v1116-producer-'+[Guid]::NewGuid().ToString('N'))
& python -m venv $root
if($LASTEXITCODE -ne 0){throw 'Producer venv creation failed'}
$python=Join-Path $root 'Scripts\python.exe'
& $python -m pip install --disable-pip-version-check --only-binary=:all: --require-hashes -r (Join-Path $PSScriptRoot 'fixtures\v1116-producer-requirements.txt')
if($LASTEXITCODE -ne 0){throw 'Hash-pinned producer installation failed'}
"LONGEDIT_XLSX_PYTHON=$python" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
