<#
.SYNOPSIS
  Wrapper para acionar o Codex CLI (OpenAI) em modo nao interativo a partir do repo RASTREON.

.DESCRIPTION
  Modos:
    review     - Revisa um diff (uncommitted, base ou commit). Nunca edita arquivos.
    ask        - Envia um prompt em sandbox read-only (analise/leitura). Nunca edita arquivos.
    implement  - Envia um prompt em sandbox workspace-write (pode editar arquivos do repo).
    resume     - Continua uma conversa existente do Codex (-Session <id> ou a mais recente),
                 inclusive uma aberta no painel do Codex do VS Code.
    read       - Le do historico (~/.codex/sessions) a ultima resposta de uma conversa
                 (-Session <id> ou a mais recente), sem gastar tokens.
    list       - Lista as conversas recentes (id, nome, data).

  Toda sessao e persistida no historico compartilhado com a extensao do VS Code: cada chamada
  aparece no painel do Codex como uma conversa normal e pode ser continuada por la.
  A ultima mensagem do agente tambem e gravada em .codex-out/<timestamp>-<modo>.md.

.EXAMPLE
  .\scripts\codex.ps1 ask -Prompt "Responda apenas OK"
  .\scripts\codex.ps1 review -Uncommitted
  .\scripts\codex.ps1 review -Base 3f84c80 -Prompt "Foque em seguranca do socket"
  .\scripts\codex.ps1 implement -Prompt "Corrija X em frontend/web/js/convoy.js"
  .\scripts\codex.ps1 ask -Prompt (Get-Content prompt.txt -Raw) -Config 'model_reasoning_effort="high"'
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0, Mandatory = $true)]
  [ValidateSet('review', 'ask', 'implement', 'resume', 'read', 'list')]
  [string]$Mode,

  [string]$Prompt,
  [string]$Session,
  [string]$Base,
  [string]$Commit,
  [switch]$Uncommitted,
  [string]$Model,
  [string]$Cwd,
  [switch]$Json,
  # Overrides de config do Codex (ex.: 'model_reasoning_effort="high"'), repetivel
  [string[]]$Config
)

$ErrorActionPreference = 'Stop'

function Resolve-CodexBinary {
  $cmd = Get-Command codex -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $extRoot = Join-Path $env:USERPROFILE '.vscode\extensions'
  if (Test-Path $extRoot) {
    $ext = Get-ChildItem $extRoot -Directory |
      Where-Object Name -like 'openai.chatgpt-*' |
      Sort-Object Name -Descending |
      Select-Object -First 1
    if ($ext) {
      $bin = Join-Path $ext.FullName 'bin\windows-x86_64\codex.exe'
      if (Test-Path $bin) { return $bin }
    }
  }

  throw "Codex nao encontrado. Instale o CLI (npm i -g @openai/codex) ou a extensao 'OpenAI ChatGPT' do VS Code."
}

$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }

function Get-SessionFiles {
  $dir = Join-Path $codexHome 'sessions'
  if (-not (Test-Path $dir)) { return @() }
  Get-ChildItem $dir -Recurse -Filter 'rollout-*.jsonl' | Sort-Object LastWriteTime -Descending
}

function Get-SessionText {
  param([string]$Line)
  try { $obj = $Line | ConvertFrom-Json } catch { return $null }
  if ($obj.type -ne 'response_item' -or $obj.payload.type -ne 'message') { return $null }
  $text = ($obj.payload.content | Where-Object { $_.text } | ForEach-Object { $_.text }) -join "`n"
  return [pscustomobject]@{ role = $obj.payload.role; text = $text; time = $obj.timestamp }
}

