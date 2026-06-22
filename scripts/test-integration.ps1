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
$gradlew = Get-GradleWrapper

Assert-Prerequisites

Write-Host "Java DB integration tests use Testcontainers PostgreSQL."
Write-Host "Node integration tests use Testcontainers PostgreSQL/Kafka."

$previousRunDbIntegrationTests = $env:RUN_DB_INTEGRATION_TESTS

try {
    Invoke-Step "Java DB integration tests" $apiDir {
        $env:RUN_DB_INTEGRATION_TESTS = "true"
        Invoke-Native $gradlew @("test", "--tests", "*IntegrationTest")
    }

    Invoke-Step "Node DB/Kafka integration tests" $workerDir {
        Invoke-Native "npm" @("run", "test:integration")
    }
}
finally {
    $env:RUN_DB_INTEGRATION_TESTS = $previousRunDbIntegrationTests
}

Write-Host ""
Write-Host "Integration verification completed."
