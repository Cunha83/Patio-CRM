/* =====================================================================
   PÁTIO CRM — FOLHA / DRAWER LATERAL DE ORDEM DE SERVIÇO (OS)
   Submódulo de renderização da folha de OS, abas de itens e ficha técnica
   ===================================================================== */

function OSatual() {
  if (typeof S === 'undefined' || !S || !S.os) return null;
  return (S.os || []).find(o => o.id === (S.ui && S.ui.osAberta));
}

function folhaOS() {
  const o = OSatual();
  if (!o) return '<div class="card card-p">Ordem de Serviço não encontrada.</div>';

  const v = (typeof V === 'function' ? V(o.vei) : (o.vei || {}));
  const c = (typeof C === 'function' ? C(o.cli) : (o.cli || {}));
  const b = (typeof B === 'function' ? B(o.box) : (o.box || {}));
  const total = (typeof totOS === 'function' ? totOS(o) : 0);
  const totServ = (typeof soma === 'function' ? soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0)) : 0);
  const totPec = (typeof soma === 'function' ? soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0)) : 0);
  const aba = (S.ui && S.ui.abaOS) || 'servicos';
  const isMec = (typeof isPerfilMecanico === 'function' ? isPerfilMecanico() : false);

  const cabecalho = `
  <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:14px">
    <div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <h2 style="font-size:18px;font-weight:700">OS ${o.num} — <span class="placa">${esc(v.placa)}</span></h2>
        <span class="selo" data-st="${o.st}">${(typeof ST !== 'undefined' && ST[o.st]) ? ST[o.st].r : o.st}</span>
        ${(o.pendenciaCadastral || v.pendenciaCadastral || v.placa === 'SEM-PLACA') ? '<span class="selo" style="background:#fff3cd;color:#856404;border:1px solid #ffeeba;" title="Pendência Cadastral: Placa não confirmada">⚠️ Placa Pendente</span>' : ''}
        ${typeof renderBadgesOperacionaisPatio === 'function' ? renderBadgesOperacionaisPatio(o) : ''}
      </div>
      <div class="mini" style="margin-top:4px">
        ${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)} · Cliente: <b>${esc(c.nome)}</b> · ${esc(b.nome)}
      </div>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      ${(o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') ? `
        <button class="btn btn-sucesso" data-act="retomar-os-gargalo" data-id="${o.id}" style="font-size:12px;padding:5px 10px;font-weight:700" title="Peça recebida: liberar gargalo e retomar execução">
          ▶️ Peça Chegou / Retomar
        </button>
      ` : ''}
      <button class="btn btn-secundario" data-act="requisitar-peca-os" data-id="${o.id}" style="font-size:12px;padding:5px 10px" title="Requisitar peça do estoque">
        🔩 +Peça
      </button>
      <label class="btn btn-secundario" style="cursor:pointer;margin:0;font-size:12px;padding:5px 10px;display:flex;align-items:center;gap:4px" title="Anexar foto da placa para conciliação automática">
        📷 Foto Placa
        <input type="file" accept="image/*" data-act="upload-foto-os" data-os="${o.id}" style="display:none">
      </label>
      <button class="btn btn-secundario" data-act="imprimir-os" title="Imprimir Ordem de Serviço">${ico('imprimir', 14)} Imprimir</button>
      <button class="btn btn-secundario" data-act="copiar-orc" title="Copiar orçamento para WhatsApp">${ico('copiar', 14)} WhatsApp</button>
      <button class="btn btn-perigo" data-act="excluir-os" title="Excluir OS">${ico('lixo', 14)}</button>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>
  </div>`;

  const bannerPendencia = (o.pendenciaCadastral || v.pendenciaCadastral || v.placa === 'SEM-PLACA') ? `
  <div style="background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:22px">⚠️</span>
      <div>
        <div style="font-weight:700;color:#856404;font-size:13px">Pendência Cadastral: Placa não identificada</div>
        <div style="font-size:12px;color:#856404">A OS está operando normalmente (<b>${(typeof ST !== 'undefined' && ST[o.st]) ? ST[o.st].r : o.st}</b>). Anexe a foto da placa para conciliação automática com IA/OCR.</div>
      </div>
    </div>
    <div>
      <label class="btn btn-primario" style="cursor:pointer;margin:0;font-size:12px;padding:6px 14px;display:inline-flex;align-items:center;gap:6px">
        📷 Anexar Foto da Placa
        <input type="file" accept="image/*" data-act="upload-foto-os" data-os="${o.id}" style="display:none">
      </label>
    </div>
  </div>` : '';

  const tabs = [
    ['servicos', 'Serviços & Mão de Obra (' + (o.servicos ? o.servicos.length : 0) + ')'],
    ['pecas', 'Peças Aplicadas (' + (o.pecas ? o.pecas.length : 0) + ')'],
    ['inspecao', isMec ? 'Inspeção Técnica' : 'Inspeção & Orçamento'],
    ['ficha', 'Ficha & Diagnóstico'],
    ['historico', 'Histórico do Veículo']
  ];

  const abasHtml = `
  <div class="abas" style="margin-bottom:14px">
    ${tabs.map(([k, label]) => `
      <button data-act="aba-os" data-k="${k}" aria-selected="${aba === k}">${label}</button>
    `).join('')}
  </div>`;

  let conteudoAba = '';
  if (aba === 'servicos') conteudoAba = abaItens(o, 'servicos');
  else if (aba === 'pecas') conteudoAba = abaItens(o, 'pecas');
  else if (aba === 'inspecao') conteudoAba = (typeof abaInspecaoOrcamento === 'function' ? abaInspecaoOrcamento(o, v, c) : '');
  else if (aba === 'ficha') conteudoAba = abaFicha(o, v, c, b);
  else conteudoAba = (typeof abaHistoricoVeiculo === 'function' ? abaHistoricoVeiculo(v) : '');

  const rodapeHtml = `
  <div class="os-rodape-fixo" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--aco-150);background:var(--branco);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:12px;align-items:center">
      ${!isMec ? `
      <div>
        <div class="mini">Mão de Obra: <b>${brl(totServ)}</b> · Peças: <b>${brl(totPec)}</b></div>
        <div style="font-size:18px;font-weight:700;color:var(--aco-900)">Total: ${brl(total)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label class="mini" style="font-weight:600">Desconto (R$):</label>
        <input type="number" class="campo-texto" style="width:90px;height:30px;font-size:13px" value="${o.desc || 0}" data-act="campo-os" data-c="desc" min="0" step="10">
      </div>
      ` : `
      <div>
        <div class="mini">Itens da OS: <b>${(o.servicos || []).length} serviços</b> · <b>${(o.pecas || []).length} peças</b></div>
        <div style="font-size:14px;font-weight:700;color:var(--aco-700)">Execução Técnica de Oficina</div>
      </div>
      `}
    </div>

    <div style="display:flex;gap:8px;align-items:center">
      <select class="campo-select" data-act="mudar-status-os" style="height:34px;font-size:13px;border-radius:8px;font-weight:600">
        <option value="fila" ${o.st === 'fila' ? 'selected' : ''}>Na Fila</option>
        <option value="executando" ${o.st === 'executando' ? 'selected' : ''}>Em Execução</option>
        <option value="peca" ${o.st === 'peca' ? 'selected' : ''}>Parado p/ Peça</option>
        <option value="aprovacao" ${o.st === 'aprovacao' ? 'selected' : ''}>Aguardando Aprovação</option>
        <option value="finalizada" ${o.st === 'finalizada' ? 'selected' : ''}>Finalizada</option>
      </select>

      ${!isMec ? (o.st !== 'finalizada' ? `
        <button class="btn btn-primario" data-act="faturar-os-prazo" data-id="${o.id || o.num}" style="height:34px;padding:0 14px;font-weight:600" title="Faturar saldo a prazo com geração de títulos a receber">
          📄 Faturar a Prazo
        </button>
        <button class="btn btn-secundario" data-act="liberar-os-excepcional" data-id="${o.id || o.num}" style="height:34px;padding:0 12px;font-weight:600;color:#6b21a8;border-color:#d8b4fe" title="Autorizar saída excepcional de pátio (Dono/Admin)">
          🔓 Liberar Exceção
        </button>
        <button class="btn btn-secundario" data-act="copiar-aviso-cobranca" data-id="${o.id || o.num}" style="height:34px;padding:0 12px;font-weight:600" title="Copiar mensagem amigável de cobrança para WhatsApp">
          📲 Copiar Cobrança
        </button>
        <button class="btn btn-sucesso" data-act="faturar-os-modal" style="height:34px;padding:0 16px;font-weight:600">
          ${ico('check', 14)} Faturar & Entregar
        </button>
      ` : `
        <span class="selo selo-finalizada" style="font-size:13px;padding:6px 12px">OS Faturada / Finalizada</span>
        ${typeof renderBadgeLiberacaoPatio === 'function' ? renderBadgeLiberacaoPatio(o) : ''}
      `) : ''}
    </div>
  </div>`;

  return `<div class="folha-os-container">${cabecalho}${bannerPendencia}${typeof renderSubtotaisArticuladoOS === 'function' ? renderSubtotaisArticuladoOS(o) : ''}${abasHtml}${conteudoAba}${rodapeHtml}</div>`;
}