function Read-Session {
  param([string]$Id)
  $files = Get-SessionFiles
  $file = if ($Id) { $files | Where-Object Name -like "*$Id*" | Select-Object -First 1 } else { $files | Select-Object -First 1 }
  if (-not $file) { throw "Sessao nao encontrada: $Id" }
  $id = [regex]::Match($file.Name, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})').Groups[1].Value
  $msgs = Get-Content $file.FullName -Encoding UTF8 | ForEach-Object { Get-SessionText $_ } | Where-Object { $_ }
  $lastUser = $msgs | Where-Object role -eq 'user' | Select-Object -Last 1
  $lastAssistant = $msgs | Where-Object role -eq 'assistant' | Select-Object -Last 1
  Write-Host "[codex] sessao $id ($($file.LastWriteTime))" -ForegroundColor DarkGray
  Write-Host "----- ULTIMO PEDIDO (usuario) -----" -ForegroundColor Cyan
  if ($lastUser) { Write-Output $lastUser.text }
  Write-Host "----- ULTIMA RESPOSTA (codex) -----" -ForegroundColor Cyan
  if ($lastAssistant) { Write-Output $lastAssistant.text } else { Write-Host '(sem resposta ainda)' -ForegroundColor Yellow }
}

function List-Sessions {
  $index = Join-Path $codexHome 'session_index.jsonl'
  $names = @{}
  if (Test-Path $index) {
    Get-Content $index -Encoding UTF8 | ForEach-Object {
      try { $o = $_ | ConvertFrom-Json; $names[$o.id] = $o.thread_name } catch {}
    }
  }
  Get-SessionFiles | Select-Object -First 15 | ForEach-Object {
    $id = [regex]::Match($_.Name, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})').Groups[1].Value
    $name = if ($names.ContainsKey($id)) { $names[$id] } else { '(sem nome)' }
    "{0}  {1}  {2}" -f $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm'), $id, $name
  }
}

if ($Mode -eq 'read') { Read-Session -Id $Session; exit 0 }
if ($Mode -eq 'list') { List-Sessions; exit 0 }

$repoRoot = if ($Cwd) { (Resolve-Path $Cwd).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$codex = Resolve-CodexBinary

$outDir = Join-Path $repoRoot '.codex-out'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $outDir "$stamp-$Mode.md"

$codexArgs = @('exec')

switch ($Mode) {
  'review' {
    $codexArgs += 'review'
    if ($Commit) { $codexArgs += @('--commit', $Commit) }
    elseif ($Base) { $codexArgs += @('--base', $Base) }
    else { $codexArgs += '--uncommitted' }
  }
  'ask' {
    $codexArgs += @('-s', 'read-only', '-C', $repoRoot)
  }
  'implement' {
    $codexArgs += @('-s', 'workspace-write', '-C', $repoRoot)
  }
  'resume' {
    $codexArgs += 'resume'
    if ($Session) { $codexArgs += $Session } else { $codexArgs += '--last' }
  }
}

$codexArgs += @('--skip-git-repo-check', '-o', $outFile)
if ($Mode -ne 'resume') { $codexArgs += @('--color', 'never') }
if ($Model) { $codexArgs += @('-m', $Model) }
if ($Json) { $codexArgs += '--json' }
foreach ($kv in $Config) { $codexArgs += @('-c', $kv) }

if ($Mode -in @('ask', 'implement', 'resume') -and -not $Prompt) {
  throw "O modo '$Mode' exige -Prompt."
}
# O prompt vai por stdin ('-'): evita que aspas/quebras de linha sejam
# reinterpretadas pelo PowerShell 5.1 na passagem de argumentos nativos.
if ($Prompt) { $codexArgs += '-' }

Write-Host "[codex] $codex" -ForegroundColor DarkGray
Write-Host "[codex] modo=$Mode cwd=$repoRoot" -ForegroundColor DarkGray

Push-Location $repoRoot
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  if ($Prompt) {
    $promptFile = Join-Path $outDir "$stamp-$Mode.prompt.txt"
    [System.IO.File]::WriteAllText($promptFile, $Prompt, (New-Object System.Text.UTF8Encoding($false)))
    # cmd /c para redirecionar stdin de arquivo de forma confiavel no PS 5.1
    $quoted = ($codexArgs | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ' '
    cmd /c "`"$codex`" $quoted < `"$promptFile`""
  } else {
    & $codex @codexArgs
  }
  $exit = $LASTEXITCODE
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "[codex] saida: $outFile" -ForegroundColor Cyan
if ($exit -ne 0) { Write-Host "[codex] exit code $exit" -ForegroundColor Yellow }
exit $exit
