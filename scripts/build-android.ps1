param(
    [ValidateSet('generate-key', 'validate', 'build')][string]$Mode = 'validate',
    [string]$CredentialsFile
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRoot
try {
    $taskArguments = @('exec', 'tsx', 'scripts/android-release.ts', $Mode)
    if ($CredentialsFile) { $taskArguments += @('--credentials', $CredentialsFile) }
    & pnpm @taskArguments
    if ($LASTEXITCODE -ne 0) { throw 'Android release workflow stopped. No publishing was performed.' }
} finally { Pop-Location }