function abaItens(o, tipo) {
  const itens = o[tipo] || [];
  const isPeca = tipo === 'pecas';
  const isMec = (typeof isPerfilMecanico === 'function' ? isPerfilMecanico() : false);

  return `
  <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:13px;font-weight:600;color:var(--aco-600)">
      ${isPeca ? 'Peças e Insumos Utilizados' : 'Serviços e Mão de Obra Lançada'}
    </div>
    <button class="btn btn-secundario" data-act="picker" data-p="${tipo}" style="font-size:12.5px;padding:5px 12px">
      ${ico('mais', 13)} Adicionar ${isPeca ? 'Peça do Almoxarifado' : 'Serviço da Tabela'}
    </button>
  </div>

  ${(S.ui && S.ui.picker === tipo) ? painelPicker(o, tipo) : ''}

  <div class="tabela-responsiva">
    <table class="tabela">
      <thead>
        <tr>
          <th>Descrição</th>
          <th style="width:90px;text-align:center">Qtd</th>
          ${!isMec ? `
          <th style="width:120px;text-align:right">Valor Unit.</th>
          <th style="width:120px;text-align:right">Subtotal</th>
          ` : ''}
          <th style="width:50px"></th>
        </tr>
      </thead>
      <tbody>
        ${itens.length ? itens.map(item => `
          <tr>
            <td>
              <div style="font-weight:600;color:var(--aco-900);display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span>${esc(item.nome)}</span>
                ${item.autorizado ? ' <span class="selo" style="background:#def7ec;color:#03543f;font-size:10px;padding:2px 6px">AUTORIZADO</span>' : ''}
                ${typeof renderAlvoItemBadge === 'function' ? renderAlvoItemBadge(item, tipo, o) : ''}
                ${isPeca ? `
                  <span class="selo" style="${
                    (item.st === 'consumida' || item.status === 'consumida') ? 'background:#def7ec;color:#03543f' :
                    (item.st === 'reservada' || item.status === 'reservada') ? 'background:#e1effe;color:#1e429f' :
                    (item.st === 'comprada' || item.status === 'comprada') ? 'background:#fef08a;color:#854d0e' :
                    (item.st === 'aguardando_compra' || item.status === 'aguardando_compra') ? 'background:#feecdc;color:#b43403' :
                    'background:var(--aco-100);color:var(--aco-700)'
                  };font-size:10px;padding:2px 6px">
                    ${(item.st || item.status || 'SOLICITADA').toUpperCase().replace('_', ' ')}
                  </span>
                  ${(item.st === 'reservada' || item.status === 'reservada') ? `
                    <button class="btn-micro" data-act="consumir-peca-os" data-peca-id="${esc(item.pecaId || item.id)}" data-item-id="${esc(item.id)}" style="background:var(--verde);color:#fff;padding:2px 6px;font-size:10px" title="Consumir / Aplicar no Veículo">Consumir</button>
                  ` : ''}
                ` : ''}
              </div>
              ${item.cod ? `<div class="mini">Cód: ${esc(item.cod)}</div>` : ''}
            </td>
            <td style="text-align:center">
              <div style="display:inline-flex;align-items:center;gap:4px">
                <button class="btn-micro" data-act="qtd" data-t="${tipo}" data-i="${item.id}" data-d="-1">−</button>
                <span class="num" style="min-width:24px;display:inline-block">${item.qtd}</span>
                <button class="btn-micro" data-act="qtd" data-t="${tipo}" data-i="${item.id}" data-d="1">+</button>
              </div>
            </td>
            ${!isMec ? `
            <td style="text-align:right">
              <input type="number" class="campo-texto" style="width:95px;text-align:right;height:28px;font-size:13px" value="${item.valor}" data-act="val-item" data-t="${tipo}" data-i="${item.id}" step="0.50">
            </td>
            <td style="text-align:right;font-weight:600" class="num">
              ${brl(item.qtd * item.valor)}
            </td>
            ` : ''}
            <td style="text-align:center">
              <button class="btn-icone-perigo" data-act="rm-item" data-t="${tipo}" data-i="${item.id}" title="Remover item">${ico('lixo', 14)}</button>
            </td>
          </tr>
        `).join('') : `
          <tr>
            <td colspan="${isMec ? 3 : 5}" style="text-align:center;color:var(--aco-400);padding:24px">
              Nenhum ${isPeca ? 'peça lançada' : 'serviço lançado'} nesta OS.
            </td>
          </tr>
        `}
      </tbody>
    </table>
  </div>
  ${(o.itensRecusados && o.itensRecusados.length) ? `
    <div style="margin-top:14px;background:#fde8e8;border:1px solid #fbd5d5;border-radius:6px;padding:10px 14px">
      <div style="font-weight:700;color:#9b1c1c;font-size:13px">⚠️ Itens NÃO Autorizados pelo Cliente (Recusados)</div>
      <div class="mini" style="color:#9b1c1c;margin-top:2px">Estes serviços/peças foram expressamente recusados na aprovação do orçamento e NÃO devem ser executados pelo mecânico:</div>
      <ul style="margin:6px 0 0 16px;font-size:12.5px;color:#9b1c1c">
        ${o.itensRecusados.map(r => `<li><b>${esc(r.nome)}</b> (${r.tipo === 'peca' ? 'Peça' : 'Serviço'}) — ${esc(r.motivoRecusa || 'Dispensado')}</li>`).join('')}
      </ul>
    </div>
  ` : ''}`;
}

