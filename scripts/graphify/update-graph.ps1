param(
  [switch]$Check,
  [switch]$Deep,
  [switch]$Global,
  [string]$Tag = "3DPrintPosters",
  [int]$MaxConcurrency = 4
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$envPath = Join-Path $repoRoot ".env"

function Import-GraphifyEnvKey {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if ([Environment]::GetEnvironmentVariable($Name, "Process")) {
    return $true
  }

  if (-not (Test-Path -LiteralPath $Path)) {
    return $false
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
      $value = $Matches[1].Trim()
      if (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
      ) {
        $value = $value.Substring(1, $value.Length - 2)
      }

      if ($value) {
        [Environment]::SetEnvironmentVariable($Name, $value, "Process")
        return $true
      }
    }
  }

  return $false
}

$uvGraphify = Join-Path $HOME ".local\bin\graphify.exe"
$graphifyBin = if (Test-Path -LiteralPath $uvGraphify) {
  $uvGraphify
} else {
  $command = Get-Command graphify -ErrorAction SilentlyContinue
  if ($command) {
    $command.Source
  }
}

if (-not $graphifyBin) {
  throw "graphify was not found on PATH. Install it with: uv tool install `"graphifyy[gemini]`""
}

$hasGemini = Import-GraphifyEnvKey -Path $envPath -Name "GEMINI_API_KEY"
$hasGoogle = Import-GraphifyEnvKey -Path $envPath -Name "GOOGLE_API_KEY"

if (-not ($hasGemini -or $hasGoogle)) {
  throw "No GEMINI_API_KEY or GOOGLE_API_KEY found in the current environment or $envPath."
}

if ($Check) {
  Write-Host "Graphify automation check OK"
  Write-Host "Repo: $($repoRoot.Path)"
  Write-Host "Graphify: $graphifyBin"
  & $graphifyBin --version
  exit $LASTEXITCODE
}

$graphifyArgs = @(
  "extract",
  $repoRoot.Path,
  "--backend",
  "gemini",
  "--out",
  $repoRoot.Path,
  "--max-concurrency",
  "$MaxConcurrency"
)

if ($Deep) {
  $graphifyArgs += "--mode"
  $graphifyArgs += "deep"
}

if ($Global) {
  $graphifyArgs += "--global"
  $graphifyArgs += "--as"
  $graphifyArgs += $Tag
}

Write-Host "Running Graphify with Gemini for $($repoRoot.Path)"
Write-Host "Output: $($repoRoot.Path)\graphify-out"

& $graphifyBin @graphifyArgs
exit $LASTEXITCODE
