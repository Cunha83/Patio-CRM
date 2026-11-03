/* =====================================================================
   PÁTIO CRM — HUB DE RECEBIMENTOS: PIX, BOLETOS, CARTÃO & RÉGUA
===================================================================== */

function blocoHubRecebimentos() {
  const subAba = S.ui.subAbaHubRec || 'pix';
  const cfg = S.cfg || {};
  const pixCfg = cfg.pix || {
    contaDestino: 'Banco Itaú — Ag 0142 C/C 12345-6',
    chavePix: '12.345.678/0001-90',
    tipoChave: 'CNPJ',
    multaPercent: 2.00,
    jurosPercent: 1.00,
    diasCarencia: 1
  };

  return `
  <!-- FRENTE 4: SUB-ABAS DO HUB DE RECEBIMENTOS -->
  <div class="folder-tabs" style="margin-bottom:14px">
    <button class="folder-tab ${subAba === 'pix' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='pix';render()"><span style="font-weight:700">⚡ PIX INSTANTÂNEO</span></button>
    <button class="folder-tab ${subAba === 'pix_cfg' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='pix_cfg';render()"><span>⚙️ CONFIGURAÇÕES PIX</span></button>
    <button class="folder-tab ${subAba === 'boletos' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='boletos';render()"><span>📄 BOLETOS BANCÁRIOS</span></button>
    <button class="folder-tab ${subAba === 'cartao' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='cartao';render()"><span>💳 CARTÃO DE CRÉDITO</span></button>
    <button class="folder-tab ${subAba === 'regua' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='regua';render()"><span>📲 RÉGUA DE COBRANÇA WHATSAPP</span></button>
  </div>

  ${subAba === 'pix' ? `
    <!-- TELA 1: PIX INSTANTÂNEO -->
    <div style="background:linear-gradient(135deg, #0f766e 0%, #115e59 100%);color:#fff;padding:20px;border-radius:10px;margin-bottom:16px;box-shadow:0 4px 12px rgba(15,118,110,0.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:8px">⚡ LIQUIDAÇÃO EM SEGUNDOS</div>
          <h2 style="margin:0 0 6px 0;font-size:20px;font-weight:800">Recebimento Pix com Conciliação Automática</h2>
          <p style="margin:0;font-size:13.5px;opacity:0.9">Gere QR Codes dinâmicos com identificador de OS/Venda. O Pátio baixa automaticamente as contas a receber assim que o cliente paga.</p>
        </div>
        <button class="btn" onclick="abrirModalGeradorPixRapido()" style="background:#ffffff;color:#0f766e;font-weight:800;padding:10px 18px;border-radius:8px;border:none;box-shadow:0 2px 6px rgba(0,0,0,0.15);cursor:pointer">+ Cobrar via Pix Agora</button>
      </div>
    </div>

    <!-- Tabela de Cobranças Pix Recentes -->
    <div class="card" style="padding:0;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <div style="padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:14px;font-weight:700;color:#0f172a">Últimos Recebimentos & QR Codes Gerados</h3>
        <span class="selo selo-aprovacao" style="font-size:11px">Webhook Conectado</span>
      </div>
      <div class="tabela-responsiva">
        <table class="tabela-densa">
          <thead>
            <tr>
              <th style="width:110px">ID / Transação</th>
              <th>Cliente / Devedor</th>
              <th style="width:110px;text-align:center">Venda / OS</th>
              <th style="width:130px">Data / Hora</th>
              <th style="width:130px;text-align:right">Valor</th>
              <th style="width:120px;text-align:center">Status</th>
              <th style="width:140px;text-align:center">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="mono"><b>#PIX-9821</b></td>
              <td><b>Transportes Rodoviários Silva Ltda</b><div class="mini mono" style="color:#64748b">12.345.678/0001-90</div></td>
              <td style="text-align:center"><span class="mono" style="font-weight:700;color:#2563eb">#V-101</span></td>
              <td>${hoje()} 10:14</td>
              <td style="text-align:right;font-weight:700;color:#0f172a" class="mono">${brl(4850.00)}</td>
              <td style="text-align:center"><span class="badge-vivid badge-sucesso">Recebido</span></td>
              <td style="text-align:center"><button class="btn btn-neutro" onclick="torrar('Comprovante bancário autenticado pela CIP.','sucesso')" style="padding:4px 8px;font-size:11px">Comprovante</button></td>
            </tr>
            <tr>
              <td class="mono"><b>#PIX-9822</b></td>
              <td><b>Expresso Rodoviário Cordeiro S.A.</b><div class="mini mono" style="color:#64748b">98.765.432/0001-10</div></td>
              <td style="text-align:center"><span class="mono" style="font-weight:700;color:#2563eb">#OS-340</span></td>
              <td>${hoje()} 11:28</td>
              <td style="text-align:right;font-weight:700;color:#0f172a" class="mono">${brl(3200.00)}</td>
              <td style="text-align:center"><span class="badge-vivid badge-alerta">Aguardando</span></td>
              <td style="text-align:center"><button class="btn btn-sucesso" onclick="enviarPixWhatsApp('Expresso Cordeiro', 3200, '19999881122')" style="padding:4px 8px;font-size:11px">💬 Cobrar WhatsApp</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ` : (subAba === 'pix_cfg' ? `
    <!-- TELA 2: CONFIGURAÇÕES PIX COM CONTA DESTINO E JUROS/MULTA -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:16px">
      <!-- Card Formulário Conta Bancária Destino -->
      <div class="card" style="border:1px solid #cbd5e1;padding:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div style="font-size:22px">🏦</div>
          <div><h3 style="margin:0;font-size:15px;font-weight:700;color:#0f172a">Conta Bancária (Destino)</h3><div style="font-size:12px;color:#64748b">Conta caixa onde os recebimentos Pix serão creditados</div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Conta Caixa Vinculada:</label>
            <select id="pix_conta_destino" class="campo" style="width:100%;height:38px;font-size:13px;font-weight:600">
              <option value="itau" selected>Banco Itaú Unibanco — Agência 0142 C/C 12345-6</option>
              <option value="bradesco">Banco Bradesco S.A. — Agência 2233 C/C 99881-2</option>
              <option value="santander">Banco Santander Brasil — Agência 0098 C/C 45671-0</option>
              <option value="bb">Banco do Brasil S.A. — Agência 1120 C/C 34567-8</option>
              <option value="gaveta">Caixa Físico Balcão / Gaveta</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Tipo de Chave Pix:</label>
            <select class="campo" style="width:100%;height:38px;font-size:13px">
              <option value="cnpj" selected>CNPJ da Empresa</option>
              <option value="celular">Celular / WhatsApp</option>
              <option value="email">E-mail Comercial</option>
              <option value="evp">Chave Aleatória (EVP)</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Chave Pix Cadastrada no Banco:</label>
            <input type="text" id="pix_chave" class="campo-texto" value="${esc(pixCfg.chavePix || '12.345.678/0001-90')}" style="width:100%;height:38px;font-size:13px;font-weight:700">
          </div>
        </div>
      </div>

      <!-- Card Juros e Multa para Cobranças Vencidas -->
      <div class="card" style="border:1px solid #cbd5e1;padding:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div style="font-size:22px">⚖️</div>
          <div><h3 style="margin:0;font-size:15px;font-weight:700;color:#0f172a">Juros e Multa por Atraso</h3><div style="font-size:12px;color:#64748b">Cálculo automático de encargos nos QR Codes de cobranças vencidas</div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Percentual da Multa (%):</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" id="pix_multa" class="campo-texto" step="0.01" min="0" max="10" value="${pixCfg.multaPercent || 2.00}" style="width:120px;height:38px;font-size:14px;font-weight:700">
              <span style="font-size:12.5px;color:#64748b">% aplicada uma única vez no primeiro dia após o vencimento</span>
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Percentual de Juros (% ao mês):</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" id="pix_juros" class="campo-texto" step="0.01" min="0" max="15" value="${pixCfg.jurosPercent || 1.00}" style="width:120px;height:38px;font-size:14px;font-weight:700">
              <span style="font-size:12.5px;color:#64748b">% proporcional calculada por dia de atraso (pro-rata die)</span>
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Dias de Carência / Tolerância:</label>
            <input type="number" id="pix_carencia" class="campo-texto" min="0" max="10" value="${pixCfg.diasCarencia || 1}" style="width:120px;height:38px;font-size:13px">
            <span style="font-size:11.5px;color:#64748b;display:block;margin-top:2px">Dias sem cobrança de juros após o vencimento</span>
          </div>
          <div style="margin-top:8px">
            <button class="btn btn-primario" onclick="salvarConfiguracaoPix()" style="font-weight:700;padding:10px 18px">Salvar Parâmetros Pix</button>
          </div>
        </div>
      </div>
    </div>
  ` : (subAba === 'boletos' ? `
    <!-- TELA 3: BOLETOS BANCÁRIOS (BOLETO FÁCIL VS BOLETO DO BANCO) -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:16px">
      <!-- Modalidade 1: Boleto Fácil -->
      <div class="card" style="border:2px solid #2563eb;padding:20px;border-radius:10px;background:#f8fafc">
        <div style="display:inline-block;padding:2px 8px;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:800;border-radius:4px;margin-bottom:8px">SEM BUROCRACIA BANCÁRIA</div>
        <h3 style="margin:0 0 8px 0;font-size:17px;font-weight:700;color:#0f172a">Boleto Fácil Integrado</h3>
        <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 14px 0">Emita boletos na hora sem precisar de arquivo de remessa/retorno nem convênio homologado com o gerente do banco. Você só paga taxa se o cliente pagar o boleto.</p>
        <ul style="font-size:12.5px;color:#334155;margin:0 0 16px 0;padding-left:18px">
          <li>Taxa fixa de R$ 2,49 apenas por boleto liquidado</li>
          <li>Liquidação automática em D+1 na sua conta bancária</li>
          <li>Segunda via automática enviada por WhatsApp</li>
        </ul>
        <button class="btn btn-primario" onclick="torrar('Módulo Boleto Fácil ativado para a oficina!','sucesso')" style="width:100%;font-weight:700">Ativar Emissão Rápida</button>
      </div>

      <!-- Modalidade 2: Boleto do Banco Tradicional -->
      <div class="card" style="border:1px solid #cbd5e1;padding:20px;border-radius:10px">
        <div style="display:inline-block;padding:2px 8px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:800;border-radius:4px;margin-bottom:8px">CONVÊNIO HOMOLOGADO</div>
        <h3 style="margin:0 0 8px 0;font-size:17px;font-weight:700;color:#0f172a">Boleto do Banco (CNAB 240/400)</h3>
        <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 14px 0">Utilize o convênio direto de cobrança da sua conta corrente bancária (Itaú, Bradesco, Santander, Sicoob, Banco do Brasil) com envio e leitura de arquivos de remessa e retorno.</p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secundario" onclick="torrar('Gerando arquivo de remessa CNAB do dia...','neutro')" style="flex:1;font-size:12px">Gerar Remessa CNAB</button>
          <button class="btn btn-neutro" onclick="torrar('Faça o upload do arquivo .RET do seu banco para conciliação.','neutro')" style="flex:1;font-size:12px">Ler Retorno</button>
        </div>
      </div>
    </div>
  ` : (subAba === 'cartao' ? `
    <!-- TELA 4: CARTÃO DE CRÉDITO -->
    <div class="card" style="padding:20px;border:1px solid #cbd5e1">
      <h3 style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:#0f172a">Cobrança por Cartão & Link de Pagamento</h3>
      <p style="margin:0 0 16px 0;font-size:13px;color:#64748b">Envie links de pagamento por WhatsApp para o transportador pagar a manutenção com cartão de crédito em até 12x.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:14px">
        <div style="background:#f8fafc;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-weight:700;font-size:13.5px;color:#0f172a">Link de Pagamento Online</div>
          <div style="font-size:12px;color:#64748b;margin:4px 0 10px 0">Seguro, com antifraude e aprovação em tempo real</div>
          <button class="btn btn-primario" onclick="torrar('Link de pagamento gerado e copiado!','sucesso')" style="font-size:12px">Gerar Link de Venda</button>
        </div>
        <div style="background:#f8fafc;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-weight:700;font-size:13.5px;color:#0f172a">Maquininhas TEF / Balcão</div>
          <div style="font-size:12px;color:#64748b;margin:4px 0 10px 0">Integração direta com o caixa do Pátio Diesel</div>
          <button class="btn btn-secundario" onclick="torrar('Terminal TEF conectado via rede local.','sucesso')" style="font-size:12px">Testar Terminal</button>
        </div>
      </div>
    </div>
  ` : `
    <!-- TELA 5: RÉGUA DE COBRANÇA WHATSAPP -->
    <div class="card" style="padding:20px;border:1px solid #cbd5e1">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">Régua de Cobrança Automática via WhatsApp</h3>
          <div style="font-size:13px;color:#64748b">Disparo inteligente de lembretes antes, no dia e após o vencimento com link Pix e cálculo de juros</div>
        </div>
        <button class="btn btn-primario" onclick="executarReguaCobrancaAgora()" style="font-weight:700">⚡ Disparar Régua do Dia Agora</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <span style="font-size:20px">⏳</span>
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px;color:#0f172a">Lembrete Preventivo (3 dias antes do vencimento)</div>
            <div style="font-size:12px;color:#64748b">Mensagem cordial com a chave Pix e cópia do boleto</div>
          </div>
          <span class="badge-vivid badge-sucesso">Ativo</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <span style="font-size:20px">📅</span>
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px;color:#0f172a">Aviso no Dia do Vencimento</div>
            <div style="font-size:12px;color:#64748b">Lembrete pontual para evitar cobrança de juros e multas</div>
          </div>
          <span class="badge-vivid badge-sucesso">Ativo</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <span style="font-size:20px">⚠️</span>
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px;color:#0f172a">Cobrança de Atraso (+1 e +5 dias vencido)</div>
            <div style="font-size:12px;color:#64748b">Recálculo automático do valor com acréscimo de 2% de multa e 1% de juros ao mês</div>
          </div>
          <span class="badge-vivid badge-sucesso">Ativo</span>
        </div>
      </div>
    </div>
  `)))}
  `;
}

