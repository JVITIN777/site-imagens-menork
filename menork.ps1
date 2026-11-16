<#
  menork.ps1 - comandos para os bots falarem com o site de imagens Menork.
  Uso:  powershell -ExecutionPolicy Bypass -File menork.ps1 <comando> [opcoes]
  Rode "menork.ps1 ajuda" para ver a lista. As respostas saem em JSON.
#>
param(
  [Parameter(Position = 0)][string]$Comando = "ajuda",
  [string]$Arquivo, [string]$Produto, [string]$Cor, [string]$Tipo, [string]$Anuncio, [string]$Conta,
  [string[]]$Alertas, [switch]$Conferida, [string]$Motivo, [string]$Bot, [string]$Status, [string]$Detalhe,
  [string]$Limite, [string]$Marketplace, [string]$Destino, [string]$Tarefa, [string]$Info, [string]$Pasta,
  [string[]]$Marketplaces, [int]$Max = 5, [int]$Id
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $raiz "config.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$base = "http://localhost:$($cfg.porta)"
$chaveArq = Join-Path $raiz "dados\chave_bots.txt"
if (-not (Test-Path $chaveArq)) { Write-Output "ERRO: o site ainda nao foi ligado neste PC (rode iniciar.bat)."; exit 1 }
$cab = @{ "X-Chave" = (Get-Content $chaveArq -Raw).Trim() }

function Consulta($pares) {
  $itens = @()
  foreach ($k in $pares.Keys) { if ($pares[$k]) { $itens += "$k=" + [uri]::EscapeDataString([string]$pares[$k]) } }
  if ($itens.Count) { "?" + ($itens -join "&") } else { "" }
}
function Mostrar($o) { $o | ConvertTo-Json -Depth 8 }
function Pegar($caminho, $pares = @{}) { Invoke-RestMethod -Method Get -Uri ($base + $caminho + (Consulta $pares)) -Headers $cab }
function MandarJson($caminho, $corpo) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($corpo | ConvertTo-Json -Depth 8))
  Invoke-RestMethod -Method Post -Uri ($base + $caminho) -Headers $cab -Body $bytes -ContentType "application/json; charset=utf-8"
}
function MandarArquivo($caminho, $extra) {
  if (-not $Arquivo -or -not (Test-Path -LiteralPath $Arquivo)) { throw "Arquivo nao encontrado: $Arquivo" }
  $pares = @{ nome = (Split-Path -Leaf $Arquivo); produto = $Produto; cor = $Cor; tipo = $Tipo; anuncio = $Anuncio; conta = $Conta; origem = $Arquivo; bot = $Bot }
  if ($Alertas) { $pares.alertas = ($Alertas -join "|") }
  if ($Conferida) { $pares.conferida = "1" }
  foreach ($k in $extra.Keys) { $pares[$k] = $extra[$k] }
  Invoke-RestMethod -Method Post -Uri ($base + $caminho + (Consulta $pares)) -Headers $cab -InFile $Arquivo -ContentType "application/octet-stream"
}

