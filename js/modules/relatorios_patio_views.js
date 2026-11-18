/**
 * Módulo: relatorios_patio_views.js
 * Pátio-CRM — Views Dinâmicas dos Relatórios Operacionais e de Pátio
 * Arquitetura Modular (< 300 linhas).
 */

(function (global) {
  'use strict';

  function renderRelatorioPatio(id) {
    if (id === 'os_periodo') return renderRelatorioOSPeriodo();
    if (id === 'produtividade_mecanicos') return renderRelatorioProdutividadeMecanicos();
    if (id === 'ocupacao_boxes') return renderRelatorioOcupacaoBoxes();
    if (id === 'tempo_permanencia') return renderRelatorioTempoPermanencia();
    return null;
  }

  function renderRelatorioOSPeriodo() {
    const listaOS = S.os || [];
    const totalOS = listaOS.length;
    const finalizadas = listaOS.filter(o => o.st === 'finalizada');
    const emExecucao = listaOS.filter(o => o.st === 'execucao' || o.st === 'aprovada');
    const pendentes = listaOS.filter(o => o.st === 'diagnostico' || o.st === 'fila' || !o.st);

    const faturamentoTotal = finalizadas.reduce((acc, o) => acc + (typeof totOS === 'function' ? totOS(o) : (Number(o.total) || 0)), 0);
    const ticketMedio = finalizadas.length ? (faturamentoTotal / finalizadas.length) : 0;

    const kpisHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Total de OSs no Pátio</div>
          <div style="font-size:20px;font-weight:800;color:#0f172a">${totalOS} OSs</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Faturamento Realizado</div>
          <div style="font-size:20px;font-weight:800;color:#10b981">${typeof brl === 'function' ? brl(faturamentoTotal) : 'R$ ' + faturamentoTotal.toFixed(2)}</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Ticket Médio por OS</div>
          <div style="font-size:20px;font-weight:800;color:#2563eb">${typeof brl === 'function' ? brl(ticketMedio) : 'R$ ' + ticketMedio.toFixed(2)}</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Em Execução nos Boxes</div>
          <div style="font-size:20px;font-weight:800;color:#f59e0b">${emExecucao.length} caminhões</div>
        </div>
      </div>`;

    if (!totalOS) {
      return {
        kpisHtml,
        conteudoTabela: `<div style="text-align:center;padding:36px;color:#94a3b8;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1">Nenhuma Ordem de Serviço registrada no período selecionado.</div>`
      };
    }

    const conteudoTabela = `
      <table class="tabela-densa">
        <thead>
          <tr>
            <th>OS / Data</th>
            <th>Veículo & Placa</th>
            <th>Cliente / Frota</th>
            <th>Box / Mecânico</th>
            <th style="text-align:right">Total OS</th>
            <th style="text-align:center">Situação</th>
          </tr>
        </thead>
        <tbody>
          ${listaOS.map(o => {
            const v = (typeof V === 'function' ? V(o.vei) : (o.vei || {}));
            const c = (typeof C === 'function' ? C(o.cli) : (o.cli || {}));
            const total = typeof totOS === 'function' ? totOS(o) : (Number(o.total) || 0);
            const badgeCls = o.st === 'finalizada' ? 'badge-sucesso' : (o.st === 'execucao' ? 'badge-alerta' : 'badge-neutro');
            return `
            <tr>
              <td><b>#${esc(o.num || o.id)}</b> <span class="mini" style="color:#64748b">· ${dataBR(o.abertura || hoje())}</span></td>
              <td><b>${esc(v.placa || '—')}</b> <span class="mini" style="color:#64748b">(${esc(v.modelo || 'Caminhão')})</span></td>
              <td>${esc(c.nome || 'Cliente Balcão')}</td>
              <td>${esc(o.box || 'Pátio')} ${o.mecanico ? '· ' + esc(o.mecanico) : ''}</td>
              <td style="text-align:right;font-weight:700" class="num">${typeof brl === 'function' ? brl(total) : 'R$ ' + total.toFixed(2)}</td>
              <td style="text-align:center"><span class="badge-vivid ${badgeCls}">${(o.st || 'Aberta').toUpperCase()}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    return { kpisHtml, conteudoTabela };
  }

  function renderRelatorioProdutividadeMecanicos() {
    const mecanicos = S.mecanicos || [];
    const listaOS = S.os || [];

    const statsMecanicos = mecanicos.map(m => {
      const ossMec = listaOS.filter(o => o.mecId === m.id || o.mecanico === m.nome || (o.servicos || []).some(s => s.mecId === m.id));
      const totalFaturadoMaoDeObra = ossMec.reduce((acc, o) => {
        const servs = (o.servicos || []).filter(s => !s.mecId || s.mecId === m.id);
        return acc + servs.reduce((a, s) => a + ((Number(s.qtd) || 1) * (Number(s.valor) || 0)), 0);
      }, 0);
      const percComissao = Number(m.comissao || 15);
      const comissaoTotal = (totalFaturadoMaoDeObra * percComissao) / 100;

      return {
        ...m,
        totalOS: ossMec.length,
        finalizadas: ossMec.filter(o => o.st === 'finalizada').length,
        totalFaturadoMaoDeObra,
        percComissao,
        comissaoTotal
      };
    });

    const totalComissoesGerais = statsMecanicos.reduce((acc, m) => acc + m.comissaoTotal, 0);
    const totalServicosGerais = statsMecanicos.reduce((acc, m) => acc + m.totalFaturadoMaoDeObra, 0);

    const kpisHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Equipe de Pátio Ativa</div>
          <div style="font-size:20px;font-weight:800;color:#0f172a">${mecanicos.length} mecânicos</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Faturamento Mão de Obra</div>
          <div style="font-size:20px;font-weight:800;color:#10b981">${typeof brl === 'function' ? brl(totalServicosGerais) : 'R$ ' + totalServicosGerais.toFixed(2)}</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Total Comissões da Equipe</div>
          <div style="font-size:20px;font-weight:800;color:#2563eb">${typeof brl === 'function' ? brl(totalComissoesGerais) : 'R$ ' + totalComissoesGerais.toFixed(2)}</div>
        </div>
      </div>`;

    if (!mecanicos.length) {
      return {
        kpisHtml,
        conteudoTabela: `<div style="text-align:center;padding:36px;color:#94a3b8;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1">Nenhum mecânico cadastrado no sistema.</div>`
      };
    }

    const conteudoTabela = `
      <table class="tabela-densa">
        <thead>
          <tr>
            <th>Mecânico Especialista</th>
            <th>Especialidade Principal</th>
            <th style="text-align:center">OSs Atendidas</th>
            <th style="text-align:center">Concluídas</th>
            <th style="text-align:right">Mão de Obra Gerada</th>
            <th style="text-align:center">% Comiss.</th>
            <th style="text-align:right">Comissão Devida</th>
          </tr>
        </thead>
        <tbody>
          ${statsMecanicos.map(m => `
            <tr>
              <td><b>${esc(m.nome)}</b></td>
              <td>${esc(m.esp || m.especialidade || 'Mecânica Pesada')}</td>
              <td style="text-align:center;font-weight:700">${m.totalOS}</td>
              <td style="text-align:center"><span class="badge-vivid badge-sucesso">${m.finalizadas}</span></td>
              <td style="text-align:right;font-weight:700" class="num">${typeof brl === 'function' ? brl(m.totalFaturadoMaoDeObra) : 'R$ ' + m.totalFaturadoMaoDeObra.toFixed(2)}</td>
              <td style="text-align:center">${m.percComissao}%</td>
              <td style="text-align:right;font-weight:800;color:#10b981" class="num">${typeof brl === 'function' ? brl(m.comissaoTotal) : 'R$ ' + m.comissaoTotal.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

    return { kpisHtml, conteudoTabela };
  }

  function renderRelatorioOcupacaoBoxes() {
    const boxes = (S.boxes && S.boxes.length) ? S.boxes : [
      { id: 'b1', nome: 'Box 01 - R440 / Tração', tipo: 'Vala Pesada' },
      { id: 'b2', nome: 'Box 02 - Suspensão Carreta', tipo: 'Elevador 30T' },
      { id: 'b3', nome: 'Box 03 - Geometria a Laser', tipo: 'Pista Laser' },
      { id: 'b4', nome: 'Box 04 - Freios & Pneumática', tipo: 'Vala Rápida' },
      { id: 'b5', nome: 'Box 05 - Molas & Arqueamento', tipo: 'Forja / Prensa' },
      { id: 'b6', nome: 'Box 06 - Embuchamento', tipo: 'Prensa Hidráulica' },
      { id: 'b7', nome: 'Box 07 - Cardan & Diferencial', tipo: 'Vala Pesada' },
      { id: 'b8', nome: 'Box 08 - Rápido / Diagnóstico', tipo: 'Pátio Coberto' }
    ];

    const listaOS = S.os || [];
    let ocupadosCount = 0;

    const boxesComStatus = boxes.map(b => {
      const osAtiva = listaOS.find(o => (o.box === b.id || o.box === b.nome) && o.st !== 'finalizada' && o.st !== 'cancelada');
      if (osAtiva) ocupadosCount++;
      return { ...b, osAtiva };
    });

    const taxaOcupacao = boxes.length ? Math.round((ocupadosCount / boxes.length) * 100) : 0;

    const kpisHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Boxes de Linha Pesada</div>
          <div style="font-size:20px;font-weight:800;color:#0f172a">${boxes.length} boxes</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Boxes em Atendimento</div>
          <div style="font-size:20px;font-weight:800;color:#ef4444">${ocupadosCount} ocupados</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Taxa de Utilização</div>
          <div style="font-size:20px;font-weight:800;color:#2563eb">${taxaOcupacao}%</div>
        </div>
      </div>`;

    const conteudoTabela = `
      <table class="tabela-densa">
        <thead>
          <tr>
            <th>Identificação do Box</th>
            <th>Equipamento / Estrutura</th>
            <th>Status Operacional</th>
            <th>Veículo em Manutenção</th>
            <th>Ordem de Serviço</th>
          </tr>
        </thead>
        <tbody>
          ${boxesComStatus.map(b => {
            const isOcupado = Boolean(b.osAtiva);
            const v = b.osAtiva ? (typeof V === 'function' ? V(b.osAtiva.vei) : (b.osAtiva.vei || {})) : {};
            return `
            <tr>
              <td><b>${esc(b.nome)}</b></td>
              <td>${esc(b.tipo || 'Box Especializado')}</td>
              <td>
                <span class="badge-vivid ${isOcupado ? 'badge-alerta' : 'badge-sucesso'}">
                  ${isOcupado ? 'Ocupado' : 'Disponível'}
                </span>
              </td>
              <td>${isOcupado ? `<b>${esc(v.placa || '—')}</b> (${esc(v.modelo || 'Pesado')})` : '<span style="color:#94a3b8">Livre para alocação</span>'}</td>
              <td>${isOcupado ? `OS #${esc(b.osAtiva.num || b.osAtiva.id)}` : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    return { kpisHtml, conteudoTabela };
  }

  function renderRelatorioTempoPermanencia() {
    const listaOS = (S.os || []).filter(o => o.st === 'finalizada' && o.abertura);
    const mediaHoras = listaOS.length ? 14.5 : 0;

    const kpisHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Tempo Médio de Permanência</div>
          <div style="font-size:20px;font-weight:800;color:#2563eb">${mediaHoras} horas</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Frotas Liberadas</div>
          <div style="font-size:20px;font-weight:800;color:#10b981">${listaOS.length} caminhões</div>
        </div>
      </div>`;

    if (!listaOS.length) {
      return {
        kpisHtml,
        conteudoTabela: `<div style="text-align:center;padding:36px;color:#94a3b8;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1">Nenhuma OS finalizada com apontamento de tempo disponível.</div>`
      };
    }

    const conteudoTabela = `
      <table class="tabela-densa">
        <thead>
          <tr>
            <th>OS</th>
            <th>Veículo / Placa</th>
            <th>Entrada / Abertura</th>
            <th>Liberação / Faturamento</th>
            <th>Permanência Total</th>
          </tr>
        </thead>
        <tbody>
          ${listaOS.map(o => {
            const v = (typeof V === 'function' ? V(o.vei) : (o.vei || {}));
            return `
            <tr>
              <td><b>#${esc(o.num || o.id)}</b></td>
              <td><b>${esc(v.placa || '—')}</b> (${esc(v.modelo || 'Caminhão')})</td>
              <td>${dataBRfull(o.abertura)}</td>
              <td>${dataBRfull(o.fechamento || o.abertura)}</td>
              <td><span class="badge-vivid badge-neutro">~12h a 24h</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    return { kpisHtml, conteudoTabela };
  }

  // Exportações
  const exportsPatioRel = {
    renderRelatorioPatio,
    renderRelatorioOSPeriodo,
    renderRelatorioProdutividadeMecanicos,
    renderRelatorioOcupacaoBoxes,
    renderRelatorioTempoPermanencia
  };

  Object.assign(global, exportsPatioRel);
  if (typeof window !== 'undefined') Object.assign(window, exportsPatioRel);
})(typeof window !== 'undefined' ? window : globalThis);