function painelPicker(o, tipo) {
  const isPeca = tipo === 'pecas';
  const catalogo = isPeca ? (S.pecas || []) : (S.servicos || []);
  const busca = ((S.ui && S.ui.busca) || '').toLowerCase().trim();
  const isMec = (typeof isPerfilMecanico === 'function' ? isPerfilMecanico() : false);

  const filtrados = catalogo.filter(item => {
    return (item.nome || '').toLowerCase().includes(busca) ||
           (item.cod && item.cod.toLowerCase().includes(busca)) ||
           (item.forn && item.forn.toLowerCase().includes(busca));
  });

  return `
  <div class="card card-p" style="margin-bottom:14px;background:var(--aco-100);border:1px solid var(--aco-200)">
    <div class="entre" style="margin-bottom:10px">
      <div style="font-weight:600;font-size:13px">${isPeca ? 'Selecionar Peça do Almoxarifado' : 'Selecionar Serviço'}</div>
      <button class="btn-fechar" data-act="fechar-picker">${ico('x', 14)}</button>
    </div>
    <div style="margin-bottom:10px">
      <input type="text" class="campo-texto" placeholder="Digitar para buscar..." data-act="busca-picker" value="${esc((S.ui && S.ui.busca) || '')}" autofocus style="height:32px;font-size:13px;width:100%">
    </div>
    <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${filtrados.map(item => `
        <div class="entre item-picker" style="padding:6px 10px;background:var(--branco);border-radius:6px;font-size:13px">
          <div>
            <div style="font-weight:600">${esc(item.nome)}</div>
            <div class="mini">${isPeca ? `Cód: ${esc(item.cod)} · Estoque: <b>${item.qtd} ${item.un}</b> · ${esc(item.loc || '—')}` : `Tempo est.: ${item.horas}h`}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${!isMec ? `<span class="num" style="font-weight:600">${brl(isPeca ? item.venda : item.valor)}</span>` : ''}
            <button class="btn btn-primario" data-act="add-item" data-t="${tipo}" data-r="${item.id}" style="padding:3px 10px;font-size:12px">
              ${ico('mais', 12)} Inserir
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function abaFicha(o, v, c, b) {
  return `
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px">
    <div class="card card-p">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--aco-600)">Dados do Veículo & Cliente</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
        <div><b>Placa:</b> <span class="placa">${esc(v.placa)}</span></div>
        <div><b>Modelo/Marca:</b> ${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)} (${esc(v.ano || '—')})</div>
        <div><b>Cliente:</b> ${esc(c.nome)}</div>
        <div><b>Telefone:</b> ${esc(c.fone || '—')}</div>
        <div style="margin-top:2px">
          <label class="mini" style="font-weight:600;display:block;margin-bottom:3px">Box Alocado / Pátio:</label>
          <select class="campo-select" data-act="mudar-box-os" style="width:100%;height:32px;font-size:12.5px;font-weight:600">
            <option value="" ${!o.box ? 'selected' : ''}>🟡 Pátio / Fila de Espera (Sem Box)</option>
            ${(S.boxes || []).map(bx => {
              const ocup = (S.os || []).find(other => other.id !== o.id && other.box === bx.id && other.st !== 'finalizada');
              const isAtual = o.box === bx.id;
              return `<option value="${bx.id}" ${isAtual ? 'selected' : ''} ${ocup && !isAtual ? 'style="color:var(--tijolo)"' : ''}>
                ${ocup && !isAtual ? '🔴' : '🟢'} ${esc(bx.nome)} ${isAtual ? '(Box Atual)' : (ocup ? `(Ocupado - OS #${ocup.num})` : '(Disponível)')}
              </option>`;
            }).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--aco-600)">Prazos & Quilometragem</div>
      <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
        <div>
          <label class="mini" style="font-weight:600;display:block">KM Atual do Veículo:</label>
          <input type="number" class="campo-texto" value="${o.km || 0}" data-act="campo-os" data-c="km" style="width:100%;height:32px">
        </div>
        <div>
          <label class="mini" style="font-weight:600;display:block">Previsão de Conclusão / Entrega:</label>
          <input type="date" class="campo-texto" value="${o.prev || hoje()}" data-act="campo-os" data-c="prev" style="width:100%;height:32px">
        </div>
      </div>
    </div>
  </div>

  <div class="card card-p" style="margin-top:14px">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--aco-600)">Queixa do Motorista / Diagnóstico de Entrada</div>
    <textarea class="campo-texto" data-act="campo-os" data-c="queixa" rows="2" style="width:100%;resize:vertical">${esc(o.queixa || '')}</textarea>

    <div style="font-weight:600;font-size:13px;margin-top:12px;margin-bottom:8px;color:var(--aco-600)">Observações Técnicas / Laudo</div>
    <textarea class="campo-texto" data-act="campo-os" data-c="obs" rows="2" style="width:100%;resize:vertical">${esc(o.obs || '')}</textarea>
  </div>`;
}

// Binds no escopo global
const exportsSheet = { OSatual, folhaOS, abaItens, painelPicker, abaFicha };
if (typeof window !== 'undefined') Object.assign(window, exportsSheet);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsSheet);

