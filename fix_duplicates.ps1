# Fix duplicate step definitions
$content = Get-Content "src/steps/api/RequestExecutionSteps.ts"
$newContent = @()
$skipNext = $false
$lineNum = 0

foreach ($line in $content) {
    $lineNum++
    
    # Skip the duplicate sendGenericRequest method (lines 458-465)
    if ($lineNum -eq 458) {
        $skipNext = $true
        continue
    }
    if ($skipNext -and $lineNum -le 465) {
        continue
    }
    if ($lineNum -gt 465) {
        $skipNext = $false
    }
    
    $newContent += $line
}

$newContent | Set-Content "src/steps/api/RequestExecutionSteps.ts"
Write-Host "Fixed RequestExecutionSteps.ts duplicates" 