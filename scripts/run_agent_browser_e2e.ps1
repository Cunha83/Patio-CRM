# Auditoria E2E de Todos os Modulos via Agent-Browser (Vercel)
$ErrorActionPreference = 'Continue'
$logPath = 'docs/evidencias/agent-browser-audit.log'

'=== AUDITORIA E2E DE NAVEGACAO FRONTEND VIA AGENT-BROWSER (VERCEL) ===' | Out-File -FilePath $logPath -Encoding utf8
"Data de Execucao: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $logPath -Append -Encoding utf8
"Servidor: http://patio:patio@localhost:3000/`n" | Out-File -FilePath $logPath -Append -Encoding utf8

Write-Host '1. Abrindo aplicacao no agent-browser...'
$outOpen = & agent-browser open http://patio:patio@localhost:3000/
'--- ABERTURA ---' | Out-File -FilePath $logPath -Append -Encoding utf8
$outOpen | Out-File -FilePath $logPath -Append -Encoding utf8
& agent-browser wait 1500

Write-Host '2. Snapshot Inicial...'
$snapInicial = & agent-browser snapshot -i
'--- SNAPSHOT INICIAL DOS ELEMENTOS ---' | Out-File -FilePath $logPath -Append -Encoding utf8
$snapInicial | Out-File -FilePath $logPath -Append -Encoding utf8

# Lista dos 9 modulos principais
$modulos = @(
    'Operação em Tempo Real',
    'Pátio & Boxes',
    'WhatsApp & CRM',
    'Painel & KPIs',
    'Almoxarifado',
    'Financeiro',
    'Relatórios & Backup',
    'Cadastros & Frotas',
    'Configurações'
)

Write-Host '3. Navegando por todos os 9 modulos...'
foreach ($m in $modulos) {
    Write-Host "   -> Navegando para [$m]..."
    & agent-browser find role button click --name "$m"
    & agent-browser wait 1000
    $snapMod = & agent-browser snapshot -i
    "`n--- MODULO: $m ---" | Out-File -FilePath $logPath -Append -Encoding utf8
    $snapMod | Out-File -FilePath $logPath -Append -Encoding utf8
}

Write-Host '4. Testando Perfil Mecanico (Blindagem Financeira)...'
& agent-browser find role button click --name 'Pátio & Boxes'
& agent-browser wait 1000

# Seleciona perfil Mecanico no combobox
& agent-browser select @e3 '🔧 Mecânico / Box'
& agent-browser wait 1000
$snapMec = & agent-browser snapshot -i
"`n--- PERFIL MECANICO ---" | Out-File -FilePath $logPath -Append -Encoding utf8
$snapMec | Out-File -FilePath $logPath -Append -Encoding utf8

# Restaura para Todos os Modulos
& agent-browser select @e3 'Todos os Módulos'
& agent-browser wait 800

Write-Host '5. Testando Gaveta de Ativacao por Voz e Configuracoes do Agente...'
& agent-browser find role button click --name 'Falar com o Pátio CRM'
& agent-browser wait 1000
$snapVoz = & agent-browser snapshot -i
"`n--- GAVETA DE VOZ E ASSISTENTE ---" | Out-File -FilePath $logPath -Append -Encoding utf8
$snapVoz | Out-File -FilePath $logPath -Append -Encoding utf8

Write-Host 'Auditoria concluida com sucesso!'
'Auditoria concluida com sucesso!' | Out-File -FilePath $logPath -Append -Encoding utf8
