# ============================================================
#  start-dev.ps1  –  Inicia todo el entorno de desarrollo
#  Uso:  .\scripts\start-dev.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot          # .../back
$repoRoot    = Split-Path -Parent $projectRoot           # raiz del repo (donde vive docker-compose.yml)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  API Clasificacion - Inicio Rapido" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Verificar / Abrir Docker Desktop ─────────────────────
Write-Host "[1/4] Verificando Docker Desktop..." -ForegroundColor Yellow

$dockerRunning = $false
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
} catch { }

if (-not $dockerRunning) {
    Write-Host "  -> Docker no esta corriendo. Abriendo Docker Desktop..." -ForegroundColor DarkYellow

    # Buscar Docker Desktop en rutas comunes.
    # La de %LOCALAPPDATA%\Programs\DockerDesktop es la que usan las versiones
    # recientes cuando se instala solo para el usuario actual: sin ella el
    # script daba "No se encontro Docker Desktop instalado" aunque sí lo estaba.
    $dockerPaths = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
    )

    $dockerExe = $null
    foreach ($path in $dockerPaths) {
        if (Test-Path $path) {
            $dockerExe = $path
            break
        }
    }

    if (-not $dockerExe) {
        Write-Host "  ERROR: No se encontro Docker Desktop instalado." -ForegroundColor Red
        Write-Host "  Descargalo de: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
        exit 1
    }

    Start-Process $dockerExe
    Write-Host "  -> Esperando a que Docker este listo (puede tardar ~30s)..." -ForegroundColor DarkYellow

    $maxWait = 120  # segundos maximo de espera
    $elapsed = 0
    while ($elapsed -lt $maxWait) {
        Start-Sleep -Seconds 3
        $elapsed += 3
        try {
            $null = docker info 2>&1
            if ($LASTEXITCODE -eq 0) {
                $dockerRunning = $true
                break
            }
        } catch { }
        Write-Host "  -> Esperando... ($elapsed s)" -ForegroundColor DarkGray
    }

    if (-not $dockerRunning) {
        Write-Host "  ERROR: Docker no respondio despues de $maxWait segundos." -ForegroundColor Red
        exit 1
    }
}

Write-Host "  Docker Desktop esta listo!" -ForegroundColor Green

# ── 2. Levantar PostgreSQL con Docker Compose ───────────────
Write-Host ""
Write-Host "[2/4] Levantando contenedor de PostgreSQL..." -ForegroundColor Yellow

# Solo base de datos y cache: el backend y el frontend se ejecutan localmente en modo dev
# docker-compose.yml esta en la raiz del repo, no en back/
Push-Location $repoRoot
$null = docker volume create api-clasificacion_pgdata 2>&1
docker compose up -d db redis
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Fallo al levantar docker compose (revisa REDIS_PASSWORD en el .env)." -ForegroundColor Red
    exit 1
}

Write-Host "  PostgreSQL corriendo en puerto 5433 y Redis en 6379!" -ForegroundColor Green

# ── 3. Esperar a que PostgreSQL acepte conexiones ───────────
Write-Host ""
Write-Host "[3/4] Esperando a que PostgreSQL acepte conexiones..." -ForegroundColor Yellow

$pgReady = $false
# Con Docker Desktop recien abierto (arranque en frio) el contenedor tarda mas
# de 30 s en aceptar conexiones; con 30 el script se rendia justo antes.
$pgMaxWait = 90
$pgElapsed = 0

while ($pgElapsed -lt $pgMaxWait) {
    try {
        $null = docker exec clasificacion_bd pg_isready -U postgres -d clasificacion 2>&1
        if ($LASTEXITCODE -eq 0) {
            $pgReady = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 2
    $pgElapsed += 2
    Write-Host "  -> Esperando PostgreSQL... ($pgElapsed s)" -ForegroundColor DarkGray
}

if (-not $pgReady) {
    Write-Host "  ERROR: PostgreSQL no esta listo en localhost:5433." -ForegroundColor Red
    Write-Host "  Verifica que Docker Desktop este abierto y que el motor este iniciado (Docker Desktop is running)." -ForegroundColor Red
    Pop-Location
    exit 1
} else {
    Write-Host "  PostgreSQL listo para conexiones!" -ForegroundColor Green
}

# ── 4. Instalar dependencias si es necesario e iniciar app ──
Write-Host ""
Write-Host "[4/4] Iniciando la aplicacion NestJS..." -ForegroundColor Yellow

# Liberar el puerto de la app si quedo una instancia previa (evita EADDRINUSE)
$appPort = if ($env:APP_PORT) { [int]$env:APP_PORT } else { 3000 }
try {
    $inUse = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction Stop
    foreach ($conn in $inUse) {
        Write-Host "  -> Puerto $appPort ocupado por PID $($conn.OwningProcess); cerrando esa instancia..." -ForegroundColor DarkYellow
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
} catch { }

Push-Location $projectRoot

# Verificar si node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "  -> Instalando dependencias (npm install)..." -ForegroundColor DarkYellow
    npm install
}

# ── Migraciones de BD ──────────────────────────────────────
# La app corre con DB_SYNCHRONIZE=false: si el esquema quedo por detras del
# codigo, TypeORM responde 500 en cada consulta. Aplicamos las migraciones
# pendientes ANTES de arrancar; si fallan, no se levanta la app.
Write-Host ""
Write-Host "  -> Aplicando migraciones de BD..." -ForegroundColor Yellow
node "$PSScriptRoot/db-migrate.js"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: fallaron las migraciones de BD. No se inicia la app." -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Todo listo! Iniciando NestJS..." -ForegroundColor Green
Write-Host "  http://localhost:3000" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

npm run start:dev

Pop-Location
