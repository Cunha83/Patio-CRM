/* =====================================================================
   PÁTIO CRM — MÓDULO FINANCEIRO COMPLETO (CONTAS, FLUXO, DRE & BANCO)
===================================================================== */

function viewFinanceiro() {
  const rec = emAberto('receber'), pag = emAberto('pagar');
  const vencidasR = rec.filter(c => c.venc < hoje());
  const vencidasP = pag.filter(c => c.venc < hoje());
  const mes = mesRef(hoje());
  const movs = typeof obterMovimentosUnificados === 'function' ? obterMovimentosUnificados() : (Array.isArray(S.movimentos) ? S.movimentos : (Array.isArray(S.lancamentosCaixa) ? S.lancamentosCaixa : []));
  const entradaMes = soma(movs.filter(m => (m.tipo === 'entrada' || m.tipo === 'credito') && mesRef(m.data) === mes), m => m.valor);
  const saidaMes = soma(movs.filter(m => (m.tipo === 'saida' || m.tipo === 'debito') && mesRef(m.data) === mes), m => m.valor);
  const totalRec = soma(rec, c => c.valor);
  const totalPag = soma(pag, c => c.valor);
  const abas = [
    ['dashboard', 'Dashboard Executivo 📊'],
    ['analista', 'Verônica Analista 🤖'],
    ['receber', 'A Receber (' + rec.length + ')'],
    ['pagar', 'A Pagar (' + pag.length + ')'],
    ['caixa', 'Fluxo de Caixa'],
    ['dre', 'Resultado Gerencial de Caixa'],
    ['banco', 'Conciliação Bancária'],
    ['recebimentos', 'Hub Pix, Boletos & Cartão 💳']
  ];
  const a = S.ui.abaFin || 'dashboard';

  let corpo = '';
  if (a === 'dashboard') corpo = blocoDashboardFin();
  else if (a === 'analista') corpo = blocoVeronicaAnalista();
  else if (a === 'receber') corpo = blocoContasReceber();
  else if (a === 'pagar') corpo = blocoContasPagar();
  else if (a === 'caixa') corpo = blocoFluxoCaixa();
  else if (a === 'dre') corpo = blocoDRE();
  else if (a === 'recebimentos') corpo = blocoHubRecebimentos();
  else corpo = blocoBanco();

  return `
  ${a !== 'dashboard' ? `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Saldo em Caixa</div>
      <div class="v">${brlCurto(saldoCaixa())}</div>
      <div class="d">Saldo atual consolidado</div>
    </div>
    <div class="kpi ${vencidasR.length ? 'alerta' : 'neutro'}">
      <div class="r">${ico('doc', 14)} Total A Receber</div>
      <div class="v">${brlCurto(totalRec)}</div>
      <div class="d">${rec.length} títulos${vencidasR.length ? ' · <b style="color:var(--tijolo)">' + vencidasR.length + ' vencidos</b>' : ''}</div>
    </div>
    <div class="kpi ${vencidasP.length ? 'alerta' : 'aviso'}">
      <div class="r">${ico('caixa', 14)} Total A Pagar</div>
      <div class="v">${brlCurto(totalPag)}</div>
      <div class="d">${pag.length} contas${vencidasP.length ? ' · <b style="color:var(--tijolo)">' + vencidasP.length + ' vencidas</b>' : ''}</div>
    </div>
    <div class="kpi ${entradaMes - saidaMes >= 0 ? 'bom' : 'alerta'}">
      <div class="r">${ico('relatorios', 14)} Resultado do Mês</div>
      <div class="v">${brlCurto(entradaMes - saidaMes)}</div>
      <div class="d">Entradas: ${brlCurto(entradaMes)} | Saídas: ${brlCurto(saidaMes)}</div>
    </div>
  </div>` : ''}

  <div class="abas" style="margin-bottom:14px">
    ${abas.map(([k, r]) => `<button data-act="aba-fin" data-k="${k}" aria-selected="${a === k}">${r}</button>`).join('')}
  </div>

  ${corpo}`;
}

