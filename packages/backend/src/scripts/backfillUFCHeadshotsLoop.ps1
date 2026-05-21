# Resilient wrapper for backfillUFCHeadshots.ts.
#
# Re-runs the script until either:
#   - it exits 0 (no more candidates), or
#   - we hit MaxIterations (safety cap).
#
# Each script run processes ~60-80 fighters before Puppeteer's stealth-plugin
# protocol channel times out and crashes the Node process. Because the
# candidate query skips fighters whose profileImage is now a real R2 URL,
# re-running is a safe resume — no state needed.
#
# Run from packages/backend/:
#   powershell -File src/scripts/backfillUFCHeadshotsLoop.ps1

$MaxIterations = 30
$iter = 0

while ($iter -lt $MaxIterations) {
    $iter++
    Write-Host ""
    Write-Host "================================================================"
    Write-Host "  WRAPPER iteration $iter / $MaxIterations  ($(Get-Date -Format o))"
    Write-Host "================================================================"

    & pnpm tsx src/scripts/backfillUFCHeadshots.ts
    $exitCode = $LASTEXITCODE

    Write-Host ""
    Write-Host "WRAPPER: script exited with code $exitCode"

    if ($exitCode -eq 0) {
        Write-Host "WRAPPER: clean exit, stopping."
        break
    }

    # Crash. Pause briefly so Chrome subprocesses release ports, then loop.
    Write-Host "WRAPPER: crash detected, sleeping 5s before retry..."
    Start-Sleep -Seconds 5
}

if ($iter -ge $MaxIterations) {
    Write-Host "WRAPPER: hit max iterations cap, stopping. Re-run if needed."
}
Write-Host "WRAPPER: done at $(Get-Date -Format o)"
