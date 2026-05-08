# Build Docker image for ARM32v7 (Raspberry Pi 2B)
# This script uses Docker Buildx to cross-compile the image for the ARMv7 architecture
# and exports it as a .tar file so it can be copied to the Raspberry Pi.

$ImageName = "aateminerdashboard"
$Tag = "arm32v7"
$TarFile = "${ImageName}_${Tag}.tar"

Write-Host "--- Building Docker Image for ARM32v7 (Raspberry Pi 2B) ---" -ForegroundColor Cyan
Write-Host "Image Name: ${ImageName}:${Tag}" -ForegroundColor Yellow
Write-Host "Output File: $TarFile" -ForegroundColor Yellow
Write-Host ""

# Ensure buildx is available and create a new builder instance if the default one doesn't support multi-arch
$BuilderName = "multiarch-builder"

# Check if builder exists, create if not
$builderExists = docker buildx ls | Select-String -Pattern $BuilderName
if (-not $builderExists) {
    Write-Host "Creating new buildx builder instance: $BuilderName..." -ForegroundColor Cyan
    docker buildx create --name $BuilderName --use
} else {
    Write-Host "Using existing buildx builder instance: $BuilderName" -ForegroundColor Cyan
    docker buildx use $BuilderName
}

# Boot the builder if necessary
docker buildx inspect --bootstrap | Out-Null

Write-Host "Starting build... This may take a few minutes as it cross-compiles for ARM." -ForegroundColor Yellow

# Build and export to tar
docker buildx build --platform linux/arm/v7 -t "${ImageName}:${Tag}" -o type=docker,dest=$TarFile .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Exiting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "--- Build Complete! ---" -ForegroundColor Green
Write-Host "The image has been exported to: $TarFile" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Copy the tar file to your Raspberry Pi 2B (e.g., using SCP or WinSCP):"
Write-Host "   scp $TarFile pi@<your-pi-ip>:~/"
Write-Host "2. Load the image into Docker on the Raspberry Pi:"
Write-Host "   docker load -i $TarFile"
Write-Host "3. Run your docker-compose.yml as usual."
