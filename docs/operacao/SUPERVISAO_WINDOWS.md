# Guia de Supervisão, Logs e Agendamento no Windows — Pátio CRM

## 1. Arquitetura de Supervisão e Trava de Instância Única

O Pátio CRM utiliza o supervisor `scripts/supervise_patio.cjs` para garantir a operação contínua e segura da aplicação em ambiente Windows:

### 1.1 Trava Atômica de Instância (`locks/patio-supervisor.lock`)
- Criação atômica de arquivo exclusivo com flag de sistema (`O_CREAT | O_EXCL`).
- **Recuperação de Trava Abandonada:** Caso o processo anterior tenha encerrado de forma abrupta (queda de energia ou encerramento forçado), o supervisor verifica se o PID registrado ainda está ativo (`process.kill(pid, 0)`). Se inativo, a trava é removida com segurança e reassumida.
- Se o PID estiver ativo em outro processo, a inicialização duplicada é abortada imediatamente com código 1.

### 1.2 Pré-voo na Porta TCP e Interface Local
- O supervisor testa a porta TCP configurada (`PORT`, padrão `3000`) no endereço local (`HOST`, padrão `127.0.0.1`).
- Se a porta já estiver em uso, a inicialização é recusada para evitar conflitos de bind ou duplicidade de acesso ao banco SQLite.

### 1.3 Repasse Unificado de Configuração
O supervisor carrega o arquivo `.env` da raiz e repassa explicitamente ao processo filho (`server.js`):
- `HOST`: fixado na interface local `127.0.0.1` por padrão para máxima segurança.
- `PORT`: porta TCP de escuta.
- `DB_PATH`: caminho absoluto do banco operacional `patio.db`.
- `UPLOAD_DIR`: caminho absoluto da pasta de anexos `public/uploads`.

### 1.4 Gravação Contínua de Logs e Proteção Anti-Crash Loop
- `logs/patio-supervisor.log`: saída padrão (`stdout`) da aplicação.
- `logs/patio-supervisor-err.log`: saída de erros (`stderr`).
- Em caso de saída inesperada do processo Node, o supervisor aguarda 2 segundos e reinicia o serviço. Se ocorrerem mais de 5 falhas consecutivas em 60 segundos, o supervisor suspende o ciclo para evitar sobrecarga de hardware e gera alerta.

---

## 2. Inicialização do Sistema no Host da Oficina

### 2.1 Pelo Lançador Rápido (1 Clique)
Executar o arquivo:
```cmd
scripts\iniciar_piloto.bat
```

### 2.2 Pelo Terminal (Prompt de Comando ou PowerShell)
```powershell
node scripts/supervise_patio.cjs
```

---

## 3. Configuração do Agendador de Tarefas do Windows (Task Scheduler)

O backup físico operacional com anexos deve rodar a cada 1 hora.

### 3.1 Prevenção de Sobreposição de Instâncias (`MultipleInstancesPolicy=IgnoreNew`)
- **Nota Técnica sobre a flag `/np`:** Na documentação oficial da Microsoft para o utilitário `schtasks`, `/np` significa *"Do not store password"* (não armazena credenciais para tarefas não-interativas locais). A flag `/np` **não** impede a execução concorrente de tarefas se um job anterior ainda estiver em andamento.
- **Mecanismo Correto de Não-Sobreposição:** O mecanismo oficial do Windows Task Scheduler para evitar sobreposições concorrentes é definir a política de múltiplas instâncias como **`IgnoreNew`** (`MultipleInstancesPolicy = IgnoreNew`). Dessa forma, se um backup demorar mais de 1 hora para transferir arquivos para o destino externo, qualquer novo disparo programado será ignorado até que a instância anterior termine.

### 3.2 Pré-requisitos Obrigatórios antes da Criação da Tarefa
1. Conectar a unidade de destino externo (pendrive ou NAS).
2. Definir a variável `BACKUP_EXTERNAL_DIR` no arquivo `.env` (ex.: `BACKUP_EXTERNAL_DIR=D:\PatioCRM_Backups`).
3. Definir `REQUIRE_EXTERNAL_BACKUP=true` no arquivo `.env`.
4. Identificar a conta de usuário do Windows que possui permissão de leitura/escrita na pasta da aplicação e na unidade externa.

### 3.3 Registro Oficial da Tarefa com `MultipleInstancesPolicy=IgnoreNew`

#### Opção A: Importação da Definição XML Oficial (Recomendado via CMD como Administrador)
O arquivo `docs\operacao\PatioCRM_Backup_WAL.xml` contém a especificação completa com `<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>` pré-configurada:
```cmd
schtasks /create /tn "PatioCRM_Backup_WAL" /xml "c:\Users\AutoMolasFort\.gemini\antigravity-ide\scratch\Patio-CRM-main\docs\operacao\PatioCRM_Backup_WAL.xml" /f
```

#### Opção B: Registro Nativo via PowerShell (Como Administrador)
```powershell
$Action = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" `
  -Argument '"c:\Users\AutoMolasFort\.gemini\antigravity-ide\scratch\Patio-CRM-main\scripts\executar_backup_operacional.cjs"' `
  -WorkingDirectory "c:\Users\AutoMolasFort\.gemini\antigravity-ide\scratch\Patio-CRM-main"

$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)

$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable

Register-ScheduledTask -TaskName "PatioCRM_Backup_WAL" -Action $Action -Trigger $Trigger -Settings $Settings -User "NT AUTHORITY\SYSTEM" -Force
```

> **Contas de Serviço em Rede:** Se a unidade externa for um compartilhamento de rede (NAS/SMB), substitua `"NT AUTHORITY\SYSTEM"` pela conta com permissão de rede (`-User "DOMINIO\Usuario" -Password "..."`).

### 3.4 Como Testar e Verificar a Execução da Tarefa
1. **Disparar a Tarefa Manualmente:**
   ```cmd
   schtasks /run /tn "PatioCRM_Backup_WAL"
   ```
2. **Verificar a Política e Status no PowerShell:**
   ```powershell
   (Get-ScheduledTask -TaskName "PatioCRM_Backup_WAL").Settings.MultipleInstances
   Get-ScheduledTask -TaskName "PatioCRM_Backup_WAL" | Get-ScheduledTaskInfo
   ```
   > Confirme que `.Settings.MultipleInstances` retorna `IgnoreNew` e que o **Último Resultado (Last Result)** foi `0` (`0x0`). Caso retorne `0x1`, consulte `logs\backup_alert.json`.

3. **Verificar o Pacote no Destino Externo:**
   - Conferir se a pasta `package_bck_*` mais recente foi criada no destino externo (ex.: `D:\PatioCRM_Backups`).
   - Conferir a presença de `patio.db`, da pasta `uploads/` e do arquivo `manifest.json`.

---

## 4. Segurança de Rede e Restrições do Piloto

1. **Acesso Local por Padrão:** O servidor escuta estritamente em `127.0.0.1:3000`.
2. **Uso em Tablets/Rede Local da Oficina:**
   - Caso outros dispositivos da LAN precisem acessar o sistema, altere `HOST` no `.env` para o IP privado da máquina servidora (ex.: `HOST=192.168.1.50`).
   - O firewall do Windows deve autorizar a porta 3000 **apenas para o range de IP da sub-rede local** da oficina (ex.: `192.168.1.0/24`).
3. **Proibição Absoluta de Exposição Pública (Internet Direta):**
   - É estritamente proibido criar redirecionamento de porta (port forwarding / DMZ) no roteador da oficina para a porta 3000 sem proxy reverso HTTPS/TLS e autenticação segura.
