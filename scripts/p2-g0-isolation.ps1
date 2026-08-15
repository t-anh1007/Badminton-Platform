<#
P2-G0 structural gate. Creates an isolated, randomly named database, creates
only the matchmaking/community schemas and their service-role ownership, deploys
the committed migrations, and proves both schema isolation and no cross-schema FK.
The temporary database is always removed at the end.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$dbName = "p2_g0_$([Guid]::NewGuid().ToString('N'))"
$container = 'khoaluantn-postgres'
$prisma = Join-Path $repoRoot 'node_modules/.bin/prisma.cmd'
$vitest = Join-Path $repoRoot 'node_modules/.bin/vitest.cmd'
$hadMatchmakingUrl = Test-Path Env:MATCHMAKING_DATABASE_URL
$previousMatchmakingUrl = if ($hadMatchmakingUrl) { $env:MATCHMAKING_DATABASE_URL } else { $null }
$hadCommunityUrl = Test-Path Env:COMMUNITY_DATABASE_URL
$previousCommunityUrl = if ($hadCommunityUrl) { $env:COMMUNITY_DATABASE_URL } else { $null }
$hadDatabaseGate = Test-Path Env:P2_G0_DATABASE_GATE
$previousDatabaseGate = if ($hadDatabaseGate) { $env:P2_G0_DATABASE_GATE } else { $null }

function Invoke-Psql([string]$Sql) {
  & docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Sql" }
}

function Invoke-ServicePsql([string]$User, [string]$Password, [string]$Sql) {
  & docker exec -e "PGPASSWORD=$Password" $container psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U $User -d $dbName -c $Sql
  return $LASTEXITCODE
}

try {
  & docker inspect -f '{{.State.Running}}' $container | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Required PostgreSQL container '$container' is not running." }

  Invoke-Psql "CREATE DATABASE $dbName"
  Invoke-Psql "GRANT CONNECT ON DATABASE $dbName TO matchmaking_svc, community_svc"
  & docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d $dbName -c 'CREATE SCHEMA matchmaking AUTHORIZATION matchmaking_svc; CREATE SCHEMA community AUTHORIZATION community_svc; REVOKE ALL ON SCHEMA public FROM matchmaking_svc, community_svc;'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated service schemas.' }

  $env:MATCHMAKING_DATABASE_URL = "postgresql://matchmaking_svc:matchmaking_pw@localhost:5432/${dbName}?schema=matchmaking"
  Push-Location (Join-Path $repoRoot 'services/matchmaking-service')
  try {
    & $prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'Matchmaking migration deployment failed.' }
  } finally { Pop-Location }

  $env:COMMUNITY_DATABASE_URL = "postgresql://community_svc:community_pw@localhost:5432/${dbName}?schema=community"
  Push-Location (Join-Path $repoRoot 'services/community-service')
  try {
    & $prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'Community migration deployment failed.' }
  } finally { Pop-Location }

  $env:P2_G0_DATABASE_GATE = '1'
  Push-Location (Join-Path $repoRoot 'services/matchmaking-service')
  try {
    & $vitest run test/g0Database.test.ts --no-file-parallelism
    if ($LASTEXITCODE -ne 0) { throw 'Matchmaking database guard tests failed.' }
  } finally { Pop-Location }

  Push-Location (Join-Path $repoRoot 'services/community-service')
  try {
    & $vitest run test/g0Database.test.ts --no-file-parallelism
    if ($LASTEXITCODE -ne 0) { throw 'Community database guard tests failed.' }
  } finally { Pop-Location }

  $crossFk = & docker exec $container psql -qAt -U postgres -d $dbName -c "SELECT count(*) FROM pg_constraint c JOIN pg_class src ON src.oid = c.conrelid JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace JOIN pg_class ref ON ref.oid = c.confrelid JOIN pg_namespace ref_ns ON ref_ns.oid = ref.relnamespace WHERE c.contype = 'f' AND src_ns.nspname IN ('matchmaking', 'community') AND src_ns.nspname <> ref_ns.nspname;"
  if ($LASTEXITCODE -ne 0 -or $crossFk.Trim() -ne '0') { throw "Cross-schema FK count must be 0; got '$crossFk'." }

  # Each role must be rejected when reading the other service schema.
  $matchDenied = Invoke-ServicePsql 'matchmaking_svc' 'matchmaking_pw' 'SELECT * FROM community.posts;'
  if ($matchDenied -eq 0) { throw 'matchmaking_svc unexpectedly read community.posts.' }
  $communityDenied = Invoke-ServicePsql 'community_svc' 'community_pw' 'SELECT * FROM matchmaking.matches;'
  if ($communityDenied -eq 0) { throw 'community_svc unexpectedly read matchmaking.matches.' }

  Write-Output "P2-G0 isolation gate passed for $dbName"
} finally {
  if ($hadMatchmakingUrl) { $env:MATCHMAKING_DATABASE_URL = $previousMatchmakingUrl } else {
    Remove-Item Env:MATCHMAKING_DATABASE_URL -ErrorAction SilentlyContinue
  }
  if ($hadCommunityUrl) { $env:COMMUNITY_DATABASE_URL = $previousCommunityUrl } else {
    Remove-Item Env:COMMUNITY_DATABASE_URL -ErrorAction SilentlyContinue
  }
  if ($hadDatabaseGate) { $env:P2_G0_DATABASE_GATE = $previousDatabaseGate } else {
    Remove-Item Env:P2_G0_DATABASE_GATE -ErrorAction SilentlyContinue
  }
  if ($dbName -notmatch '^p2_g0_[0-9a-f]{32}$') { throw "Refusing to drop unexpected database name '$dbName'." }
  & docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "DROP DATABASE IF EXISTS $dbName WITH (FORCE)"
  if ($LASTEXITCODE -ne 0) { throw "Could not remove isolated database '$dbName'." }
}