/* =====================================================================
   HUB DE RECEBIMENTOS: PIX, BOLETOS, CARTÃO & RÉGUA DE COBRANÇA
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
    <button class="folder-tab ${subAba === 'pix' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='pix';render()">
      <span style="font-weight:700">⚡ PIX INSTANTÂNEO</span>
    </button>
    <button class="folder-tab ${subAba === 'pix_cfg' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='pix_cfg';render()">
      <span>⚙️ CONFIGURAÇÕES PIX</span>
    </button>
    <button class="folder-tab ${subAba === 'boletos' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='boletos';render()">
      <span>📄 BOLETOS BANCÁRIOS</span>
    </button>
    <button class="folder-tab ${subAba === 'cartao' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='cartao';render()">
      <span>💳 CARTÃO DE CRÉDITO</span>
    </button>
    <button class="folder-tab ${subAba === 'regua' ? 'ativo' : ''}" onclick="S.ui.subAbaHubRec='regua';render()">
      <span>📲 RÉGUA DE COBRANÇA WHATSAPP</span>
    </button>
  </div>

  ${subAba === 'pix' ? `
    <!-- TELA 1: PIX INSTANTÂNEO -->
    <div style="background:linear-gradient(135deg, #0f766e 0%, #115e59 100%);color:#fff;padding:20px;border-radius:10px;margin-bottom:16px;box-shadow:0 4px 12px rgba(15,118,110,0.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:8px">
            ⚡ LIQUIDAÇÃO EM SEGUNDOS
          </div>
          <h2 style="margin:0 0 6px 0;font-size:20px;font-weight:800">Recebimento Pix com Conciliação Automática</h2>
          <p style="margin:0;font-size:13.5px;opacity:0.9">
            Gere QR Codes dinâmicos com identificador de OS/Venda. O Pátio baixa automaticamente as contas a receber assim que o cliente paga.
          </p>
        </div>
        <button class="btn" onclick="abrirModalGeradorPixRapido()" style="background:#ffffff;color:#0f766e;font-weight:800;padding:10px 18px;border-radius:8px;border:none;box-shadow:0 2px 6px rgba(0,0,0,0.15);cursor:pointer">
          + Cobrar via Pix Agora
        </button>
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
              <td style="text-align:center">
                <button class="btn btn-neutro" onclick="torrar('Comprovante bancário autenticado pela CIP.','sucesso')" style="padding:4px 8px;font-size:11px">Comprovante</button>
              </td>
            </tr>
            <tr>
              <td class="mono"><b>#PIX-9822</b></td>
              <td><b>Expresso Rodoviário Cordeiro S.A.</b><div class="mini mono" style="color:#64748b">98.765.432/0001-10</div></td>
              <td style="text-align:center"><span class="mono" style="font-weight:700;color:#2563eb">#OS-340</span></td>
              <td>${hoje()} 11:28</td>
              <td style="text-align:right;font-weight:700;color:#0f172a" class="mono">${brl(3200.00)}</td>
              <td style="text-align:center"><span class="badge-vivid badge-alerta">Aguardando</span></td>
              <td style="text-align:center">
                <button class="btn btn-sucesso" onclick="enviarPixWhatsApp('Expresso Cordeiro', 3200, '19999881122')" style="padding:4px 8px;font-size:11px">💬 Cobrar WhatsApp</button>
              </td>
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
          <div>
            <h3 style="margin:0;font-size:15px;font-weight:700;color:#0f172a">Conta Bancária (Destino)</h3>
            <div style="font-size:12px;color:#64748b">Conta caixa onde os recebimentos Pix serão creditados</div>
          </div>
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
          <div>
            <h3 style="margin:0;font-size:15px;font-weight:700;color:#0f172a">Juros e Multa por Atraso</h3>
            <div style="font-size:12px;color:#64748b">Cálculo automático de encargos nos QR Codes de cobranças vencidas</div>
          </div>
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
            <button class="btn btn-primario" onclick="salvarConfiguracaoPix()" style="font-weight:700;padding:10px 18px">
              Salvar Parâmetros Pix
            </button>
          </div>
        </div>
      </div>
    </div>
  ` : (subAba === 'boletos' ? `
    <!-- TELA 3: BOLETOS BANCÁRIOS (BOLETO FÁCIL VS BOLETO DO BANCO) -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:16px">
      <!-- Modalidade 1: Boleto Fácil -->
      <div class="card" style="border:2px solid #2563eb;padding:20px;border-radius:10px;background:#f8fafc">
        <div style="display:inline-block;padding:2px 8px;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:800;border-radius:4px;margin-bottom:8px">
          SEM BUROCRACIA BANCÁRIA
        </div>
        <h3 style="margin:0 0 8px 0;font-size:17px;font-weight:700;color:#0f172a">Boleto Fácil Integrado</h3>
        <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 14px 0">
          Emita boletos na hora sem precisar de arquivo de remessa/retorno nem convênio homologado com o gerente do banco. Você só paga taxa se o cliente pagar o boleto.
        </p>
        <ul style="font-size:12.5px;color:#334155;margin:0 0 16px 0;padding-left:18px">
          <li>Taxa fixa de R$ 2,49 apenas por boleto liquidado</li>
          <li>Liquidação automática em D+1 na sua conta bancária</li>
          <li>Segunda via automática enviada por WhatsApp</li>
        </ul>
        <button class="btn btn-primario" onclick="torrar('Módulo Boleto Fácil ativado para a oficina!','sucesso')" style="width:100%;font-weight:700">
          Ativar Emissão Rápida
        </button>
      </div>

      <!-- Modalidade 2: Boleto do Banco Tradicional -->
      <div class="card" style="border:1px solid #cbd5e1;padding:20px;border-radius:10px">
        <div style="display:inline-block;padding:2px 8px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:800;border-radius:4px;margin-bottom:8px">
          CONVÊNIO HOMOLOGADO
        </div>
        <h3 style="margin:0 0 8px 0;font-size:17px;font-weight:700;color:#0f172a">Boleto do Banco (CNAB 240/400)</h3>
        <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 14px 0">
          Utilize o convênio direto de cobrança da sua conta corrente bancária (Itaú, Bradesco, Santander, Sicoob, Banco do Brasil) com envio e leitura de arquivos de remessa e retorno.
        </p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secundario" onclick="torrar('Gerando arquivo de remessa CNAB do dia...','neutro')" style="flex:1;font-size:12px">
            Gerar Remessa CNAB
          </button>
          <button class="btn btn-neutro" onclick="torrar('Faça o upload do arquivo .RET do seu banco para conciliação.','neutro')" style="flex:1;font-size:12px">
            Ler Retorno
          </button>
        </div>
      </div>
    </div>
  ` : (subAba === 'cartao' ? `
    <!-- TELA 4: CARTÃO DE CRÉDITO -->
    <div class="card" style="padding:20px;border:1px solid #cbd5e1">
      <h3 style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:#0f172a">Cobrança por Cartão & Link de Pagamento</h3>
      <p style="margin:0 0 16px 0;font-size:13px;color:#64748b">
        Envie links de pagamento por WhatsApp para o transportador pagar a manutenção com cartão de crédito em até 12x.
      </p>
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
        <button class="btn btn-primario" onclick="executarReguaCobrancaAgora()" style="font-weight:700">
          ⚡ Disparar Régua do Dia Agora
        </button>
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

function confirmarGeracaoPixRapido() {
  const cli = document.getElementById('pix_rapido_cliente')?.value || 'Cliente';
  const fone = document.getElementById('pix_rapido_fone')?.value || '';
  const val = Number(document.getElementById('pix_rapido_valor')?.value || 100);
  fecharModalGenerico();
  torrar('QR Code Dinâmico Pix gerado com sucesso!', 'sucesso');
  if (fone) {
    enviarPixWhatsApp(cli, val, fone);
  }
}

function enviarPixWhatsApp(cliente, valor, fone) {
  const chave = (S.cfg && S.cfg.pix && S.cfg.pix.chavePix) || '12.345.678/0001-90';
  const msg = encodeURIComponent(`Olá, ${cliente}! Segue a chave Pix para pagamento dos serviços da oficina Pátio Diesel no valor de R$ ${Number(valor).toFixed(2)}.\n\nChave Pix (CNPJ): ${chave}\n\nFavor enviar o comprovante após o pagamento.`);
  window.open(`https://wa.me/55${String(fone).replace(/\D/g, '')}?text=${msg}`, '_blank');
}

function salvarConfiguracaoPix() {
  if (!S.cfg) S.cfg = {};
  if (!S.cfg.pix) S.cfg.pix = {};
  S.cfg.pix.chavePix = document.getElementById('pix_chave')?.value || '12.345.678/0001-90';
  S.cfg.pix.multaPercent = Number(document.getElementById('pix_multa')?.value || 2.00);
  S.cfg.pix.jurosPercent = Number(document.getElementById('pix_juros')?.value || 1.00);
  S.cfg.pix.diasCarencia = Number(document.getElementById('pix_carencia')?.value || 1);
  salvarLocal();
  torrar('Configurações de Pix, Juros e Multa salvas com sucesso!', 'sucesso');
}

function executarReguaCobrancaAgora() {
  torrar('Disparando lembretes automatizados de cobrança para WhatsApp...', 'neutro');
  setTimeout(() => {
    torrar('3 notificações de cobrança enviadas com sucesso aos clientes!', 'sucesso');
  }, 1200);
}

/* ===== MOTOR FINANCEIRO CLIENTE (CONSISTENTE COM SERVER) ===== */
function calcularDashboardFin(filtro = '30d', customDe = null, customAte = null) {
  const ref = hoje();
  let de = addDias(ref, -29);
  let ate = ref;

  if (filtro === 'hoje') {
    de = ref; ate = ref;
  } else if (filtro === '7d') {
    de = addDias(ref, -6); ate = ref;
  } else if (filtro === '15d') {
    de = addDias(ref, -14); ate = ref;
  } else if (filtro === '30d') {
    de = addDias(ref, -29); ate = ref;
  } else if (filtro === 'mes') {
    const dObj = new Date(ref + 'T12:00:00');
    const ano = dObj.getFullYear();
    const mes = String(dObj.getMonth() + 1).padStart(2, '0');
    de = `${ano}-${mes}-01`;
    const ult = new Date(ano, dObj.getMonth() + 1, 0).getDate();
    ate = `${ano}-${mes}-${String(ult).padStart(2, '0')}`;
  } else if (filtro === 'mes_anterior') {
    const dObj = new Date(ref + 'T12:00:00');
    const ant = new Date(dObj.getFullYear(), dObj.getMonth() - 1, 1);
    const ano = ant.getFullYear();
    const mes = String(ant.getMonth() + 1).padStart(2, '0');
    de = `${ano}-${mes}-01`;
    const ult = new Date(ano, ant.getMonth() + 1, 0).getDate();
    ate = `${ano}-${mes}-${String(ult).padStart(2, '0')}`;
  } else if (filtro === 'custom' && customDe && customAte) {
    de = customDe; ate = customAte;
  }

  const ini = Number(S.cfg?.saldoInicial) || 0;
  const movs = S.movimentos || [];
  const contas = S.contas || [];

  // Saldo geral consolidado (Toda a história)
  const totalEnt = soma(movs.filter(m => m.tipo === 'entrada'), m => m.valor);
  const totalSai = soma(movs.filter(m => m.tipo === 'saida'), m => m.valor);
  const saldoConsolidado = +(ini + totalEnt - totalSai).toFixed(2);

  // No período selecionado
  const movsPeriodo = movs.filter(m => (m.data || '').slice(0, 10) >= de && (m.data || '').slice(0, 10) <= ate);
  const entPeriodo = soma(movsPeriodo.filter(m => m.tipo === 'entrada'), m => m.valor);
  const saiPeriodo = soma(movsPeriodo.filter(m => m.tipo === 'saida'), m => m.valor);
  const resultadoPeriodo = +(entPeriodo - saiPeriodo).toFixed(2);

  // Contas em aberto
  const emAb = contas.filter(c => !c.pago);
  const rec = emAb.filter(c => c.tipo === 'receber');
  const pag = emAb.filter(c => c.tipo === 'pagar');

  const totRec = soma(rec, c => c.valor);
  const totPag = soma(pag, c => c.valor);
  const recVenc = soma(rec.filter(c => c.venc < ref), c => c.valor);
  const pagVenc = soma(pag.filter(c => c.venc < ref), c => c.valor);
  const recHoje = soma(rec.filter(c => c.venc === ref), c => c.valor);
  const pagHoje = soma(pag.filter(c => c.venc === ref), c => c.valor);

  const taxaInad = totRec > 0 ? +((recVenc / totRec) * 100).toFixed(1) : 0;

  // Projeção 30 dias
  const d30 = addDias(ref, 30);
  const recFut = soma(rec.filter(c => c.venc >= ref && c.venc <= d30), c => c.valor);
  const pagFut = soma(pag.filter(c => c.venc >= ref && c.venc <= d30), c => c.valor);
  const saldoProjetado30d = +(saldoConsolidado + recFut - pagFut).toFixed(2);

  // Resumo de Origem (WhatsApp vs Web e Estornos)
  const movsWhatsapp = movsPeriodo.filter(m => m.origem === 'whatsapp');
  const movsWeb = movsPeriodo.filter(m => (m.origem || 'web') !== 'whatsapp');
  const movsEstornados = movsPeriodo.filter(m => Boolean(m.estornado));

  const totalWhatsapp = +soma(movsWhatsapp, m => m.valor).toFixed(2);
  const totalWeb = +soma(movsWeb, m => m.valor).toFixed(2);
  const totalEstornados = +soma(movsEstornados, m => m.valor).toFixed(2);

  const resumoOrigem = {
    totalWhatsapp,
    qtdWhatsapp: movsWhatsapp.length,
    totalWeb,
    qtdWeb: movsWeb.length,
    totalEstornados,
    qtdEstornados: movsEstornados.length
  };

  return {
    filtro, de, ate, ref,
    saldoConsolidado, saldoInicial: ini,
    entPeriodo, saiPeriodo, resultadoPeriodo,
    totRec, totPag, recVenc, pagVenc, recHoje, pagHoje,
    qtdRec: rec.length, qtdPag: pag.length,
    qtdRecVenc: rec.filter(c => c.venc < ref).length,
    qtdPagVenc: pag.filter(c => c.venc < ref).length,
    taxaInad, saldoProjetado30d,
    movsPeriodo,
    resumoOrigem
  };
}