try {
  switch ($Comando.ToLower()) {
    "enviar"      { Mostrar (MandarArquivo "/bot/imagem" @{}) }
    "reprovada"   { if (-not $Motivo) { throw "Diga o motivo com -Motivo" }; Mostrar (MandarArquivo "/bot/reprovada" @{ motivo = $Motivo }) }
    "referencias" { Mostrar (Pegar "/bot/referencias" @{ tipo = $Tipo; produto = $Produto; max = $Max }) }
    "erros"       { Mostrar (Pegar "/bot/erros" @{ produto = $Produto }) }
    "anuncios"    { Mostrar (Pegar "/bot/anuncios") }
    "faltas"      { if (-not $Anuncio) { throw "Diga o anuncio com -Anuncio" }; Mostrar (Pegar "/bot/faltas" @{ anuncio = $Anuncio }) }
    "capas"       { Mostrar (Pegar "/bot/capas" @{ produto = $Produto }) }
    "status"      { if (-not $Bot) { throw "Diga o bot com -Bot" }; Mostrar (MandarJson "/bot/status" @{ bot = $Bot; status = $Status; detalhe = $Detalhe }) }
    "conta"       { if (-not $Conta) { throw "Diga a conta com -Conta" }; Mostrar (MandarJson "/bot/conta" @{ conta = $Conta; limite = $Limite }) }
    "instrucoes"  { (Get-Content (Join-Path $raiz "INSTRUCOES_GROK_BOT.md") -Raw -Encoding UTF8).Replace("C:\SiteImagensMenork", $raiz) }
    "pedidos"     { Mostrar (Pegar "/bot/pedidos") }
    "pedido"      { if (-not $Id -or -not $Status) { throw "Diga -Id e -Status (pego ou feito)" }; Mostrar (MandarJson "/bot/pedido" @{ id = $Id; status = $Status; bot = $Bot }) }
    "demanda"     {
      if (-not $Tarefa -or -not $Info) { throw "Diga -Tarefa e -Info" }
      Mostrar (MandarJson "/bot/demanda" @{ tarefa = $Tarefa; info = $Info; pasta = $Pasta; produto = $Produto; marketplaces = @($Marketplaces) })
    }
    "pacote"      {
      if (-not $Anuncio -or -not $Destino) { throw "Diga -Anuncio e -Destino (pasta onde abrir o pacote)" }
      New-Item -ItemType Directory -Force -Path $Destino | Out-Null
      $zip = Join-Path $Destino "pacote.zip"
      Invoke-WebRequest -Uri ($base + "/bot/pacote" + (Consulta @{ anuncio = $Anuncio; mk = $Marketplace; bot = $Bot })) -Headers $cab -OutFile $zip -UseBasicParsing
      Expand-Archive -LiteralPath $zip -DestinationPath $Destino -Force
      Remove-Item -LiteralPath $zip
      Mostrar @{ ok = $true; pasta = $Destino; arquivos = @(Get-ChildItem -LiteralPath $Destino -Recurse -File | ForEach-Object { $_.FullName }) }
    }
    default {
      Write-Output @"
Comandos (respostas em JSON):
  instrucoes                                                (mostra as regras atuais; rode no comeco de cada rodada)
  enviar      -Arquivo <png/jpg> -Produto CI9 -Cor Caramelo -Tipo ia [-Anuncio "CI9 unitario"] [-Conta "Conta 1"] [-Conferida] [-Alertas "Sola diferente","Sem logo"]
  reprovada   -Arquivo <png/jpg> -Motivo "Sola errada" -Bot CONFERENTE [-Produto -Cor -Tipo -Conta]
  referencias -Tipo informativo|tabela|capa|cena [-Produto CI9] [-Max 5]
  erros       [-Produto CI9]
  anuncios
  faltas      -Anuncio "CI9 unitario"
  capas       [-Produto CI9]
  status      -Bot "GERADOR DE IMAGEM" -Status ok|trabalhando|parado -Detalhe "o que esta fazendo"
  conta       -Conta "Conta 2" -Limite "Limite volta as 15:40"   (Limite vazio = disponivel)
  demanda     -Tarefa "NOME DA TAREFA" -Info "texto do INFO JOAO" [-Pasta "\\TRUENAS\..."] [-Produto CI9] [-Marketplaces SHP,ML]
  pacote      -Anuncio "CI9 unitario" -Destino "C:\pasta" [-Marketplace SHP] [-Bot NOME]   (da ERRO com a lista se faltar algo)
  pedidos                                                   (o que o Menork pediu pelo botao "Pedir ao bot")
  pedido      -Id 3 -Status pego|feito -Bot NOME
Tipos: fb, kit2_fb, kit3_fb, kit4_fb, ia, informativo, tabela, capa, capa_kit2, capa_kit3, capa_kit4, cena
"@
    }
  }
}
catch {
  $msg = $_.Exception.Message
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $msg = $_.ErrorDetails.Message }
  Write-Output "ERRO: $msg"
  exit 1
}
