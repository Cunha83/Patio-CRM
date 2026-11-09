/* =====================================================================
   PÁTIO CRM — TRIAGEM, VISTORIA, HISTÓRICO & ABERTURA DE OS
   Submódulo para abertura de OS, novos veículos, inspeção e histórico
   ===================================================================== */

function abaHistoricoVeiculo(v) {
  if (!v) return '<div class="card card-p">Nenhum veículo selecionado.</div>';
  const osPassadas = (S.os || []).filter(o => o.vei === v.id);
  const isMec = (typeof isPerfilMecanico === 'function' ? isPerfilMecanico() : false);

  return `
  <div class="card card-p">
    <div class="entre" style="margin-bottom:12px">
      <div>
        <div style="font-weight:700;font-size:15px">Histórico de Manutenções — Placa ${esc(v.placa)}</div>
        <div class="mini">Total de ${osPassadas.length} passagens registradas na oficina</div>
      </div>
    </div>

    <div class="timeline" style="display:flex;flex-direction:column;gap:12px">
      ${osPassadas.map(pass => `
        <div class="item-timeline" style="border-left:3px solid var(--petroleo);padding-left:12px;position:relative">
          <div class="entre">
            <span style="font-weight:600;font-size:13.5px">OS ${pass.num} · ${typeof dataBRfull === 'function' ? dataBRfull(pass.abertura) : pass.abertura}</span>
            <span class="selo" data-st="${pass.st}">${(typeof ST !== 'undefined' && ST[pass.st]) ? ST[pass.st].r : pass.st}</span>
          </div>
          <div class="mini" style="margin-top:2px">KM: <b>${(pass.km || 0).toLocaleString('pt-BR')} km</b> · Mecânico: ${esc(pass.mec || '—')}</div>
          ${pass.queixa ? `<div style="font-size:12.5px;color:var(--aco-700);margin-top:4px"><b>Queixa:</b> ${esc(pass.queixa)}</div>` : ''}
          <div class="mini" style="margin-top:4px;color:var(--aco-500)">
            Serviços: ${(pass.servicos || []).map(s => esc(s.nome)).join(', ') || 'Nenhum'} | 
            Peças: ${(pass.pecas || []).map(p => esc(p.nome)).join(', ') || 'Nenhuma'}
          </div>
          ${!isMec ? `
          <div class="num" style="font-weight:700;font-size:13px;margin-top:4px;color:var(--aco-900)">
            Valor Total: ${brl(typeof totOS === 'function' ? totOS(pass) : 0)}
          </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  </div>`;
}

function abaInspecaoOrcamento(o, v, c) {
  const inspecoes = (S.inspections || []).filter(i => i.osId === o.id || i.id === o.inspectionId);
  const orcamentos = (S.quotations || []).filter(q => q.osId === o.id || q.id === o.quotationId);
  const orcAtual = orcamentos[0] || null;
  const inspAtual = inspecoes[0] || null;
  const isMec = (typeof isPerfilMecanico === 'function' ? isPerfilMecanico() : false);

  return `
  <div class="card card-p" style="margin-bottom:14px">
    <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-150);padding-bottom:10px">
      <div>
        <div style="font-weight:700;font-size:15px">🔍 Inspeção Técnica & Diagnóstico Físico</div>
        <div class="mini">Validação obrigatória por mecânico credenciado com registro de fotos e laudos</div>
      </div>
      <div>
        <span class="selo" style="${inspAtual ? 'background:#def7ec;color:#03543f' : 'background:#fef08a;color:#713f12'}">
          ${inspAtual ? (inspAtual.status === 'concluida' ? 'Inspeção Concluída' : 'Em Inspeção') : 'Não Iniciada'}
        </span>
      </div>
    </div>

    ${inspAtual ? `
      <div style="margin-bottom:12px">
        ${inspAtual.laudoGeral ? `<div style="font-size:13px;margin-bottom:8px"><b>Laudo Geral:</b> ${esc(inspAtual.laudoGeral)}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:8px">
          ${(inspAtual.items || []).map(item => `
            <div style="border:1px solid var(--aco-150);border-radius:6px;padding:10px;background:var(--aco-50)">
              <div class="entre">
                <span style="font-weight:600;font-size:13.5px">${esc(item.componente)} <span class="mini">(${esc(item.categoria)})</span></span>
                <span class="selo ${item.severidade === 'critico' ? 'selo-perigo' : 'selo-alerta'}">${esc(item.condicao)} • ${esc(item.severidade)}</span>
              </div>
              <div class="mini" style="margin-top:4px">${esc(item.descricao || item.observacoes || 'Sem observações adicionais.')}</div>
              ${item.diagnostico && item.diagnostico.confirmado ? `
                <div style="margin-top:6px;font-size:12px;color:var(--verde-700)">
                  👨‍🔧 <b>Diagnóstico Confirmado por:</b> ${esc(item.diagnostico.confirmadoPor)} (${typeof dataBRfull === 'function' ? dataBRfull(item.diagnostico.confirmadoEm) : item.diagnostico.confirmadoEm})
                  <div style="font-style:italic">"${esc(item.diagnostico.laudo)}"</div>
                </div>
              ` : `
                <div style="margin-top:6px;font-size:12px;color:var(--amarelo-700)">
                  ⚠️ Aguardando validação presencial do mecânico responsável.
                </div>
              `}
              ${item.fotos && item.fotos.length ? `
                <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
                  ${item.fotos.map(f => `<img src="${f.fotoBase64 || f.url}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;border:1px solid var(--aco-200)">`).join('')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : `
      <div style="padding:16px;text-align:center;color:var(--aco-500);font-size:13px">
        Nenhuma inspeção formal vinculada a esta OS até o momento.
      </div>
    `}
  </div>

  ${!isMec ? `
  <div class="card card-p">
    <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-150);padding-bottom:10px">
      <div>
        <div style="font-weight:700;font-size:15px">💰 Orçamento Comercial & Aprovação Digital</div>
        <div class="mini">Valoração, versionamento e link seguro de autorização para o cliente</div>
      </div>
      <div>
        ${orcAtual ? `
          <span class="selo" style="font-weight:700">
            ${esc(orcAtual.codigo)} (${esc(orcAtual.status)})
          </span>
        ` : '<span class="selo">Sem Orçamento Ativo</span>'}
      </div>
    </div>

    ${orcAtual ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px;margin-bottom:14px">
        <div style="padding:8px;background:var(--aco-50);border-radius:6px">
          <div class="mini">Subtotal Mão de Obra</div>
          <div style="font-size:15px;font-weight:700">${brl(orcAtual.subtotalServicos)}</div>
        </div>
        <div style="padding:8px;background:var(--aco-50);border-radius:6px">
          <div class="mini">Subtotal Peças</div>
          <div style="font-size:15px;font-weight:700">${brl(orcAtual.subtotalPecas)}</div>
        </div>
        <div style="padding:8px;background:var(--aco-50);border-radius:6px">
          <div class="mini">Total Geral Proposto</div>
          <div style="font-size:15px;font-weight:700">${brl(orcAtual.totalGeral)}</div>
        </div>
        <div style="padding:8px;background:#def7ec;border-radius:6px">
          <div class="mini" style="color:#03543f">Total Autorizado Cliente</div>
          <div style="font-size:16px;font-weight:700;color:#03543f">${brl(orcAtual.totalAprovado || 0)}</div>
        </div>
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px">Itens do Orçamento:</div>
        <table class="tabela">
          <thead>
            <tr>
              <th>Item</th>
              <th style="width:70px;text-align:center">Tipo</th>
              <th style="width:70px;text-align:center">Qtd</th>
              <th style="width:100px;text-align:right">Subtotal</th>
              <th style="width:130px;text-align:center">Decisão Cliente</th>
            </tr>
          </thead>
          <tbody>
            ${(orcAtual.itens || []).map(it => `
              <tr>
                <td><b>${esc(it.nome)}</b></td>
                <td style="text-align:center"><span class="mini">${it.tipo === 'peca' ? 'Peça' : 'Serviço'}</span></td>
                <td style="text-align:center">${it.quantidade}</td>
                <td style="text-align:right">${brl(it.valorTotal)}</td>
                <td style="text-align:center">
                  ${it.status === 'aprovado' 
                    ? '<span class="selo" style="background:#def7ec;color:#03543f;font-weight:600">✅ AUTORIZADO</span>' 
                    : (it.status === 'recusado' 
                      ? '<span class="selo" style="background:#fde8e8;color:#9b1c1c;font-weight:600">❌ RECUSADO</span>' 
                      : '<span class="selo" style="background:#fef08a;color:#713f12">⏳ PENDENTE</span>')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <div style="padding:16px;text-align:center;color:var(--aco-500);font-size:13px">
        Nenhum orçamento gerado para esta OS ainda.
      </div>
    `}
  </div>` : ''}
  `;
}

function novaOSFolha(boxId) {
  const boxesValidos = S.boxes || [];
  const boxesOcupados = new Map();
  (S.os || []).filter(o => o.st !== 'finalizada' && o.box).forEach(o => {
    const v = (typeof V === 'function' ? V(o.vei) : (o.vei || {}));
    boxesOcupados.set(o.box, `OS #${o.num} (${v.placa})`);
  });

  const primeiroLivre = boxesValidos.find(b => !boxesOcupados.has(b.id));
  const defaultBox = boxId !== undefined ? boxId : (primeiroLivre ? primeiroLivre.id : '');

  const rasc = (S.ui && (S.ui.rascunho = S.ui.rascunho || { box: defaultBox })) || {};
  if (boxId && !rasc.box) rasc.box = boxId;
  const veiculos = S.veiculos || [];

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Abertura de Ordem de Serviço</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Selecione o Veículo / Placa:</label>
        <select class="campo-select" data-act="rasc" data-c="vei" style="width:100%;height:36px;font-weight:600">
          <option value="">-- Escolha pela placa --</option>
          <option value="sem_placa" ${rasc.vei === 'sem_placa' ? 'selected' : ''}>⚠️ Sem Placa (Cadastrar depois / Entrada Rápida)</option>
          ${veiculos.map(v => {
            const cl = (typeof C === 'function' ? C(v.cli) : (v.cli || {}));
            return `<option value="${v.id}" ${rasc.vei === v.id ? 'selected' : ''}>${esc(v.placa)} — ${esc(v.modelo)} (${esc(cl.nome)})</option>`;
          }).join('')}
          <option value="novo">+ Cadastrar Novo Caminhão / Placa...</option>
        </select>
      </div>
      ${typeof renderSeletorArticuladoHtml === 'function' ? renderSeletorArticuladoHtml(rasc) : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Box de Destino / Pátio:</label>
          <select class="campo-select" data-act="rasc" data-c="box" style="width:100%;height:34px;font-weight:600">
            <option value="" ${!rasc.box ? 'selected' : ''}>🟡 Fila de Espera (Pátio - Sem Box)</option>
            ${boxesValidos.map(b => {
              const ocupante = boxesOcupados.get(b.id);
              const isSel = rasc.box === b.id;
              return `<option value="${b.id}" ${isSel ? 'selected' : ''} ${ocupante && !isSel ? 'style="color:var(--tijolo)"' : ''}>
                ${ocupante ? '🔴' : '🟢'} ${esc(b.nome)} ${ocupante ? `(Ocupado: ${ocupante})` : '(Disponível)'}
              </option>`;
            }).join('')}
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">KM Atual do Painel:</label>
          <input type="number" class="campo-texto" placeholder="Ex: 350000" data-act="rasc" data-c="km" value="${rasc.km || ''}" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Mecânico Responsável:</label>
          <input type="text" class="campo-texto" placeholder="Nome do mecânico" data-act="rasc" data-c="mec" value="${esc(rasc.mec || '')}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Previsão de Entrega:</label>
          <input type="date" class="campo-texto" data-act="rasc" data-c="prev" value="${rasc.prev || (typeof addDias === 'function' ? addDias(hoje(), 1) : hoje())}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Queixa do Motorista / Problema Relatado:</label>
        <textarea class="campo-texto" placeholder="Ex: Falha na aceleração, vazamento de ar na cuíca traseira..." data-act="rasc" data-c="queixa" rows="3" style="width:100%">${esc(rasc.queixa || '')}</textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="criar-os" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Abrir Ordem de Serviço
      </button>
    </div>
  </div>`;
}

function folhaNovoVeiculo(cliId) {
  const clientes = S.clientes || [];
  const r = (S.ui && (S.ui.rascVeiculo = S.ui.rascVeiculo || { cli: cliId || (clientes[0] ? clientes[0].id : '') })) || {};

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:16px;font-weight:700">Cadastrar Novo Veículo</h3>
      <button class="btn-fechar" data-act="voltar-os">${ico('voltar', 16)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Proprietário / Cliente:</label>
        <select class="campo-select" data-act="rasc-vei" data-c="cli" style="width:100%;height:34px">
          ${clientes.map(c => `<option value="${c.id}" ${r.cli === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Placa do Veículo:</label>
        <div style="display:flex;gap:6px">
          <input type="text" class="campo-texto" placeholder="ABC1D23" data-act="rasc-vei" data-c="placa" value="${esc(r.placa || '')}" style="font-family:var(--mono);text-transform:uppercase;height:34px;flex:1">
          <button class="btn btn-secundario" data-act="buscar-placa-veiculo" title="Consultar dados via APIBrasil">${ico('busca', 14)} Consultar</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Marca / Montadora:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Scania" data-act="rasc-vei" data-c="marca" value="${esc(r.marca || '')}" style="height:34px;width:100%">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Modelo:</label>
          <input type="text" class="campo-texto" placeholder="Ex: R 450 6x2" data-act="rasc-vei" data-c="modelo" value="${esc(r.modelo || '')}" style="height:34px;width:100%">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Ano de Fabricação:</label>
          <input type="text" class="campo-texto" placeholder="2021" data-act="rasc-vei" data-c="ano" value="${esc(r.ano || '')}" style="height:34px;width:100%">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Cor Predominante:</label>
          <input type="text" class="campo-texto" placeholder="Branco" data-act="rasc-vei" data-c="cor" value="${esc(r.cor || '')}" style="height:34px;width:100%">
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="voltar-os">Voltar</button>
      <button class="btn btn-primario" data-act="salvar-veiculo">Salvar e Prosseguir</button>
    </div>
  </div>`;
}

const exportsTriagem = { abaHistoricoVeiculo, abaInspecaoOrcamento, novaOSFolha, folhaNovoVeiculo };
if (typeof window !== 'undefined') Object.assign(window, exportsTriagem);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsTriagem);

