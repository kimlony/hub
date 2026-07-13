Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

# Test-only defaults for local/CI verification. These are not production secrets.
if (-not $env:HUB_AES_SECRET) {
    $env:HUB_AES_SECRET = "change-me-32-byte-secret-local!!"
}

if (-not $env:POSTGRES_PASSWORD) {
    $env:POSTGRES_PASSWORD = "hub"
}

function Invoke-Step {
    param(
        [string] $Name,
        [string] $WorkingDirectory,
        [scriptblock] $Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    Push-Location $WorkingDirectory
    try {
        & $Command
    }
    finally {
        Pop-Location
    }
}

function Invoke-Native {
    param(
        [string] $FilePath,
        [string[]] $Arguments = @()
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

function Assert-Prerequisites {
    $hasJava = (Get-Command java -ErrorAction SilentlyContinue) -or $env:JAVA_HOME
    if (-not $hasJava) {
        throw "Java 17 is required. Set JAVA_HOME or add java to PATH."
    }

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "Node.js/npm is required. Add npm to PATH before running tests."
    }
}

function Invoke-Gradle {
    param(
        [string[]] $Arguments = @()
    )

    $isWindowsHost = (Get-Variable IsWindows -ErrorAction SilentlyContinue) -and $IsWindows
    if ($isWindowsHost -or $env:OS -eq "Windows_NT") {
        Invoke-Native ".\gradlew.bat" $Arguments
        return
    }

    # The wrapper is not marked executable in this repository, so invoke it through sh on Linux.
    Invoke-Native "sh" (@("./gradlew") + $Arguments)
}

$apiDir = Join-Path $repoRoot "hub-api-erp"
$workerDir = Join-Path $repoRoot "hub-worker"
$frontendDir = Join-Path $apiDir "src/main/frontend"
Assert-Prerequisites

Invoke-Step "Java unit tests" $apiDir {
    Invoke-Gradle @("test")
}

Invoke-Step "Node type check" $workerDir {
    Invoke-Native "npm" @("run", "check")
}

Invoke-Step "Node unit tests" $workerDir {
    Invoke-Native "npm" @("test")
}

Invoke-Step "Node build" $workerDir {
    Invoke-Native "npm" @("run", "build")
}

Invoke-Step "Frontend build" $frontendDir {
    Invoke-Native "npm" @("run", "build")
}

Write-Host ""
Write-Host "Fast verification completed."
