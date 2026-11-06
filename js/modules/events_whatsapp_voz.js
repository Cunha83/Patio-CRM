/**
 * Módulo: events_whatsapp_voz.js
 * Pátio-CRM — Handlers de Eventos: WhatsApp Webhook, Campanhas, Relatórios Executivos e Assistente de Voz
 * Arquitetura Modular (< 350 linhas).
 */

function tratarEventosWhatsAppVoz(a, b, e, o) {
  switch (a) {
    case 'aba-zap':
      S.ui.abaZap = b.dataset.k;
      render();
      return true;

    case 'liga-zap':
      S.zap.ativo = !S.zap.ativo;
      salvar(); render();
      return true;

    case 'ver-api':
      abrirFolha(folhaAPI);
      return true;

    case 'conectar-wpp':
    case 'recarregar-qr-wpp': {
      S.ui.wppStatus = { status: 'carregando' };
      abrirFolha(folhaConectarWpp);
      fetch('/api/whatsapp/status')
        .then(r => r.json())
        .then(data => {
          S.ui.wppStatus = data;
          if (folhaAtual === folhaConectarWpp) renderFolha();
        })
        .catch(() => {
          S.ui.wppStatus = { status: 'erro' };
          if (folhaAtual === folhaConectarWpp) renderFolha();
        });
      return true;
    }

    case 'disparar-camp': {
      const camp = S.ui.camp || {};
      const lista = destinatarios(camp.seg);
      if (!lista.length) { torrar('Nenhum destinatário nesse segmento'); return true; }
      if (!camp.texto) { torrar('Escreva a mensagem da campanha'); return true; }
      S.ui.disparo = { nome: camp.nome || 'Campanha', seg: camp.seg, texto: camp.texto, lista, ix: 0, enviados: 0 };
      abrirFolha(folhaDisparo);
      return true;
    }

    case 'disparo-enviar': {
      const d = S.ui.disparo, cli = d.lista[d.ix];
      registrarEnvio({ chave: 'camp_' + cli.id + '_' + Date.now(), tipo: 'campanha', rotulo: d.nome, cliente: cli.nome, fone: cli.fone, texto: preencher(d.texto, ctxCliente(cli)), status: 'enviado' });
      d.enviados++; d.ix++; renderFolha();
      return true;
    }

    case 'disparo-pular':
      S.ui.disparo.ix++;
      renderFolha();
      return true;

    case 'fechar-disparo': {
      const d = S.ui.disparo;
      if (d && d.enviados) S.zap.campanhas.push({ id: uid('cp'), nome: d.nome, seg: d.seg, data: hoje(), enviados: d.enviados });
      S.ui.disparo = null; fecharFolha(); render();
      return true;
    }

    case 'add-regra':
      S.zap.regua.push({ id: uid('r'), quando: 5, ativo: true, nome: 'Nova Etapa de Cobrança', texto: 'Olá {contato}, sobre o título de {valor} vencido em {venc}: consegue nos dar uma posição? Obrigado, {empresa}.' });
      salvar(); render();
      return true;

    case 'rm-regra':
      S.zap.regua = S.zap.regua.filter(x => x.id !== b.dataset.i);
      salvar(); render();
      return true;

    case 'copiar-cob': {
      const k = b.dataset.k;
      const fila = typeof filaCobrancaHoje === 'function' ? filaCobrancaHoje() : [];
      const item = fila.find(x => x.chave === k);
      if (item && item.texto) {
        copiar(item.texto);
        torrar('Texto da cobrança copiado com sucesso!', 'sucesso');
      } else {
        torrar('Item de cobrança não localizado.', 'alerta');
      }
      return true;
    }

    case 'pular-cob': {
      const k = b.dataset.k;
      if (k) {
        S.zap = S.zap || {};
        S.zap.enviadosHoje = S.zap.enviadosHoje || {};
        S.zap.enviadosHoje[k] = 'pulado';
        salvar(); render();
        torrar('Lembrete de cobrança pulado hoje.', 'neutro');
      }
      return true;
    }

    case 'enviar-cob': {
      const k = b.dataset.k;
      if (k) {
        S.zap = S.zap || {};
        S.zap.enviadosHoje = S.zap.enviadosHoje || {};
        S.zap.enviadosHoje[k] = hoje();
        salvar();
        setTimeout(render, 500);
      }
      return true;
    }

    case 'copiar-camp':
      copiar(S.ui.camp.texto);
      torrar('Texto copiado!');
      return true;

    case 'copiar-var':
      copiar(b.dataset.v);
      torrar(b.dataset.v + ' copiado');
      return true;

    case 'limpar-hist':
      pedirConfirmacao('hist', 'Toque de novo para limpar o histórico', () => { S.zap.envios = []; salvar(); render(); });
      return true;

    case 'preview-relatorio-admin': {
      torrar('Carregando prévia do relatório executivo...');
      fetch('/api/whatsapp/relatorio-preview')
        .then(r => r.json())
        .then(data => {
          if (data && data.mensagensAdmin) {
            const txt = data.mensagensAdmin.join('\n\n════════════════════════════\n\n');
            abrirFolha(() => folhaRelatorioPreview(txt));
          } else if (data && data.texto) {
            abrirFolha(() => folhaRelatorioPreview(data.texto));
          } else {
            torrar('Erro ao compilar prévia do relatório.');
          }
        })
        .catch(() => torrar('Erro de comunicação com o servidor.'));
      return true;
    }

    case 'preview-relatorio-operacao': {
      torrar('Carregando prévia operacional...');
      fetch('/api/whatsapp/relatorio-preview')
        .then(r => r.json())
        .then(data => {
          if (data && data.mensagensOperacao) {
            const txt = data.mensagensOperacao.join('\n\n════════════════════════════\n\n');
            abrirFolha(() => folhaRelatorioOperacaoPreview(txt));
          } else {
            torrar('Erro ao compilar prévia operacional.');
          }
        })
        .catch(() => torrar('Erro de comunicação com o servidor.'));
      return true;
    }

    case 'ver-imagem-preview':
      abrirFolha(() => folhaImagemPreview());
      return true;

    case 'disparar-grupo-admin': {
      torrar('Disparando relatório completo + JPG para Grupo Admin...');
      const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : {};
      fetch('/api/whatsapp/disparar-grupo/admin', { method: 'POST', headers })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) torrar('✅ Relatório executivo e Imagem JPG enviados com sucesso ao Grupo de Administração!');
          else torrar(`⚠️ ${data?.error || 'Falha ao enviar para o Grupo de Administração.'}`);
        })
        .catch(() => torrar('Erro ao solicitar disparo ao servidor.'));
      return true;
    }

    case 'disparar-grupo-operacao': {
      torrar('Disparando relatório sem finanças para Grupo Operação...');
      const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : {};
      fetch('/api/whatsapp/disparar-grupo/operacao', { method: 'POST', headers })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) torrar('✅ Relatório operacional enviado com sucesso ao Grupo de Operação!');
          else torrar(`⚠️ ${data?.error || 'Falha ao enviar para o Grupo de Operação.'}`);
        })
        .catch(() => torrar('Erro ao solicitar disparo ao servidor.'));
      return true;
    }

    case 'atualizar-grupos-wpp': {
      torrar('Buscando grupos no WhatsApp Web...');
      const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : {};
      fetch('/api/whatsapp/grupos', { headers })
        .then(r => r.json())
        .then(d => {
          if (d && d.grupos) {
            S.ui.gruposWpp = d.grupos;
            S.ui.gruposWppCarregados = true;
            torrar(`✅ ${d.grupos.length} grupos sincronizados com sucesso!`);
            render();
          } else {
            torrar(`⚠️ ${d?.error || 'Não foi possível listar os grupos.'}`);
          }
        })
        .catch(() => torrar('Erro ao consultar grupos no servidor.'));
      return true;
    }

    case 'salvar-config-grupos': {
      const gAdminInput = document.getElementById('cfg_grupo_admin_id');
      const gOpInput = document.getElementById('cfg_grupo_op_id');
      const horaInput = document.getElementById('cfg_hora_relatorio');
      const autoInput = document.getElementById('cfg_auto_envio');
      const diasUteisInput = document.getElementById('cfg_apenas_dias_uteis');
      const apenasGruposInput = document.getElementById('cfg_responder_apenas_grupos');

      const gAdminId = (gAdminInput ? gAdminInput.value : '').trim();
      const gOpId = (gOpInput ? gOpInput.value : '').trim();
      const horaStr = horaInput ? horaInput.value : '07:30';
      const autoBool = autoInput ? autoInput.checked : true;
      const diasUteisBool = diasUteisInput ? diasUteisInput.checked : true;
      const apenasGruposBool = apenasGruposInput ? apenasGruposInput.checked : true;

      S.cfg = S.cfg || {};
      S.cfg.grupoAdminId = gAdminId;
      S.cfg.grupoOperacaoId = gOpId;
      S.cfg.horaRelatorioDiario = horaStr;
      S.cfg.envioAutomaticoRelatorio = autoBool;
      S.cfg.relatorioApenasDiasUteis = diasUteisBool;
      S.cfg.responderApenasGrupos = apenasGruposBool;
      salvar();

      const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
      fetch('/api/whatsapp/config-grupos', {
        method: 'POST',
        headers,
        body: JSON.stringify({ grupoAdminId: gAdminId, grupoOperacaoId: gOpId, horaRelatorio: horaStr, envioAutomatico: autoBool, apenasDiasUteis: diasUteisBool, responderApenasGrupos: apenasGruposBool })
      }).then(r => r.json()).then(() => { torrar('Configurações dos grupos salvas com sucesso!'); render(); }).catch(() => { torrar('Salvo localmente!'); render(); });
      return true;
    }

    case 'disparar-relatorio-admin': {
      torrar('Disparando relatório executivo aos administradores...');
      const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
      fetch('/api/whatsapp/disparar-relatorio-admin', { method: 'POST', headers, body: JSON.stringify({}) })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) torrar(`✅ Relatório enviado com sucesso para ${data.totalEnviados} administrador(es)!`);
          else torrar(`⚠️ ${data?.error || 'Não foi possível enviar o relatório via WhatsApp.'}`);
        })
        .catch(() => torrar('Erro ao solicitar disparo ao servidor.'));
      return true;
    }

    case 'salvar-config-relatorio': {
      const fonesInput = document.getElementById('cfg_admin_fones');
      const horaInput = document.getElementById('cfg_hora_relatorio');
      const autoInput = document.getElementById('cfg_auto_envio');
      const fonesStr = fonesInput ? fonesInput.value : '';
      const horaStr = horaInput ? horaInput.value : '08:00';
      const autoBool = autoInput ? autoInput.checked : true;
      const fonesArr = fonesStr.split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean);

      S.cfg = S.cfg || {};
      S.cfg.adminFones = fonesArr;
      S.cfg.horaRelatorioDiario = horaStr;
      S.cfg.envioAutomaticoRelatorio = autoBool;
      salvar();

      const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
      fetch('/api/whatsapp/config-relatorio', { method: 'POST', headers, body: JSON.stringify({ adminFones: fonesArr, horaRelatorio: horaStr, envioAutomatico: autoBool }) })
        .then(r => r.json()).then(() => { torrar('Configurações do relatório salvas com sucesso!'); render(); }).catch(() => { torrar('Salvo localmente!'); render(); });
      return true;
    }

    case 'copiar-texto-relatorio': {
      const txt = b.dataset.txt;
      if (txt) { copiar(txt); torrar('Texto do relatório copiado!'); }
      return true;
    }

    default:
      return false;
  }
}

