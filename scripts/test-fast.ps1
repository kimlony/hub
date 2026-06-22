Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

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

function Get-GradleWrapper {
    $isWindowsHost = (Get-Variable IsWindows -ErrorAction SilentlyContinue) -and $IsWindows
    if ($isWindowsHost -or $env:OS -eq "Windows_NT") {
        return ".\gradlew.bat"
    }

    return "./gradlew"
}

$apiDir = Join-Path $repoRoot "hub-api-erp"
$workerDir = Join-Path $repoRoot "hub-worker"
$frontendDir = Join-Path $apiDir "src/main/frontend"
$gradlew = Get-GradleWrapper

Assert-Prerequisites

Invoke-Step "Java unit tests" $apiDir {
    Invoke-Native $gradlew @("test")
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
