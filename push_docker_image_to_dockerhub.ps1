# Docker Push Automation Script
# Usage: ./push_release.ps1 [RepoName]
# Example: ./push_release.ps1 ocybress/aateminerdashboard
# Example: ./push_release.ps1 myuser/myrepo

param(
    [Parameter(Position=0)]
    [string]$RepoName = "ocybress/aateminerdashboard"
)

$VersionFile = "version.txt"
$ImageName = "aateminerdashboard"

# Read current version or initialize to 0.0.0
if (Test-Path $VersionFile) {
    $CurrentVersion = Get-Content $VersionFile -Raw
    $CurrentVersion = $CurrentVersion.Trim()
} else {
    $CurrentVersion = "0.0.0"
}

# Parse version (format: major.minor.patch)
$VersionParts = $CurrentVersion -split '\.'
$Major = [int]$VersionParts[0]
$Minor = [int]$VersionParts[1]
$Patch = [int]$VersionParts[2]

# Increment patch version
$Patch++

# Create new version string
$NewVersion = "$Major.$Minor.$Patch"
$Tag = "r$NewVersion"

Write-Host "--- Configuration ---" -ForegroundColor Cyan
Write-Host "Repository: $RepoName" -ForegroundColor Yellow
Write-Host "Previous Version: $CurrentVersion" -ForegroundColor Yellow
Write-Host "New Version: $NewVersion" -ForegroundColor Green
Write-Host "Tag: $Tag" -ForegroundColor Yellow
Write-Host "Image Name: $ImageName" -ForegroundColor Yellow
Write-Host ""

# Confirm before proceeding
$Confirmation = Read-Host "Proceed with build and push? (y/n)"
if ($Confirmation -ne 'y') {
    Write-Host "Aborted by user." -ForegroundColor Red
    exit 0
}

Write-Host "--- Starting Build: $ImageName ---" -ForegroundColor Cyan
docker build -t $ImageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Exiting." -ForegroundColor Red
    exit 1
}

# Capture the Image ID of the newly built image
$ImageId = docker images -q $ImageName":latest"

if (-not $ImageId) {
    Write-Host "Could not find Image ID for $ImageName:latest. Exiting." -ForegroundColor Red
    exit 1
}

Write-Host "Captured Image ID: $ImageId" -ForegroundColor Green
Write-Host "Tagging as: ${RepoName}:${Tag}" -ForegroundColor Cyan

docker tag $ImageId "${RepoName}:${Tag}"
docker tag $ImageId "${RepoName}:latest"

Write-Host "--- Pushing to Docker Hub ---" -ForegroundColor Cyan
docker push "${RepoName}:${Tag}"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed! Version not updated." -ForegroundColor Red
    exit 1
}

docker push "${RepoName}:latest"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Push of 'latest' tag failed! But versioned tag was successful." -ForegroundColor Yellow
}

# Save new version to file ONLY after successful push
Set-Content -Path $VersionFile -Value $NewVersion -NoNewline

Write-Host "--- Release $Tag Complete! ---" -ForegroundColor Green
Write-Host "Images pushed:" -ForegroundColor Green
Write-Host "  - ${RepoName}:${Tag}" -ForegroundColor White
Write-Host "  - ${RepoName}:latest" -ForegroundColor White
Write-Host ""
Write-Host "Version file updated to: $NewVersion" -ForegroundColor Green