# Docker Push Automation Script with Branch-Based Tagging, SHA, and Version Bumping
# Usage: ./push_release.ps1 [RepoName] [BumpMode]
#   RepoName: e.g., ocybress/aateminerdashboard
#   BumpMode: major | minor | patch (optional, default patch)
# Example: ./push_release.ps1 ocybress/aateminerdashboard patch

param(
    [Parameter(Position=0)]
    [string]$RepoName = "ocybress/aateminerdashboard",

    [Parameter(Position=1)]
    [ValidateSet("major","minor","patch")]
    [string]$BumpMode = "patch"
)

$VersionFile = "version.txt"
$ImageName = "aateminerdashboard"

# --- Step 1: Get Git branch and commit SHA ---
try {
    $GitBranch = git rev-parse --abbrev-ref HEAD
    $CommitSHA = git rev-parse --short HEAD
} catch {
    Write-Host "Git repository not found or Git not installed. Exiting." -ForegroundColor Red
    exit 1
}

Write-Host "Git branch: $GitBranch" -ForegroundColor Cyan
Write-Host "Git commit SHA: $CommitSHA" -ForegroundColor Cyan

# --- Step 2: Determine tag mode based on branch ---
switch ($GitBranch.ToLower()) {
    "main" { $TagMode = "main" }
    "master" { $TagMode = "main" }
    "dev" { $TagMode = "dev" }
    default { $TagMode = "feature" }
}

# --- Step 3: Read current version ---
if (Test-Path $VersionFile) {
    $CurrentVersion = Get-Content $VersionFile -Raw
    $CurrentVersion = $CurrentVersion.Trim()
} else {
    $CurrentVersion = "0.0.0"
}

# Parse semantic version
$VersionParts = $CurrentVersion -split '\.'
$Major = [int]$VersionParts[0]
$Minor = [int]$VersionParts[1]
$Patch = [int]$VersionParts[2]

# --- Step 4: Auto bump version if main branch ---
if ($TagMode -eq "main") {
    switch ($BumpMode) {
        "major" { $Major++; $Minor=0; $Patch=0 }
        "minor" { $Minor++; $Patch=0 }
        "patch" { $Patch++ }
    }
}

$NewVersion = "$Major.$Minor.$Patch"
$ReleaseTag = "r$NewVersion"

Write-Host "--- Configuration ---" -ForegroundColor Cyan
Write-Host "Repository: $RepoName" -ForegroundColor Yellow
Write-Host "Image Name: $ImageName" -ForegroundColor Yellow
Write-Host "Tag Mode: $TagMode" -ForegroundColor Yellow
Write-Host "Previous Version: $CurrentVersion" -ForegroundColor Yellow
if ($TagMode -eq "main") {
    Write-Host "New Version: $NewVersion" -ForegroundColor Green
    Write-Host "Release Tag: $ReleaseTag" -ForegroundColor Yellow
}
Write-Host "Commit SHA: $CommitSHA" -ForegroundColor Yellow
Write-Host ""

# --- Step 5: Confirm ---
$Confirmation = Read-Host "Proceed with build and push? (y/n)"
if ($Confirmation -ne 'y') {
    Write-Host "Aborted by user." -ForegroundColor Red
    exit 0
}

# --- Step 6: Build ---
Write-Host "--- Building Image: $ImageName ---" -ForegroundColor Cyan

# Use buildx with --load to ensure image is available locally
docker buildx build --load -t "${ImageName}:build" .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Exiting." -ForegroundColor Red
    exit 1
}

Write-Host "Image built successfully." -ForegroundColor Green

# Skip getting Image ID entirely, just use the tag name
$SourceImage = "${ImageName}:build"
Write-Host "Using source image: $SourceImage" -ForegroundColor Green

# --- Step 7: Tagging ---
switch ($TagMode) {
    "main" {
        docker tag $SourceImage "${RepoName}:${ReleaseTag}"
        docker tag $SourceImage "${RepoName}:latest"
        docker tag $SourceImage "${RepoName}:${CommitSHA}"
        Write-Host "Tagged main branch: $ReleaseTag, latest, $CommitSHA" -ForegroundColor Cyan
    }
    "dev" {
        docker tag $SourceImage "${RepoName}:dev"
        docker tag $SourceImage "${RepoName}:${CommitSHA}"
        Write-Host "Tagged dev branch: dev, $CommitSHA" -ForegroundColor Cyan
    }
    "feature" {
        $FeatureTag = "dev-$GitBranch"
        docker tag $SourceImage "${RepoName}:${FeatureTag}"
        docker tag $SourceImage "${RepoName}:${CommitSHA}"
        Write-Host "Tagged feature branch: $FeatureTag, $CommitSHA" -ForegroundColor Cyan
    }
}

# --- Step 8: Push ---
Write-Host "--- Pushing Images to Docker Hub ---" -ForegroundColor Cyan

# Determine tags to push
$TagsToPush = @()

switch ($TagMode) {
    "main" { $TagsToPush += @($ReleaseTag, "latest", $CommitSHA) }
    "dev" { $TagsToPush += @("dev", $CommitSHA) }
    "feature" { $TagsToPush += @($FeatureTag, $CommitSHA) }
}

foreach ($t in $TagsToPush) {
    Write-Host "Pushing: ${RepoName}:$t" -ForegroundColor Cyan
    docker push "${RepoName}:$t"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Push failed for tag $t!" -ForegroundColor Red
        exit 1
    }
}

# --- Step 9: Update version file if main branch ---
if ($TagMode -eq "main") {
    Set-Content -Path $VersionFile -Value $NewVersion -NoNewline
    Write-Host "Version file updated to: $NewVersion" -ForegroundColor Green
}

Write-Host "--- Push Complete! ---" -ForegroundColor Green
Write-Host "Tags pushed: $($TagsToPush -join ', ')" -ForegroundColor White
