$testsDir = "C:\Users\MartenKirschenhofer\Projekte\PlaywrightSoC_optimized\server\src\tests"
$metricsFile = Join-Path $testsDir "prometheus-metrics.txt"
$targetFile = Join-Path $testsDir "homeoffice-metrics.txt"

Set-Location $testsDir

while ($true) {
    Write-Host "Starte Playwright-Test..."

    Set-Location $testsDir
    npx playwright test .\latency-suite.Optimized.spec.ts

    $metrics = Get-Content $metricsFile -Raw

    if (Test-Path $targetFile) {
        Add-Content -Path $targetFile -Value ""
    }

    Add-Content -Path $targetFile -Value $metrics.TrimEnd()
    Add-Content -Path $targetFile -Value ""

    Write-Host "Block angehaengt. Warte 15 Minuten..."
    Start-Sleep -Seconds 900
}