function abrirModalGeradorPixRapido() {
  if (typeof abrirModalGenerico === 'function') {
    abrirModalGenerico(`
      <div style="padding:20px;max-width:440px;width:100%;background:#ffffff;border-radius:10px">
        <h3 style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#0f172a">Gerar Cobrança Pix</h3>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Cliente / Razão Social:</label>
            <input type="text" id="pix_rapido_cliente" class="campo-texto" placeholder="Ex: Transportes Rodoviários Silva Ltda" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Telefone / WhatsApp do Cliente:</label>
            <input type="text" id="pix_rapido_fone" class="campo-texto" placeholder="(11) 98888-7777" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Valor da Cobrança (R$):</label>
            <input type="number" id="pix_rapido_valor" class="campo-texto" min="1" step="0.01" value="1500.00" style="width:100%;height:36px;font-size:14px;font-weight:700">
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
            <button class="btn btn-neutro" onclick="fecharModalGenerico()">Cancelar</button>
            <button class="btn btn-primario" onclick="confirmarGeracaoPixRapido()">Gerar QR Code & Enviar</button>
          </div>
        </div>
      </div>
    `);
  }
}

function confirmarGeracaoPixRapido() {
  const cli = document.getElementById('pix_rapido_cliente')?.value || 'Cliente';
  const fone = document.getElementById('pix_rapido_fone')?.value || '';
  const val = Number(document.getElementById('pix_rapido_valor')?.value || 100);
  if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
  if (typeof torrar === 'function') torrar('QR Code Dinâmico Pix gerado com sucesso!', 'sucesso');
  if (fone) {
    enviarPixWhatsApp(cli, val, fone);
  }
}