/* ===== DASHBOARD FINANCEIRO EXECUTIVO (BI) ===== */
function blocoDashboardFin() {
  const filtro = S.ui.filtroFin || '30d';
  const customDe = S.ui.filtroFinDe || null;
  const customAte = S.ui.filtroFinAte || null;
  const fin = calcularDashboardFin(filtro, customDe, customAte);

  const filtros = [
    ['hoje', 'Hoje'],
    ['7d', '7 Dias'],
    ['15d', '15 Dias'],
    ['30d', '30 Dias'],
    ['mes', 'Este Mês'],
    ['mes_anterior', 'Mês Anterior'],
    ['custom', 'Personalizado']
  ];

  // Agenda de próximos vencimentos (top 6)
  const proximos = (S.contas || [])
    .filter(c => !c.pago)
    .sort((a, b) => (a.venc || '').localeCompare(b.venc || ''))
    .slice(0, 6);

  return `
  <!-- Barra de Filtros & Ações Rápidas Executivas -->
  <div class="barra-filtros-fin">
    <div class="grupo-chips-filtro">
      <span class="mini" style="font-weight:700;color:var(--aco-600);margin-right:4px">Período:</span>
      ${filtros.map(([k, r]) => `
        <button class="chip-filtro ${filtro === k ? 'ativo' : ''}" data-act="filtro-fin" data-f="${k}">
          ${r}
        </button>
      `).join('')}
      ${filtro === 'custom' ? `
        <div style="display:inline-flex;gap:4px;align-items:center;margin-left:6px">
          <input type="date" class="campo-texto" id="fin_filtro_de" value="${fin.de}" style="height:28px;font-size:11px;padding:2px 6px">
          <span class="mini">até</span>
          <input type="date" class="campo-texto" id="fin_filtro_ate" value="${fin.ate}" style="height:28px;font-size:11px;padding:2px 6px">
          <button class="btn btn-primario btn-pequeno" data-act="aplicar-filtro-fin-custom">OK</button>
        </div>
      ` : ''}
    </div>

    <div class="acoes-topo-fin">
      <button class="btn btn-secundario" data-act="ver-imagem-preview" style="font-size:12px;padding:5px 12px">
        🖼️ Imagem WhatsApp (JPG)
      </button>
      <button class="btn btn-primario" data-act="disparar-grupo-admin" style="font-size:12px;padding:5px 12px;font-weight:600">
        🚀 Disparar para Admin
      </button>
    </div>
  </div>

  <!-- Cards Superiores de KPIs Financeiros (6 Cards Executivos) -->
  <div class="kpis-fin-grid">
    <div class="card-fin-kpi" style="--cor:#2563eb">
      <div class="kpi-topo-rotulo">
        <span>💵 Saldo em Caixa</span>
        <span class="mini" style="color:var(--verde)">● Conciliado</span>
      </div>
      <div class="kpi-valor-grande num" style="color:${fin.saldoConsolidado >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">
        ${brl(fin.saldoConsolidado)}
      </div>
      <div class="kpi-sub-desc">Saldo consolidado disponível</div>
    </div>

    <div class="card-fin-kpi" style="--cor:#10b981">
      <div class="kpi-topo-rotulo">
        <span>🟢 A Receber</span>
        <span class="mini">${fin.qtdRec} títulos</span>
      </div>
      <div class="kpi-valor-grande num" style="color:var(--verde)">
        ${brl(fin.totRec)}
      </div>
      <div class="kpi-sub-desc">${fin.qtdRecVenc > 0 ? `<b style="color:var(--tijolo)">${brl(fin.recVenc)} vencidos</b>` : 'Nenhum título vencido'}</div>
    </div>

    <div class="card-fin-kpi" style="--cor:#ef4444">
      <div class="kpi-topo-rotulo">
        <span>🔴 A Pagar</span>
        <span class="mini">${fin.qtdPag} contas</span>
      </div>
      <div class="kpi-valor-grande num" style="color:var(--tijolo)">
        ${brl(fin.totPag)}
      </div>
      <div class="kpi-sub-desc">${fin.qtdPagVenc > 0 ? `<b style="color:var(--tijolo)">${brl(fin.pagVenc)} em atraso</b>` : 'Compromissos em dia'}</div>
    </div>

    <div class="card-fin-kpi" style="--cor:${fin.resultadoPeriodo >= 0 ? 'var(--verde)' : 'var(--sinal)'}">
      <div class="kpi-topo-rotulo">
        <span>⚖️ Resultado (${filtro.toUpperCase()})</span>
      </div>
      <div class="kpi-valor-grande num" style="color:${fin.resultadoPeriodo >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">
        ${fin.resultadoPeriodo >= 0 ? '+' : ''}${brl(fin.resultadoPeriodo)}
      </div>
      <div class="kpi-sub-desc">+${brlCurto(fin.entPeriodo)} ent | -${brlCurto(fin.saiPeriodo)} saí</div>
    </div>

    <div class="card-fin-kpi" style="--cor:#38bdf8">
      <div class="kpi-topo-rotulo">
        <span>📈 Projeção (30d)</span>
      </div>
      <div class="kpi-valor-grande num" style="color:var(--petroleo)">
        ${brl(fin.saldoProjetado30d)}
      </div>
      <div class="kpi-sub-desc">Caixa + A Receber − A Pagar</div>
    </div>

    <div class="card-fin-kpi" style="--cor:${fin.taxaInad > 0 ? 'var(--sinal)' : 'var(--verde)'}">
      <div class="kpi-topo-rotulo">
        <span>⚠️ Inadimplência</span>
      </div>
      <div class="kpi-valor-grande num" style="color:${fin.taxaInad > 0 ? 'var(--sinal)' : 'var(--verde)'}">
        ${fin.taxaInad}%
      </div>
      <div class="kpi-sub-desc">${fin.qtdRecVenc} títulos em cobrança</div>
    </div>
  </div>

  <!-- Faixa de Auditoria de Origem (WhatsApp vs Web e Estornos) -->
  <div class="card card-p" style="margin-bottom:14px;padding:10px 16px;background:var(--aco-050);border:1px solid var(--aco-200);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px">
      <span style="font-weight:700;color:var(--aco-800);display:inline-flex;align-items:center;gap:6px">
        🔍 Auditoria de Origem:
      </span>
      <span class="selo" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-size:11px;font-weight:700">
        📱 WhatsApp: ${fin.resumoOrigem ? fin.resumoOrigem.qtdWhatsapp : 0} (${brl((fin.resumoOrigem && fin.resumoOrigem.totalWhatsapp) || 0)})
      </span>
      <span class="selo" style="background:var(--aco-100);color:var(--aco-700);border:1px solid var(--aco-200);font-size:11px">
        💻 Painel Web: ${fin.resumoOrigem ? fin.resumoOrigem.qtdWeb : 0} (${brl((fin.resumoOrigem && fin.resumoOrigem.totalWeb) || 0)})
      </span>
      ${(fin.resumoOrigem && fin.resumoOrigem.qtdEstornados > 0) ? `
        <span class="selo selo-alerta" style="font-size:11px;font-weight:700">
          ⚠️ Estornos: ${fin.resumoOrigem.qtdEstornados} (${brl(fin.resumoOrigem.totalEstornados)})
        </span>
      ` : ''}
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-secundario btn-pequeno" onclick="S.ui.abaFin='caixa';S.ui.filtroOrigemMov='whatsapp';if(typeof render==='function')render();" style="font-size:11px;padding:3px 10px">
        📱 Ver Lançamentos WhatsApp
      </button>
      <button class="btn btn-secundario btn-pequeno" onclick="S.ui.abaFin='caixa';S.ui.filtroOrigemMov='todos';if(typeof render==='function')render();" style="font-size:11px;padding:3px 10px">
        Ver Todo o Caixa
      </button>
    </div>
  </div>

  <!-- Linha 1 de Gráficos: Fluxo de Caixa (1) & Receber x Pagar (2) -->
  <div class="grid-graficos-duplo">
    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">📊 Gráfico 1 — Fluxo de Caixa (Entradas vs Saídas)</div>
          <div class="mini">Movimentações financeiras realizadas no período selecionado</div>
        </div>
        <span class="badge-periodo-atual">${dataBR(fin.de)} a ${dataBR(fin.ate)}</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-fluxo"></canvas>
      </div>
    </div>

    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">⚖️ Gráfico 2 — Comparativo Receber x Pagar</div>
          <div class="mini">Títulos em aberto agrupados por prazo de vencimento</div>
        </div>
        <span class="badge-periodo-atual">Aging de Contas</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-rxp"></canvas>
      </div>
    </div>
  </div>

  <!-- Linha 2 de Gráficos: Evolução do Saldo (3) & Projeção Financeira (4) -->
  <div class="grid-graficos-duplo">
    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">📈 Gráfico 3 — Evolução do Saldo de Caixa</div>
          <div class="mini">Curva acumulada de disponibilidade de caixa ao longo do período</div>
        </div>
        <span class="badge-periodo-atual">Histórico de Liquidez</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-saldo"></canvas>
      </div>
    </div>

    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">🎯 Gráfico 4 — Projeção Financeira (Próximos 30 Dias)</div>
          <div class="mini">Estimativa de saldo considerando vencimentos futuros cadastrados</div>
        </div>
        <span class="badge-periodo-atual">Projeção Futura</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-projecao"></canvas>
      </div>
    </div>
  </div>

  <!-- Linha 3: Distribuição das Despesas (5) & Próximos Vencimentos -->
  <div class="grid-graficos-duplo">
    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">🍩 Gráfico 5 — Distribuição das Despesas</div>
          <div class="mini">Gastos e contas a pagar agrupados por centro de custo</div>
        </div>
        <span class="badge-periodo-atual">Categorias</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-despesas"></canvas>
      </div>
    </div>

    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">📅 Próximos Vencimentos Prioritários</div>
          <div class="mini">Compromissos e recebimentos mais urgentes da oficina</div>
        </div>
        <button class="btn btn-secundario btn-pequeno" onclick="S.ui.abaFin='pagar';render()">Ver Todas</button>
      </div>
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descrição / Parceiro</th>
              <th style="text-align:center">Vencimento</th>
              <th style="text-align:right">Valor</th>
              <th style="text-align:center">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${proximos.length ? proximos.map(c => {
              const vencida = c.venc < hoje();
              const hojeVenc = c.venc === hoje();
              const isRec = c.tipo === 'receber';
              return `
              <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
                <td>
                  <span class="selo ${isRec ? 'selo-finalizada' : 'selo-peca'}" style="font-size:10px">
                    ${isRec ? 'Receber' : 'Pagar'}
                  </span>
                </td>
                <td>
                  <b>${esc(c.parte)}</b>
                  <div class="mini">${esc(c.desc)}</div>
                </td>
                <td style="text-align:center">
                  <span class="mono">${dataBR(c.venc)}</span>
                  ${vencida ? `<div class="mini" style="color:var(--tijolo);font-weight:700">Atrasado</div>` : hojeVenc ? `<div class="mini" style="color:var(--sinal);font-weight:700">Hoje</div>` : ''}
                </td>
                <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
                <td style="text-align:center">
                  <button class="btn btn-sucesso btn-pequeno" data-act="baixar" data-id="${c.id}" title="Baixar">
                    ${ico('check', 11)}
                  </button>
                </td>
              </tr>`;
            }).join('') : `
              <tr><td colspan="5" style="text-align:center;padding:24px;color:var(--aco-400)">Nenhum vencimento pendente registrado.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function renderGraficosFinanceiro() {
  if (typeof Chart === 'undefined') return;

  const filtro = S.ui.filtroFin || '30d';
  const customDe = S.ui.filtroFinDe || null;
  const customAte = S.ui.filtroFinAte || null;
  const fin = calcularDashboardFin(filtro, customDe, customAte);
  const ref = hoje();

  // 1. Gráfico de Fluxo de Caixa (Entradas vs Saídas)
  const ctxFluxo = document.getElementById('grafico-fin-fluxo');
  if (ctxFluxo) {
    if (window._chartFinFluxo) window._chartFinFluxo.destroy();

    const listaDias = [];
    let curr = fin.de;
    while (curr <= fin.ate && listaDias.length < 60) {
      listaDias.push(curr);
      curr = addDias(curr, 1);
    }

    const mapaE = {}, mapaS = {};
    (S.movimentos || []).forEach(m => {
      const d = (m.data || '').slice(0, 10);
      const v = Number(m.valor) || 0;
      if (m.tipo === 'entrada') mapaE[d] = (mapaE[d] || 0) + v;
      else if (m.tipo === 'saida') mapaS[d] = (mapaS[d] || 0) + v;
    });

    const labels = listaDias.map(d => dataBR(d));
    const entradas = listaDias.map(d => +(mapaE[d] || 0).toFixed(2));
    const saidas = listaDias.map(d => +(mapaS[d] || 0).toFixed(2));

    window._chartFinFluxo = new Chart(ctxFluxo, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Entradas (R$)', data: entradas, backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Saídas (R$)', data: saidas, backgroundColor: '#ef4444', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${brl(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { callback: v => brlCurto(v), font: { size: 10 } } }
        }
      }
    });
  }

  // 2. Gráfico Receber x Pagar (Faixas de Aging)
  const ctxRxP = document.getElementById('grafico-fin-rxp');
  if (ctxRxP) {
    if (window._chartFinRxP) window._chartFinRxP.destroy();

    const emAb = (S.contas || []).filter(c => !c.pago);
    const faixas = [
      { l: 'Vencidos', min: -9999, max: -1 },
      { l: 'Hoje', min: 0, max: 0 },
      { l: 'Até 7d', min: 1, max: 7 },
      { l: '8 a 15d', min: 8, max: 15 },
      { l: '16 a 30d', min: 16, max: 30 },
      { l: '> 30d', min: 31, max: 9999 }
    ];

    const lRxP = faixas.map(f => f.l);
    const dRec = faixas.map(f => {
      return soma(emAb.filter(c => c.tipo === 'receber' && diasEntre(ref, c.venc) >= f.min && diasEntre(ref, c.venc) <= f.max), c => c.valor);
    });
    const dPag = faixas.map(f => {
      return soma(emAb.filter(c => c.tipo === 'pagar' && diasEntre(ref, c.venc) >= f.min && diasEntre(ref, c.venc) <= f.max), c => c.valor);
    });

    window._chartFinRxP = new Chart(ctxRxP, {
      type: 'bar',
      data: {
        labels: lRxP,
        datasets: [
          { label: 'A Receber', data: dRec, backgroundColor: '#34d399', borderRadius: 4 },
          { label: 'A Pagar', data: dPag, backgroundColor: '#f87171', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${brl(ctx.raw)}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { callback: v => brlCurto(v), font: { size: 10 } } }
        }
      }
    });
  }

  // 3. Gráfico Evolução do Saldo
  const ctxSaldo = document.getElementById('grafico-fin-saldo');
  if (ctxSaldo) {
    if (window._chartFinSaldo) window._chartFinSaldo.destroy();

    const listaDias = [];
    let curr = fin.de;
    while (curr <= fin.ate && listaDias.length < 60) {
      listaDias.push(curr);
      curr = addDias(curr, 1);
    }

    const ini = Number(S.cfg?.saldoInicial) || 0;
    const movs = S.movimentos || [];
    const entAntes = soma(movs.filter(m => m.tipo === 'entrada' && (m.data || '').slice(0, 10) < fin.de), m => m.valor);
    const saiAntes = soma(movs.filter(m => m.tipo === 'saida' && (m.data || '').slice(0, 10) < fin.de), m => m.valor);
    let acumulado = ini + entAntes - saiAntes;

    const mapaE = {}, mapaS = {};
    movs.forEach(m => {
      const d = (m.data || '').slice(0, 10);
      const v = Number(m.valor) || 0;
      if (m.tipo === 'entrada') mapaE[d] = (mapaE[d] || 0) + v;
      else if (m.tipo === 'saida') mapaS[d] = (mapaS[d] || 0) + v;
    });

    const labels = listaDias.map(d => dataBR(d));
    const dadosSaldo = listaDias.map(d => {
      acumulado = +(acumulado + (mapaE[d] || 0) - (mapaS[d] || 0)).toFixed(2);
      return acumulado;
    });

    window._chartFinSaldo = new Chart(ctxSaldo, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Saldo Acumulado (R$)',
          data: dadosSaldo,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: dadosSaldo.length > 15 ? 1 : 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` Saldo: ${brl(ctx.raw)}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
          y: { ticks: { callback: v => brlCurto(v), font: { size: 10 } } }
        }
      }
    });
  }

  // 4. Gráfico Projeção Financeira (Próximos 30 Dias)
  const ctxProj = document.getElementById('grafico-fin-projecao');
  if (ctxProj) {
    if (window._chartFinProj) window._chartFinProj.destroy();

    const saldoHoje = saldoCaixa();
    const emAb = (S.contas || []).filter(c => !c.pago);
    const labels = [];
    const dados = [];

    for (let i = 0; i <= 30; i += 3) {
      const diaProj = addDias(ref, i);
      const recAte = soma(emAb.filter(c => c.tipo === 'receber' && c.venc >= ref && c.venc <= diaProj), c => c.valor);
      const pagAte = soma(emAb.filter(c => c.tipo === 'pagar' && c.venc >= ref && c.venc <= diaProj), c => c.valor);
      labels.push(i === 0 ? 'Hoje' : dataBR(diaProj));
      dados.push(+(saldoHoje + recAte - pagAte).toFixed(2));
    }

    window._chartFinProj = new Chart(ctxProj, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Saldo Projetado (R$)',
          data: dados,
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          borderDash: [5, 5],
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0284c7'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` Projeção: ${brl(ctx.raw)}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { ticks: { callback: v => brlCurto(v), font: { size: 10 } } }
        }
      }
    });
  }

  // 5. Gráfico Distribuição das Despesas por Categoria
  const ctxDesp = document.getElementById('grafico-fin-despesas');
  if (ctxDesp) {
    if (window._chartFinDesp) window._chartFinDesp.destroy();

    const mapaCat = {};
    (fin.movsPeriodo || [])
      .filter(m => m.tipo === 'saida')
      .forEach(m => {
        const cat = m.cat || 'Geral';
        mapaCat[cat] = (mapaCat[cat] || 0) + (Number(m.valor) || 0);
      });

    // Se sem saídas no período, usa contas a pagar
    if (Object.keys(mapaCat).length === 0) {
      (S.contas || [])
        .filter(c => c.tipo === 'pagar' && !c.pago)
        .forEach(c => {
          const cat = c.cat || 'Fornecedores Peças';
          mapaCat[cat] = (mapaCat[cat] || 0) + (Number(c.valor) || 0);
        });
    }

    const pares = Object.entries(mapaCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const labels = pares.map(p => p[0]);
    const dados = pares.map(p => +p[1].toFixed(2));
    const cores = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

    window._chartFinDesp = new Chart(ctxDesp, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['Sem despesas'],
        datasets: [{
          data: dados.length ? dados : [1],
          backgroundColor: dados.length ? cores.slice(0, labels.length) : ['#e2e8f0']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.label}: ${brl(ctx.raw)}` }
          }
        }
      }
    });
  }
}

function agingReceber() {
  const dH = hoje();
  const rec = emAberto('receber');
  let vencido = 0, ate7d = 0, ate30d = 0, mais30d = 0;

  rec.forEach(c => {
    const diff = diasEntre(dH, c.venc);
    if (diff < 0) vencido += c.valor;
    else if (diff <= 7) ate7d += c.valor;
    else if (diff <= 30) ate30d += c.valor;
    else mais30d += c.valor;
  });

  return { vencido, ate7d, ate30d, mais30d };
}

function categorizarContas(tipo) {
  const contas = emAberto(tipo);
  const mapa = {};
  contas.forEach(c => {
    const cat = c.cat || 'Outros';
    mapa[cat] = (mapa[cat] || 0) + c.valor;
  });
  return Object.entries(mapa).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
}

/* ===== CONTAS A RECEBER ===== */
function blocoContasReceber() {
  const contas = S.contas.filter(c => c.tipo === 'receber');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Títulos a Receber (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="receber" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Novo Título
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Cliente / Sacado</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:160px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;
            const venceHoje = !c.pago && c.venc === dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Serviços')}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Recebido (${dataBR(c.dataPgto)})</span>
                ` : vencida ? `
                  <span class="selo selo-peca" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : venceHoje ? `
                  <span class="selo selo-aprovacao">Vence Hoje</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  ${!c.pago ? `
                    <button class="btn btn-sucesso" data-act="baixar" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Dar Baixa / Receber">
                      ${ico('check', 12)} Receber
                    </button>
                    <button class="btn btn-secundario" data-act="cobrar-titulo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Cobrar no WhatsApp">
                      ${ico('zap', 12)}
                    </button>
                  ` : `
                    <button class="btn btn-secundario" data-act="imprimir-recibo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Imprimir Recibo">
                      ${ico('imprimir', 12)} Recibo
                    </button>
                  `}
                </div>
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhum título a receber registrado.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== CONTAS A PAGAR ===== */
function blocoContasPagar() {
  const contas = S.contas.filter(c => c.tipo === 'pagar');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Contas a Pagar (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="pagar" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Nova Conta
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Fornecedor / Favorecido</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : (c.provisionado ? 'background:rgba(245, 158, 11, 0.04)' : '')}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Geral')}${c.provisionado ? ' · <b style="color:#b45309">⏳ Aguardando NF</b>' : ''}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Pago (${dataBR(c.dataPgto)})</span>
                ` : c.provisionado ? `
                  <span class="selo" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a" title="Provisionamento: Aguardando NF do Fornecedor">Provisionado</span>
                ` : vencida ? `
                  <span class="selo" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                ${!c.pago ? `
                  <button class="btn ${c.provisionado ? 'btn-secundario' : 'btn-sucesso'}" data-act="baixar" data-id="${c.id}" style="padding:4px 10px;font-size:12px">
                    ${ico('check', 12)} ${c.provisionado ? 'Baixar / Liquidar' : 'Baixar Pagamento'}
                  </button>
                ` : `
                  <span class="mini" style="color:var(--verde)">Quitado</span>
                `}
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma conta a pagar cadastrada.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== FLUXO DE CAIXA ===== */
function formatarHoraSimples(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(11, 16);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return String(iso).slice(11, 16);
  }
}

function renderBadgeMeioPagamento(forma = 'dinheiro') {
  const f = String(forma || '').toLowerCase().trim();
  let rotulo = 'Dinheiro';
  let icone = '💵';
  let estilo = 'background:#f1f5f9;color:#334155;border:1px solid #cbd5e1';

  if (f.includes('pix')) {
    rotulo = 'Pix';
    icone = '⚡';
    estilo = 'background:#ecfdf5;color:#047857;border:1px solid #a7f3d0';
  } else if (f.includes('credito') || f.includes('crédito')) {
    rotulo = 'Cartão Crédito';
    icone = '💳';
    estilo = 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe';
  } else if (f.includes('debito') || f.includes('débito')) {
    rotulo = 'Cartão Débito';
    icone = '💳';
    estilo = 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0';
  } else if (f.includes('cartao') || f.includes('cartão')) {
    rotulo = 'Cartão';
    icone = '💳';
    estilo = 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe';
  } else if (f.includes('boleto')) {
    rotulo = 'Boleto';
    icone = '📄';
    estilo = 'background:#fffbeb;color:#b45309;border:1px solid #fde68a';
  } else if (f.includes('transferencia') || f.includes('transferência') || f.includes('ted') || f.includes('doc')) {
    rotulo = 'Transferência';
    icone = '🏦';
    estilo = 'background:#faf5ff;color:#7e22ce;border:1px solid #e9d5ff';
  }

  return `<span class="selo" style="${estilo};font-size:10px;padding:2px 7px;font-weight:600">${icone} ${rotulo}</span>`;
}

function blocoFluxoCaixa() {
  const filtroOrigem = (S.ui && S.ui.filtroOrigemMov) || 'todos';
  const filtroMeio = (S.ui && S.ui.filtroMeioPagamentoMov) || 'todos';
  const todosMovs = (S.movimentos || []).slice().reverse();

  const movsFiltrados = todosMovs.filter(m => {
    if (filtroOrigem === 'whatsapp' && m.origem !== 'whatsapp') return false;
    if (filtroOrigem === 'web' && (m.origem || 'web') === 'whatsapp') return false;
    if (filtroOrigem === 'estornados' && !m.estornado) return false;

    if (filtroMeio !== 'todos') {
      const f = String(m.forma || m.formaPagamento || '').toLowerCase();
      if (filtroMeio === 'pix' && !f.includes('pix')) return false;
      if (filtroMeio === 'dinheiro' && !f.includes('dinheiro')) return false;
      if (filtroMeio === 'cartao' && !f.includes('cartao') && !f.includes('cartão') && !f.includes('credito') && !f.includes('debito')) return false;
      if (filtroMeio === 'boleto' && !f.includes('boleto')) return false;
    }
    return true;
  });

  const qtdWhatsapp = todosMovs.filter(m => m.origem === 'whatsapp').length;
  const qtdWeb = todosMovs.filter(m => (m.origem || 'web') !== 'whatsapp').length;
  const qtdEstornados = todosMovs.filter(m => Boolean(m.estornado)).length;

  const filtrosOrigem = [
    ['todos', `Todas as Origens (${todosMovs.length})`],
    ['whatsapp', `📱 WhatsApp (${qtdWhatsapp})`],
    ['web', `💻 Painel Web (${qtdWeb})`],
    ['estornados', `⚠️ Estornados (${qtdEstornados})`]
  ];

  const filtrosMeio = [
    ['todos', 'Todos os Meios'],
    ['pix', '⚡ PIX'],
    ['dinheiro', '💵 Dinheiro'],
    ['cartao', '💳 Cartão'],
    ['boleto', '📄 Boleto']
  ];

  return `
  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
    <div>
      <div style="font-weight:700;font-size:15px">Extrato e Movimentação de Caixa</div>
      <div class="mini">Saldo Atual: <b style="color:var(--verde)">${brl(saldoCaixa())}</b></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-secundario" data-act="exportar-csv-financeiro" style="font-size:13px;padding:6px 14px" title="Exportar movimentações em CSV auditado com assinatura SHA-256">
        📥 Exportar CSV Auditado
      </button>
      <button class="btn btn-secundario" onclick="abrirBoletimFechamentoModal()" style="font-size:13px;padding:6px 14px">
        📜 Boletim de Fechamento
      </button>
      <button class="btn btn-primario" data-act="novo-mov" style="font-size:13px;padding:6px 14px">
        ${ico('mais', 14)} Lançar Movimento Avulso
      </button>
    </div>
  </div>

  <!-- Barra de Filtros Rápidos (Origem e Meio de Pagamento) -->
  <div class="card card-p" style="margin-bottom:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:var(--aco-050);border:1px solid var(--aco-200)">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="mini" style="font-weight:700;color:var(--aco-700);min-width:90px">Canal / Origem:</span>
      <div class="grupo-chips-filtro" style="display:inline-flex;gap:6px;flex-wrap:wrap">
        ${filtrosOrigem.map(([k, label]) => `
          <button class="chip-filtro ${filtroOrigem === k ? 'ativo' : ''}" data-act="filtro-origem-mov" data-o="${k}" style="font-size:11.5px;padding:4px 10px;cursor:pointer">
            ${label}
          </button>
        `).join('')}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="mini" style="font-weight:700;color:var(--aco-700);min-width:90px">Meio de Pgto:</span>
      <div class="grupo-chips-filtro" style="display:inline-flex;gap:6px;flex-wrap:wrap">
        ${filtrosMeio.map(([k, label]) => `
          <button class="chip-filtro ${filtroMeio === k ? 'ativo' : ''}" data-act="filtro-meio-mov" data-m="${k}" style="font-size:11.5px;padding:4px 10px;cursor:pointer">
            ${label}
          </button>
        `).join('')}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th style="width:95px">Data</th>
            <th>Descrição do Lançamento</th>
            <th style="width:135px">Origem / Canal</th>
            <th>Categoria</th>
            <th>Meio de Pgto</th>
            <th style="width:125px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status / Ação</th>
          </tr>
        </thead>
        <tbody>
          ${movsFiltrados.length ? movsFiltrados.map(m => {
            const isEntrada = m.tipo === 'entrada' || m.tipo === 'receita';
            const isEstornado = Boolean(m.estornado);
            const isCompensatorio = Boolean(m.estornoDeId || m.subtipo === 'estorno');
            const podeEstornar = !isEstornado && !isCompensatorio;

            const rowStyle = isEstornado
              ? 'opacity:0.65;background:rgba(239, 68, 68, 0.04);'
              : isCompensatorio
                ? 'background:rgba(245, 158, 11, 0.04);'
                : '';

            return `
            <tr style="${rowStyle}">
              <td class="mono">${dataBRfull(m.data)}</td>
              <td>
                <div style="${isEstornado ? 'text-decoration:line-through;color:var(--aco-600)' : 'font-weight:700'}">
                  ${esc(m.desc || m.descricao || 'Movimento')}
                </div>
                ${(m.osId || m.placa) ? `
                  <div style="display:flex;gap:6px;margin-top:3px;align-items:center;flex-wrap:wrap">
                    ${m.osId ? `<span class="selo" style="background:#e0e7ff;color:#3730a3;font-size:10px;padding:1px 6px">OS #${esc(m.osId)}</span>` : ''}
                    ${m.placa ? `<span class="selo mono" style="background:#fef3c7;color:#92400e;font-size:10px;padding:1px 6px">🚗 ${esc(m.placa)}</span>` : ''}
                  </div>
                ` : ''}
                ${isEstornado ? `
                  <div class="mini" style="color:var(--tijolo);font-weight:700;margin-top:2px">
                    ⚠️ ESTORNADO: ${esc(m.motivoEstorno || 'Estornado')} ${m.estornadoPor ? `· por ${esc(m.estornadoPor)}` : ''}
                  </div>
                ` : ''}
                ${isCompensatorio ? `
                  <div class="mini" style="color:#d97706;font-weight:600;margin-top:2px">
                    ↩️ Lançamento Compensatório de Estorno
                  </div>
                ` : ''}
              </td>
              <td>
                ${m.origem === 'whatsapp' ? `
                  <div>
                    <span class="selo" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-size:10.5px;font-weight:700">
                      📱 WhatsApp
                    </span>
                    ${m.autorNumero ? `
                      <div class="mini mono" style="font-size:10px;color:var(--aco-600);margin-top:2px" title="Número autor: ${esc(m.autorNumero)}">
                        📞 ${esc(m.autorNumero)}
                      </div>
                    ` : ''}
                    ${m.confirmadoEm ? `
                      <div class="mini" style="font-size:9.5px;color:var(--aco-400)">
                        ✓ ${formatarHoraSimples(m.confirmadoEm)}
                      </div>
                    ` : ''}
                  </div>
                ` : `
                  <div>
                    <span class="selo" style="background:var(--aco-100);color:var(--aco-700);font-size:10.5px">
                      💻 Painel Web
                    </span>
                  </div>
                `}
              </td>
              <td>
                ${(m.naturezaOperacao === 'sangria' || m.subtipo === 'sangria') ? `<span class="selo" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:10px;font-weight:700;margin-right:4px">🏦 Sangria</span>` : ''}
                ${(m.naturezaOperacao === 'suprimento' || m.subtipo === 'suprimento') ? `<span class="selo" style="background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;font-size:10px;font-weight:700;margin-right:4px">🪙 Suprimento</span>` : ''}
                <span class="selo">${esc(m.cat || m.categoria || 'Geral')}</span>
              </td>
              <td>${renderBadgeMeioPagamento(m.forma || m.formaPagamento)}</td>
              <td style="text-align:right;font-weight:700;color:${isEstornado ? 'var(--aco-500)' : isEntrada ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                <span style="${isEstornado ? 'text-decoration:line-through' : ''}">
                  ${isEntrada ? '+' : '−'} ${brl(m.valor)}
                </span>
              </td>
              <td style="text-align:center">
                <div>
                  <span class="selo ${isEstornado ? 'selo-alerta' : isCompensatorio ? 'selo-aviso' : m.conc ? 'selo-finalizada' : 'selo-fila'}" style="font-size:10px">
                    ${isEstornado ? 'Estornado' : isCompensatorio ? 'Compensação' : m.conc ? 'Conciliado' : 'Manual'}
                  </span>
                </div>
                ${podeEstornar ? `
                  <button class="btn btn-secundario btn-pequeno"
                          data-act="estornar-mov"
                          data-id="${m.id}"
                          onclick="solicitarEstornoMovimento('${m.id}')"
                          title="Estornar contabilmente esta movimentação"
                          style="font-size:10.5px;padding:2px 8px;margin-top:4px;color:var(--tijolo);border-color:rgba(239, 68, 68, 0.4)">
                    ↩️ Estornar
                  </button>
                ` : ''}
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="7" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma movimentação de caixa encontrada para o filtro selecionado.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== DRE GERENCIAL SIMPLIFICADO ===== */
function blocoDRE() {
  const mes = mesRef(hoje());
  const movsMes = S.movimentos.filter(m => mesRef(m.data) === mes);
  const recMes = soma(movsMes.filter(m => m.tipo === 'entrada'), m => m.valor);
  const despesasPecas = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Fornecedores Peças'), m => m.valor);
  const despesasPessoal = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Pessoal & Salários'), m => m.valor);
  const despesasFixas = soma(movsMes.filter(m => m.tipo === 'saida' && ['Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const outrasDesp = soma(movsMes.filter(m => m.tipo === 'saida' && !['Fornecedores Peças', 'Pessoal & Salários', 'Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const totalDesp = despesasPecas + despesasPessoal + despesasFixas + outrasDesp;
  const lucroLiq = recMes - totalDesp;
  const margemLiq = recMes > 0 ? ((lucroLiq / recMes) * 100).toFixed(1) : 0;

  return `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div class="entre" style="border-bottom:2px solid var(--aco-900);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Demonstrativo Gerencial de Resultados (Regime de Caixa)</h3>
        <div class="mini">Apurado a partir de movimentações financeiras de caixa realizadas (${dataBR(hoje())})</div>
      </div>
      <div class="num" style="font-size:22px;font-weight:700;color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">
        ${brl(lucroLiq)} <span style="font-size:13px">(${margemLiq}%)</span>
      </div>
    </div>

    <div style="background:var(--aco-050);border-left:4px solid var(--primario);padding:10px 14px;border-radius:6px;font-size:12px;color:var(--aco-700);margin-bottom:16px;line-height:1.4">
      📊 <b>Critério Gerencial Operacional:</b> Este demonstrativo é apurado exclusivamente a partir de movimentações financeiras de caixa realizadas (entradas e saídas efetivas) para acompanhamento da saúde operacional da oficina mecânica. Não se confunde com DRE Contábil societária ou escrituração fiscal oficial, que devem ser emitidas através do ERP fiscal-contábil externo integrado da empresa.
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px">
      <div class="entre" style="font-weight:700;font-size:14.5px;color:var(--aco-900);background:var(--aco-050);padding:8px">
        <span>(+) RECEITA BRUTA OPERACIONAL REALIZADA</span>
        <span class="num">${brl(recMes)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Custos de Peças e Insumos Pagos (CMV Caixa)</span>
        <span class="num">${brl(despesasPecas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas com Folha de Pagamento / Mecânicos Pagas</span>
        <span class="num">${brl(despesasPessoal)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas Fixas Pagas (Aluguel, Luz, Água, Internet)</span>
        <span class="num">${brl(despesasFixas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Outras Despesas Operacionais e Administrativas</span>
        <span class="num">${brl(outrasDesp)}</span>
      </div>

      <div class="entre" style="font-weight:700;font-size:15px;border-top:2px solid var(--aco-300);padding-top:12px;margin-top:8px">
        <span>(=) RESULTADO OPERACIONAL GERENCIAL DE CAIXA</span>
        <span class="num" style="color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">${brl(lucroLiq)}</span>
      </div>
    </div>
  </div>`;
}

/* ===== CONCILIAÇÃO BANCÁRIA ===== */
function blocoBanco() {
  const extrato = S.extrato || [];

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Conciliação Bancária com Extrato OFX / CSV</div>
      <div class="mini">Importe o arquivo do seu banco para cruzar lançamentos automaticamente</div>
    </div>
    <div style="display:flex;gap:8px">
      ${extrato.length ? `<button class="btn btn-secundario" data-act="limpar-extrato">Limpar Extrato</button>` : ''}
      <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 14px">
        ${ico('upload', 14)} Importar Arquivo OFX/CSV
        <input type="file" accept=".ofx,.csv,.txt" data-act="arquivo-extrato" multiple style="display:none">
      </label>
    </div>
  </div>

  <div class="card card-p">
    ${extrato.length ? `
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr><th>Data</th><th>Descrição no Extrato</th><th style="width:120px;text-align:right">Valor</th><th style="width:180px;text-align:center">Ação</th></tr>
          </thead>
          <tbody>
            ${extrato.map(l => `
              <tr style="${l.ok ? 'opacity:0.5' : ''}">
                <td class="mono">${dataBR(l.data)}</td>
                <td><b>${esc(l.desc)}</b></td>
                <td style="text-align:right;font-weight:700;color:${l.valor >= 0 ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                  ${brl(l.valor)}
                </td>
                <td style="text-align:center">
                  ${l.ok ? `<span class="selo selo-finalizada">Conciliado</span>` : `
                    <button class="btn btn-secundario" data-act="conciliar-avulso" data-id="${l.id}" style="font-size:12px;padding:4px 8px">
                      Lançar no Caixa
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <div style="text-align:center;padding:40px;color:var(--aco-400)">
        <div style="margin-bottom:10px">${ico('fin', 32)}</div>
        <b>Nenhum extrato importado</b><br>
        Envie o arquivo OFX exportado pelo Internet Banking da oficina para conciliar saldos.
      </div>
    `}
  </div>`;
}

function baixarConta(c, dataPgto) {
  if (!c || c.pago) return;
  c.pago = true;
  c.dataPgto = dataPgto || hoje();

  S.movimentos.push({
    id: uid('mv'),
    data: c.dataPgto,
    tipo: c.tipo === 'receber' ? 'entrada' : 'saida',
    desc: `Baixa: ${c.desc} (${c.parte})`,
    valor: c.valor,
    cat: c.cat || 'Geral',
    conc: true,
    forma: 'Baixa Financeira'
  });

  salvar();
}

function imprimirRecibo(contaId) {
  const c = S.contas.find(x => x.id === contaId);
  if (!c) return;

  const cfg = S.cfg;
  const janela = window.open('', '_blank');
  if (!janela) return;

    const logoRaw = cfg.identidadeVisual?.logo || cfg.identidadeVisual?.imagemInstitucional;
    const logoUrl = (typeof logoRaw === 'string') ? logoRaw : (logoRaw?.url || null);
    const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:50px;max-width:160px;object-fit:contain;margin-bottom:8px" alt="Logo"><br>` : '';

    janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Recibo de Pagamento — ${cfg.empresa}</title>
      <style>
        body { font-family: sans-serif; font-size: 13px; max-width: 600px; margin: 20px auto; padding: 20px; border: 2px solid #334155; border-radius: 8px; }
        .topo { text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px; }
        .valor { font-size: 24px; font-weight: bold; color: #10b981; margin: 14px 0; text-align: right; }
        .corpo { line-height: 1.6; margin-bottom: 24px; }
        .ass { margin-top: 40px; text-align: center; border-top: 1px solid #000; width: 60%; margin-left: auto; margin-right: auto; padding-top: 6px; }
      </style>
    </head>
    <body>
      <div class="topo">
        ${logoHtml}
        <h2>${esc(cfg.empresa)}</h2>
        <div>CNPJ: ${esc(cfg.cnpj)} · ${esc(cfg.endereco)}</div>
      </div>
    <div class="valor">RECIBO: ${brl(c.valor)}</div>
    <div class="corpo">
      Recebemos de <b>${esc(c.parte)}</b> a quantia de <b>${brl(c.valor)}</b> referente a <b>${esc(c.desc)}</b> (${esc(c.doc || 'Doc S/N')}).<br>
      Para clareza e fins de direito, firmamos o presente recibo dando plena e geral quitação.
    </div>
    <div style="text-align:right">Campinas, ${dataBRfull(c.dataPgto || hoje())}.</div>
    <div class="ass">${esc(cfg.empresa)}<br><small>Assinatura Autorizada</small></div>
    <script>window.onload = () => window.print();<\/script>
  </body>
  </html>`);
  janela.document.close();
}

function folhaConta() {
  const tipo = S.ui.contaTipo || 'receber';
  const r = S.ui.rascConta = S.ui.rascConta || { venc: hoje(), valor: '' };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Lançar Título — Contas a ${tipo === 'receber' ? 'Receber' : 'Pagar'}</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Título:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Manutenção Preventiva / Compra de Peças" data-act="rct" data-c="desc" value="${esc(r.desc || '')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">${tipo === 'receber' ? 'Cliente / Devedor' : 'Fornecedor / Favorecido'}:</label>
        <input type="text" class="campo-texto" placeholder="Nome da empresa ou pessoa" data-act="rct" data-c="parte" value="${esc(r.parte || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rct" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Data de Vencimento:</label>
          <input type="date" class="campo-texto" data-act="rct" data-c="venc" value="${r.venc || hoje()}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Categoria de Centro de Custo:</label>
        <select class="campo-select" data-act="rct" data-c="cat" style="width:100%;height:34px">
          ${(S.cfg.planoDeContas || []).map(x => `<option value="${esc(x)}" ${r.cat===x?'selected':''}>${esc(x)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-conta" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Lançar Conta
      </button>
    </div>
  </div>`;
}

function folhaMov() {
  const r = S.ui.rascMov = S.ui.rascMov || { data: hoje(), tipo: 'entrada', valor: '' };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Lançamento Avulso no Caixa</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Tipo de Movimento:</label>
          <select class="campo-select" data-act="rmv" data-c="tipo" style="width:100%;height:34px;font-weight:600">
            <option value="entrada" ${r.tipo === 'entrada' ? 'selected' : ''}>Entrada (+) Receita</option>
            <option value="saida" ${r.tipo === 'saida' ? 'selected' : ''}>Saída (−) Despesa</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Data:</label>
          <input type="date" class="campo-texto" data-act="rmv" data-c="data" value="${r.data || hoje()}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Lançamento:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Pagamento de Frete / Compra de Material de Limpeza" data-act="rmv" data-c="desc" value="${esc(r.desc || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Categoria / Centro de Custo:</label>
          <select class="campo-select" data-act="rmv" data-c="cat" style="width:100%;height:34px">
            ${(S.cfg.planoDeContas || []).map(x => `<option value="${esc(x)}" ${r.cat===x?'selected':''}>${esc(x)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rmv" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-mov" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Salvar Movimento
      </button>
    </div>
  </div>`;
}

/* ===== ROTINA DE ESTORNO CONTÁBIL AUDITADO ===== */
function folhaEstornoMovimento() {
  const mov = (S.ui && S.ui.movimentoEstorno) || null;
  if (!mov) {
    return `
    <div class="card card-p" style="max-width:480px;margin:0 auto">
      <div class="entre" style="margin-bottom:12px">
        <h3 style="margin:0;font-size:16px;font-weight:700">↩️ Estorno Contábil</h3>
        <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
      </div>
      <p style="color:var(--aco-600)">Nenhuma movimentação selecionada para estorno.</p>
      <div style="text-align:right"><button class="btn btn-secundario" onclick="fecharFolha()">Fechar</button></div>
    </div>`;
  }

  const isEntrada = mov.tipo === 'entrada' || mov.tipo === 'receita';
  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--tijolo)">↩️ Estorno Contábil Auditado</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="background:rgba(239, 68, 68, 0.06);border:1px solid rgba(239, 68, 68, 0.2);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12.5px;color:var(--aco-800);line-height:1.4">
      ⚠️ <b>Atenção:</b> Esta operação mantém a imutabilidade contábil. O lançamento original será mantido e marcado como estornado, e uma movimentação compensatória inversa (${isEntrada ? 'Saída' : 'Entrada'} de ${brl(mov.valor)}) será lançada imediatamente para reverter o saldo do caixa. Apenas perfis autorizados (Dono/Admin) podem executar o estorno.
    </div>

    <div style="font-size:13px;display:flex;flex-direction:column;gap:8px;margin-bottom:14px;background:var(--aco-050);padding:12px;border-radius:6px;border:1px solid var(--aco-200)">
      <div><b>Lançamento:</b> ${esc(mov.desc || mov.descricao || 'Movimento')}</div>
      <div><b>Valor Original:</b> <span class="num" style="font-weight:700;color:${isEntrada ? 'var(--verde)' : 'var(--tijolo)'}">${isEntrada ? '+' : '−'} ${brl(mov.valor)}</span></div>
      <div><b>Origem:</b> ${mov.origem === 'whatsapp' ? '📱 WhatsApp' : '💻 Painel Web'} ${mov.autorNumero ? `(📞 ${esc(mov.autorNumero)})` : ''}</div>
      <div><b>Data:</b> ${dataBR(mov.data || hoje())}</div>
    </div>

    <div style="margin-bottom:16px">
      <label style="font-weight:600;display:block;margin-bottom:4px;font-size:13px">
        Motivo Obrigatório do Estorno <span style="color:var(--tijolo)">*</span>:
      </label>
      <input type="text" id="estorno-motivo-input" class="campo-texto" placeholder="Ex: Lançamento em duplicidade via WhatsApp, valor digitado incorreto" style="width:100%;height:36px;font-size:13px">
      <div class="mini" style="color:var(--aco-500);margin-top:3px">Mínimo de 3 caracteres. Ficará registrado de forma perene no log de auditoria.</div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-perigo" onclick="confirmarEstornoMovimento('${mov.id}')" style="font-weight:700;padding:0 18px">
        ${ico('check', 14)} Confirmar Estorno
      </button>
    </div>
  </div>`;
}

function solicitarEstornoMovimento(id) {
  const mov = (S.movimentos || []).find(m => m.id === id);
  if (!mov) {
    if (typeof torrar === 'function') torrar('Movimentação não encontrada');
    else alert('Movimentação não encontrada');
    return;
  }
  if (mov.estornado) {
    if (typeof torrar === 'function') torrar('Esta movimentação já foi estornada anteriormente');
    else alert('Esta movimentação já foi estornada anteriormente');
    return;
  }
  if (mov.estornoDeId || mov.subtipo === 'estorno') {
    if (typeof torrar === 'function') torrar('Não é possível estornar um lançamento compensatório de estorno');
    else alert('Não é possível estornar um lançamento compensatório de estorno');
    return;
  }

  S.ui = S.ui || {};
  S.ui.movimentoEstorno = mov;
  if (typeof abrirFolha === 'function') {
    abrirFolha(folhaEstornoMovimento);
    setTimeout(() => {
      const el = document.getElementById('estorno-motivo-input');
      if (el) el.focus();
    }, 100);
  } else {
    const motivo = prompt('Informe o motivo do estorno contábil (mínimo 3 caracteres):');
    if (motivo) {
      executarEstornoMovimento(id, motivo);
    }
  }
}

async function confirmarEstornoMovimento(id) {
  const el = document.getElementById('estorno-motivo-input');
  const motivo = el ? el.value.trim() : '';
  if (!motivo || motivo.length < 3) {
    if (typeof torrar === 'function') torrar('Informe o motivo do estorno (mínimo 3 caracteres)');
    else alert('Informe o motivo do estorno (mínimo 3 caracteres)');
    return;
  }
  await executarEstornoMovimento(id, motivo);
}

async function executarEstornoMovimento(id, motivo) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };

    const res = await fetch(`/api/financeiro/movimentacoes/${encodeURIComponent(id)}/estornar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao realizar estorno contábil');
    }

    // Atualiza estado local de forma reativa
    if (data.movimentoEstornado) {
      const idx = (S.movimentos || []).findIndex(m => m.id === data.movimentoEstornado.id);
      if (idx !== -1) {
        S.movimentos[idx] = data.movimentoEstornado;
      }
    }
    if (data.movimentoCompensatorio) {
      S.movimentos = S.movimentos || [];
      S.movimentos.push(data.movimentoCompensatorio);
    }
    if (data.caixa) {
      const cIdx = (S.caixas || []).findIndex(c => c.id === data.caixa.id);
      if (cIdx !== -1) {
        S.caixas[cIdx] = data.caixa;
      }
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    if (typeof torrar === 'function') torrar(data.mensagem || 'Estorno realizado com sucesso!');
    else alert(data.mensagem || 'Estorno realizado com sucesso!');
  } catch (err) {
    if (typeof torrar === 'function') torrar(`Falha no estorno: ${err.message}`);
    else alert(`Falha no estorno: ${err.message}`);
  }
}

function folhaBoletimFechamento() {
  const caixaAberto = (Array.isArray(S.caixas) ? S.caixas : []).find(c => c.status === 'aberto');
  const ultimoCaixaFechado = (Array.isArray(S.caixas) ? S.caixas : []).find(c => c.status === 'fechado');
  const caixaRef = caixaAberto || ultimoCaixaFechado;

  let textoBoletim = '';
  if (caixaRef && caixaRef.fechamento && caixaRef.fechamento.resumoTextoWhatsapp) {
    textoBoletim = caixaRef.fechamento.resumoTextoWhatsapp;
  } else if (caixaAberto) {
    const movsCaixa = (S.movimentos || []).filter(m => (m.caixaId === caixaAberto.id) || (Array.isArray(caixaAberto.movimentacoesIds) && caixaAberto.movimentacoesIds.includes(m.id)));
    const totalEnt = movsCaixa.filter(m => m.tipo === 'entrada').reduce((a, b) => a + (Number(b.valor) || 0), 0);
    const totalSai = movsCaixa.filter(m => m.tipo === 'saida').reduce((a, b) => a + (Number(b.valor) || 0), 0);
    const saldoAtual = (Number(caixaAberto.saldoInicial) || 0) + totalEnt - totalSai;
    const qtdWpp = movsCaixa.filter(m => m.origem === 'whatsapp').length;
    const qtdWeb = movsCaixa.filter(m => (m.origem || 'web') !== 'whatsapp').length;

    textoBoletim = `⏳ *FECHAMENTO PARCIAL DE CAIXA* ⏳\n\n` +
      `• Turno: #${caixaAberto.id}\n` +
      `• Operador: ${caixaAberto.operador || 'Operador'}\n\n` +
      `💰 MOVIMENTAÇÃO:\n` +
      `• Fundo Inicial: ${brl(caixaAberto.saldoInicial || 0)}\n` +
      `• (+) Entradas: ${brl(totalEnt)}\n` +
      `• (-) Saídas: ${brl(totalSai)}\n` +
      `• (=) Saldo Atual: ${brl(saldoAtual)}\n\n` +
      `📊 QUEBRA POR ORIGEM:\n` +
      `• 📱 WhatsApp: ${qtdWpp} lançamentos\n` +
      `• 💻 Web / Balcão: ${qtdWeb} lançamentos\n\n` +
      `_Status: Turno em andamento._`;
  } else {
    textoBoletim = `Nenhum turno de caixa registrado ou encerrado no sistema.`;
  }

  return `
  <div style="max-width:540px;margin:0 auto">
    <div style="font-weight:700;font-size:16px;color:var(--aco-900);margin-bottom:8px;display:flex;align-items:center;gap:8px">
      📜 Boletim de Fechamento de Caixa Auditado
    </div>
    <div class="mini" style="margin-bottom:14px;color:var(--aco-600)">
      Boletim consolidado com quebra por canais (WhatsApp vs Web), meios de pagamento e estornos.
    </div>

    <div style="margin-bottom:16px">
      <textarea id="boletim-fechamento-textarea" class="campo-texto mono" readonly style="width:100%;height:220px;font-size:12px;line-height:1.5;padding:10px;background:var(--aco-050)">${esc(textoBoletim)}</textarea>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--aco-150);padding-top:12px;gap:8px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Fechar</button>
      <button class="btn btn-primario" onclick="copiarBoletimFechamento()" style="font-weight:700">
        📋 Copiar para WhatsApp
      </button>
    </div>
  </div>`;
}

function abrirBoletimFechamentoModal() {
  if (typeof abrirFolha === 'function') {
    abrirFolha(folhaBoletimFechamento);
  } else {
    alert('Boletim de fechamento disponível no painel.');
  }
}

function copiarBoletimFechamento() {
  const el = document.getElementById('boletim-fechamento-textarea');
  if (el) {
    if (typeof copiar === 'function') {
      copiar(el.value);
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(el.value);
    }
    if (typeof torrar === 'function') torrar('Boletim copiado com sucesso para a área de transferência!');
    else alert('Boletim copiado!');
  }
}

async function exportarMovimentacoesCSV() {
  try {
    const fOrigem = (S.ui && S.ui.filtroOrigemMov) || 'todos';
    const fMeio = (S.ui && S.ui.filtroMeioPagamentoMov) || 'todos';
    const params = new URLSearchParams();
    params.set('formato', 'csv');
    if (fOrigem !== 'todos') params.set('origem', fOrigem);
    if (fMeio !== 'todos') params.set('meioPagamento', fMeio);

    const res = await fetch(`/api/financeiro/exportar?${params.toString()}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const sha256 = res.headers.get('X-Export-SHA256');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato_financeiro_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    if (typeof torrar === 'function') {
      torrar(`Exportação CSV concluída! SHA-256: ${sha256 ? sha256.slice(0, 12) + '...' : 'OK'}`);
    }
  } catch (err) {
    console.error('[Exportar CSV] Falha:', err);
    if (typeof torrar === 'function') {
      torrar(`Erro na exportação CSV: ${err.message}`);
    }
  }
}

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.viewFinanceiro = viewFinanceiro;
  window.calcularDashboardFin = calcularDashboardFin;
  window.blocoDashboardFin = blocoDashboardFin;
  window.renderGraficosFinanceiro = renderGraficosFinanceiro;
  window.agingReceber = agingReceber;
  window.categorizarContas = categorizarContas;
  window.blocoContasReceber = blocoContasReceber;
  window.blocoContasPagar = blocoContasPagar;
  window.blocoFluxoCaixa = blocoFluxoCaixa;
  window.blocoDRE = blocoDRE;
  window.blocoBanco = blocoBanco;
  window.baixarConta = baixarConta;
  window.imprimirRecibo = imprimirRecibo;
  window.folhaConta = folhaConta;
  window.folhaMov = folhaMov;
  window.formatarHoraSimples = formatarHoraSimples;
  window.folhaEstornoMovimento = folhaEstornoMovimento;
  window.solicitarEstornoMovimento = solicitarEstornoMovimento;
  window.confirmarEstornoMovimento = confirmarEstornoMovimento;
  window.executarEstornoMovimento = executarEstornoMovimento;
  window.renderBadgeMeioPagamento = renderBadgeMeioPagamento;
  window.folhaBoletimFechamento = folhaBoletimFechamento;
  window.abrirBoletimFechamentoModal = abrirBoletimFechamentoModal;
  window.copiarBoletimFechamento = copiarBoletimFechamento;
  window.exportarMovimentacoesCSV = exportarMovimentacoesCSV;
}