function tratarChangeWhatsAppVoz(a, el, e, o) {
  if (a === 'liga-regra') {
    const id = el.dataset.i;
    const r = (S.zap && S.zap.regua ? S.zap.regua : []).find(x => x.id === id);
    if (r) {
      r.ativo = el.checked;
      salvar(); render();
      torrar(`Regra "${r.nome}" ${r.ativo ? 'ativada' : 'desativada'}.`, 'sucesso');
    }
    return true;
  }

  if (a === 'camp-modelo') {
    const m = S.zap.modelos[+el.value];
    if (m) { S.ui.camp = S.ui.camp || {}; S.ui.camp.texto = m.texto; S.ui.camp.nome = m.nome; render(); }
    return true;
  }

  if (a === 'cfg-assistente') {
    (S.cfg.assistente = S.cfg.assistente || {})[el.dataset.c] = el.value;
    salvar(); render();
    return true;
  }

  if (a === 'cfg-assistente-bool') {
    (S.cfg.assistente = S.cfg.assistente || {})[el.dataset.c] = el.checked;
    salvar(); render();
    return true;
  }

  return false;
}

if (typeof window !== 'undefined') {
  window.tratarEventosWhatsAppVoz = tratarEventosWhatsAppVoz;
  window.tratarChangeWhatsAppVoz = tratarChangeWhatsAppVoz;
}
if (typeof globalThis !== 'undefined') {
  globalThis.tratarEventosWhatsAppVoz = tratarEventosWhatsAppVoz;
  globalThis.tratarChangeWhatsAppVoz = tratarChangeWhatsAppVoz;
}