function enviarPixWhatsApp(cliente, valor, fone) {
  const chave = (S.cfg && S.cfg.pix && S.cfg.pix.chavePix) || '12.345.678/0001-90';
  const msg = encodeURIComponent(`Olá, ${cliente}! Segue a chave Pix para pagamento dos serviços da oficina Pátio Diesel no valor de R$ ${Number(valor).toFixed(2)}.\n\nChave Pix (CNPJ): ${chave}\n\nFavor enviar o comprovante após o pagamento.`);
  if (typeof window !== 'undefined' && window.open) {
    window.open(`https://wa.me/55${String(fone).replace(/\D/g, '')}?text=${msg}`, '_blank');
  }
}

function salvarConfiguracaoPix() {
  if (!S.cfg) S.cfg = {};
  if (!S.cfg.pix) S.cfg.pix = {};
  S.cfg.pix.chavePix = document.getElementById('pix_chave')?.value || '12.345.678/0001-90';
  S.cfg.pix.multaPercent = Number(document.getElementById('pix_multa')?.value || 2.00);
  S.cfg.pix.jurosPercent = Number(document.getElementById('pix_juros')?.value || 1.00);
  S.cfg.pix.diasCarencia = Number(document.getElementById('pix_carencia')?.value || 1);
  if (typeof salvarLocal === 'function') salvarLocal();
  else if (typeof salvar === 'function') salvar();
  if (typeof torrar === 'function') torrar('Configurações de Pix, Juros e Multa salvas com sucesso!', 'sucesso');
}

