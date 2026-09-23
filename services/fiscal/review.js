'use strict';
const { get, run, transaction } = require('../../db');
const { getFiscalConfig, validateCNPJ } = require('./fiscalConfigService');
function requireFields(obj, fields, label) {
  for (const field of fields) if (obj[field] === undefined || obj[field] === null || obj[field] === '') throw new Error(`${label}: informe ${field}.`);
}
function profile(config, model) { return config.regrasTributarias.find(r => r.modelo === model && r.tipo === 'documento') || {}; }
function buildPayload(doc, config) {
  requireFields(config, ['cnpj','razaoSocial','uf','codigoMunicipioIbge','regimeTributario'], 'Emitente');
  if (!validateCNPJ(config.cnpj)) throw new Error('CNPJ numérico inválido. CNPJ alfanumérico ainda não suportado nesta versão.');
  const rule = profile(config, doc.modelo);
  requireFields(rule, ['versao','validadoPor','vigenteDesde','vigenteAte','reformaValidada'], 'Perfil fiscal');
  if (rule.reformaValidada !== true || new Date(rule.vigenteDesde) > new Date() || new Date(rule.vigenteAte) < new Date() || !Number.isFinite(Date.parse(rule.vigenteDesde)) || !Number.isFinite(Date.parse(rule.vigenteAte))) throw new Error('Perfil fiscal sem revisão vigente.');
  requireFields(rule, ['cnpj','uf','municipio','regime','numeracaoValidada'], 'Cobertura do perfil');
  if (rule.cnpj !== config.cnpj || rule.uf !== config.uf || rule.municipio !== config.codigoMunicipioIbge || rule.regime !== config.regimeTributario || rule.numeracaoValidada !== true) throw new Error('Perfil não validado para este estabelecimento, regime e numeração.');
  if (doc.itens.some(it=>!it.fiscalInput)) throw new Error('Revise os dados fiscais dos itens legados.');
  const dest = doc.destinatario;
  requireFields(dest, ['documento','nome','logradouro','numero','bairro','municipio','uf','cep','codigoMunicipio'], 'Destinatário');
  const id = String(dest.documento).replace(/\D/g,'');
  if (![11,14].includes(id.length)) throw new Error('Documento do destinatário inválido.');
  const extra = rule.campos || {};
  if (doc.modelo === '55') {
    requireFields(extra, ['natureza_operacao','tipo_documento','finalidade_emissao','local_destino','consumidor_final','presenca_comprador','modalidade_frete'], 'Operação NF-e');
    requireFields(dest, ['indicadorIE'], 'Destinatário');
    requireFields(config, ['inscricaoEstadual'], 'Emitente');
    if (String(extra.tipo_documento)!=='1' || String(extra.finalidade_emissao)!=='1') throw new Error('Cobertura inicial: saída normal. Devolução, ajuste e complemento não homologados.');
    const items = doc.itens.map((it, i) => {
      requireFields(it.fiscalInput,['aliquotaICMS','aliquotaPIS','aliquotaCOFINS','aliquotaCBS','aliquotaIBS'], 'Alíquotas expressas do item');
      for(const key of ['aliquotaICMS','aliquotaPIS','aliquotaCOFINS','aliquotaCBS','aliquotaIBS']) if(!Number.isFinite(Number(it.fiscalInput[key])) || Number(it.fiscalInput[key])<0 || Number(it.fiscalInput[key])>100) throw new Error('Alíquota inválida.');
      if (it.reformaTributaria.valorCBS || it.reformaTributaria.valorIBS) throw new Error('RTC com débito: mapeamento e contrato pendentes de homologação para este regime.');
      requireFields(it, ['ncm','cfop','origem','cstPIS','cstCOFINS','unidade'], `Item ${i+1}`);
      if (!/^\d{8}$/.test(it.ncm) || !/^\d{4}$/.test(it.cfop)) throw new Error('NCM ou CFOP com formato inválido.');
      const code = config.regimeTributario === 'simples_nacional' ? it.csosn : it.cstICMS;
      if (!(config.regimeTributario === 'simples_nacional' ? ['102','103','300','400'] : ['00','40','41']).includes(code)) throw new Error('Tratamento de ICMS fora da cobertura inicial.');
      if (it.valorICMSST || it.valorIPI) throw new Error('ICMS-ST calculado e IPI exigem ampliação e homologação específica.');
      return { ...(it.camposProvedor || {}), numero_item:i+1, codigo_produto:it.codigoInterno, descricao:it.descricao,
        codigo_ncm:it.ncm, cfop:it.cfop, unidade_comercial:it.unidade, unidade_tributavel:it.unidade,
        quantidade_comercial:it.quantidade, quantidade_tributavel:it.quantidade,
        valor_unitario_comercial:it.valorUnitario, valor_unitario_tributavel:it.valorUnitario, valor_bruto:it.valorBruto,
        valor_desconto:it.desconto, valor_frete:it.frete, valor_outras_despesas:it.outrasDespesas,
        icms_origem:it.origem, icms_situacao_tributaria:code, icms_base_calculo:it.baseICMS, icms_aliquota:it.aliquotaICMS, icms_valor:it.valorICMS,
        pis_situacao_tributaria:it.cstPIS, pis_base_calculo:it.basePIS, pis_aliquota_porcentual:it.aliquotaPIS, pis_valor:it.valorPIS,
        cofins_situacao_tributaria:it.cstCOFINS, cofins_base_calculo:it.baseCOFINS, cofins_aliquota_porcentual:it.aliquotaCOFINS, cofins_valor:it.valorCOFINS };
    });
    return { ...extra, cnpj_emitente:config.cnpj, data_emissao:new Date().toISOString(), nome_destinatario:dest.nome,
      [id.length===14?'cnpj_destinatario':'cpf_destinatario']:id, indicador_inscricao_estadual_destinatario:dest.indicadorIE,
      inscricao_estadual_destinatario:dest.inscricaoEstadual || undefined, logradouro_destinatario:dest.logradouro,
      numero_destinatario:dest.numero,bairro_destinatario:dest.bairro,municipio_destinatario:dest.municipio,uf_destinatario:dest.uf,cep_destinatario:dest.cep,
      valor_produtos:doc.totais.valorProdutos,valor_total:doc.totais.valorTotalDocumento,valor_desconto:doc.totais.desconto,valor_frete:doc.totais.frete,valor_outras_despesas:doc.totais.outrasDespesas,items };
  }
  if (doc.modelo !== 'NFS-e' || rule.padrao !== 'municipal') throw new Error('Confirme e homologue o padrão municipal. NFS-e Nacional requer adaptador próprio.');
  requireFields(config, ['inscricaoMunicipal'], 'Emitente');
  requireFields(extra, ['natureza_operacao','optante_simples_nacional'], 'Operação NFS-e');
  const it = doc.itens[0];
  for(const item of doc.itens) requireFields(item.fiscalInput,['aliquotaISS','issRetido'],'Parâmetros expressos de ISS');
  requireFields(rule.servico || {},['codigo_municipio'],'Local de incidência validado');
  requireFields(it, ['itemListaServico','codigoTributacaoMunicipio','aliquotaISS'], 'Serviço');
  if (doc.itens.some(x => x.itemListaServico !== it.itemListaServico || x.aliquotaISS !== it.aliquotaISS || x.issRetido !== it.issRetido || x.codigoTributacaoMunicipio !== it.codigoTributacaoMunicipio)) throw new Error('Separe serviços com tratamentos fiscais diferentes.');
  return { ...extra, data_emissao:new Date().toISOString(), prestador:{cnpj:config.cnpj,inscricao_municipal:config.inscricaoMunicipal,codigo_municipio:config.codigoMunicipioIbge},
    tomador:{[id.length===14?'cnpj':'cpf']:id,razao_social:dest.nome,endereco:{logradouro:dest.logradouro,numero:dest.numero,bairro:dest.bairro,codigo_municipio:dest.codigoMunicipio,uf:dest.uf,cep:dest.cep}},
    servico:{ ...(rule.servico || {}), discriminacao:doc.itens.map(x=>x.descricao).join('; '),item_lista_servico:it.itemListaServico,codigo_tributario_municipio:it.codigoTributacaoMunicipio,codigo_municipio:rule.servico.codigo_municipio,
      valor_servicos:doc.totais.valorServicos,desconto_incondicionado:doc.totais.desconto,aliquota:it.aliquotaISS,iss_retido:it.issRetido } };
}
async function reviewDocument({documentId,tenantId,actorId}) {
  return transaction(async()=>{
    const row=await get('SELECT * FROM fiscal_documents WHERE id=? AND tenant_id=?',[documentId,tenantId]);
    if (!row || row.status!=='rascunho') throw new Error('Somente rascunhos podem ser revisados.');
    const config=await getFiscalConfig(tenantId);
    const doc=require('./fiscalLifecycleService').formatarDocumento(row);
    const payload=buildPayload(doc,config);
    const snapshot={...config}; delete snapshot.providerToken;delete snapshot.certA1Base64;delete snapshot.certPassword;
    await run('UPDATE fiscal_documents SET config_snapshot_json=?,provider_payload_json=?,reviewed_at=?,reviewed_by=? WHERE id=? AND tenant_id=?',[JSON.stringify(snapshot),JSON.stringify(payload),new Date().toISOString(),actorId,documentId,tenantId]);
    await run("INSERT INTO security_audit_log(id,tenant_id,actor_id,actor_type,action,entity,entity_id,details_json,created_at) VALUES(?,?,?,'user','FISCAL_REVIEWED','fiscal_document',?,'{}',?)",[require('crypto').randomUUID(),tenantId,actorId,documentId,new Date().toISOString()]);
    return {ok:true,documentId};
  });
}
module.exports={buildPayload,reviewDocument};