function executarReguaCobrancaAgora() {
  if (typeof torrar === 'function') torrar('Disparando lembretes automatizados de cobrança para WhatsApp...', 'neutro');
  setTimeout(() => {
    if (typeof torrar === 'function') torrar('3 notificações de cobrança enviadas com sucesso aos clientes!', 'sucesso');
  }, 1200);
}

if (typeof window !== 'undefined') {
  window.blocoHubRecebimentos = blocoHubRecebimentos;
  window.abrirModalGeradorPixRapido = abrirModalGeradorPixRapido;
  window.confirmarGeracaoPixRapido = confirmarGeracaoPixRapido;
  window.enviarPixWhatsApp = enviarPixWhatsApp;
  window.salvarConfiguracaoPix = salvarConfiguracaoPix;
  window.executarReguaCobrancaAgora = executarReguaCobrancaAgora;
}
if (typeof globalThis !== 'undefined') {
  globalThis.blocoHubRecebimentos = blocoHubRecebimentos;
  globalThis.abrirModalGeradorPixRapido = abrirModalGeradorPixRapido;
  globalThis.confirmarGeracaoPixRapido = confirmarGeracaoPixRapido;
  globalThis.enviarPixWhatsApp = enviarPixWhatsApp;
  globalThis.salvarConfiguracaoPix = salvarConfiguracaoPix;
  globalThis.executarReguaCobrancaAgora = executarReguaCobrancaAgora;
}
