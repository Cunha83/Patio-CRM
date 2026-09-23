'use strict';
const { sanitize } = require('../support/privacy');
const endpoints = { '55': 'nfe', 'NFS-e': 'nfse' };
function fault(message, code = 'FISCAL_CONFIG') { return Object.assign(new Error(message), { code }); }
async function boundedBody(response,limit) {
  const chunks=[];let size=0;
  if(response.body && response.body[Symbol.asyncIterator]) {
    for await(const chunk of response.body) {size+=chunk.length;if(size>limit)throw fault('Resposta acima do limite.','FISCAL_RESPONSE');chunks.push(Buffer.from(chunk));}
    return Buffer.concat(chunks);
  }
  const bytes=Buffer.from(await response.text());if(bytes.length>limit)throw fault('Resposta acima do limite.','FISCAL_RESPONSE');return bytes;
}
class FocusNFeAdapter {
  constructor(token, ambiente = 'homologacao', { transport = global.fetch } = {}) {
    if (ambiente !== 'homologacao') throw fault('Produção fiscal bloqueada até homologação e liberação específica.');
    if (!token) throw fault('Token de homologação Focus não configurado.');
    this.name = 'focus_nfe'; this.token = token; this.transport = transport;
    this.baseUrl = 'https://homologacao.focusnfe.com.br';
  }
  endpoint(doc) {
    if (!endpoints[doc.modelo]) throw fault('Modelo fiscal não implementado neste adaptador.');
    return `/v2/${endpoints[doc.modelo]}`;
  }
  reference(doc) { return encodeURIComponent(`fisc_${doc.id}`); }
  async request(route, method = 'GET', body) {
    const response = await this.transport(this.baseUrl + route, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Basic ' + Buffer.from(this.token + ':').toString('base64'), 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = (await boundedBody(response,1000000)).toString('utf8');
    if (text.length > 1000000) throw fault('Resposta do provedor acima do limite.', 'FISCAL_RESPONSE');
    let data; try { data = JSON.parse(text); } catch (_) { throw fault('Resposta inválida do provedor.', 'FISCAL_RESPONSE'); }
    if (!response.ok) throw fault(`Provedor recusou a solicitação (HTTP ${response.status}). Consulte a situação antes de reenviar.`, 'FISCAL_HTTP');
    return data;
  }
  normalize(data, doc) {
    const states = { autorizado: 'autorizado', cancelado: 'cancelado', erro_autorizacao: 'rejeitado', processando_autorizacao: 'processando', cancelamento_solicitado: 'processando' };
    let status = states[data.status] || 'processando';
    const key = data.chave_nfe ? String(data.chave_nfe).replace(/^NFe/,'') : data.codigo_verificacao || null;
    if (status === 'autorizado' && !(doc.modelo === '55' ? /^\d{44}$/.test(key || '') : data.numero && key)) status = 'processando';
    return { ok: ['autorizado', 'cancelado'].includes(status), status,
      chaveAcesso: key, protocolo: data.protocolo || data.protocolo_autorizacao || null,
      codigoStatus: data.status_sefaz ? String(data.status_sefaz) : null,
      motivoStatus: sanitize(String(data.mensagem_sefaz || data.mensagem || (Array.isArray(data.erros)?data.erros.map(e=>String(e.codigo||'')+': '+String(e.mensagem||'')).join('; '):null) || data.status || 'Situação externa não confirmada')).slice(0, 1000),
      xmlPath: data.caminho_xml_nota_fiscal || null, danfeUrl: data.caminho_danfe || data.url_danfse || null,
      cancelXmlPath:data.caminho_xml_cancelamento || null, correctionXmlPath:data.caminho_xml_carta_correcao || null, correctionSequence:data.numero_carta_correcao || null, remoteNumber: data.numero || null };
  }
  async emitirDocumento({ doc, config }) {
    if (!doc.providerPayload || !doc.reviewedAt) throw fault('Documento exige composição e revisão fiscal antes da transmissão.');
    const payload = structuredClone(doc.providerPayload);
    if (doc.modelo === '55') { payload.numero = doc.numero; payload.serie = doc.serie; payload.cnpj_emitente = config.cnpj; }
    else { payload.numero_rps=doc.numero; payload.serie_rps=doc.serie; payload.prestador = { ...payload.prestador, cnpj: config.cnpj, inscricao_municipal: config.inscricaoMunicipal }; }
    return this.normalize(await this.request(`${this.endpoint(doc)}?ref=${this.reference(doc)}`, 'POST', payload), doc);
  }
  async consultarSituacao({ doc }) { return this.normalize(await this.request(`${this.endpoint(doc)}/${this.reference(doc)}?completa=1`), doc); }
  async cancelarDocumento({ doc, justificativa }) {
    if (justificativa.length < 15 || justificativa.length > 255) throw fault('Justificativa deve ter de 15 a 255 caracteres.');
    const data = await this.request(`${this.endpoint(doc)}/${this.reference(doc)}`, 'DELETE', { justificativa });
    const result = this.normalize(data, doc);
    const event = await this.eventArtifact(data.caminho_xml_cancelamento,doc,'110111');
    return { ...result, ...event, ok: result.status === 'cancelado' && Boolean(event.protocol), protocoloCancelamento: event.protocol || data.protocolo || null };
  }
  async enviarCCE({ doc, correcao }) {
    if (doc.modelo !== '55') throw fault('Carta de correção disponível apenas para NF-e neste adaptador.');
    const data = await this.request(`${this.endpoint(doc)}/${this.reference(doc)}/carta_correcao`, 'POST', { correcao });
    const event=await this.eventArtifact(data.caminho_xml_carta_correcao,doc,'110110');
    return { ...event, ok:data.status==='autorizado' && Boolean(event.protocol), protocoloCCE:event.protocol, sequencial:data.numero_carta_correcao, codigoStatus:data.status_sefaz, motivoStatus:sanitize(String(data.mensagem_sefaz || data.status || 'Evento pendente')) };
  }
  async eventArtifact(remotePath,doc,type) {
    if(!remotePath) return {};
    const xml=await this.downloadXml(remotePath);
    if(doc.modelo==='55' && (!xml.includes(doc.chaveAcesso) || !xml.includes(type))) throw fault('Evento XML não corresponde ao documento.');
    const protocol=xml.match(/<(?:\w+:)?nProt>(\d+)<\//)?.[1];
    return {xml,xmlSha256:require('crypto').createHash('sha256').update(xml).digest('hex'),protocol,xmlPath:remotePath};
  }
  async downloadPdf(remotePath) {
    const url=new URL(remotePath,this.baseUrl);
    if(url.origin!==this.baseUrl || url.username || url.password || !url.pathname.endsWith('.pdf')) throw fault('PDF externo exige cobertura específica.');
    const response=await this.transport(url.href,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(this.token+':').toString('base64')}});
    if(!response.ok)throw fault('PDF indisponível no provedor.');
    const bytes=await boundedBody(response,10000000);
    if(bytes.subarray(0,5).toString()!=='%PDF-')throw fault('Representação auxiliar inválida.');
    return bytes;
  }
  async downloadXml(remotePath) {
    const url = new URL(remotePath, this.baseUrl);
    if (url.origin !== this.baseUrl || url.username || url.password || !url.pathname.endsWith('.xml')) throw fault('Origem de documento fiscal não permitida.');
    const response = await this.transport(url.href, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Basic ' + Buffer.from(this.token + ':').toString('base64') } });
    if (!response.ok) throw fault('Documento XML indisponível no provedor.');
    const text = await response.text();
    if (Buffer.byteLength(text) > 5000000 || /<!DOCTYPE|<!ENTITY/i.test(text) || !/<(?:\w+:)?(?:nfeProc|Nfse|CompNfse|NFSe|procEventoNFe)/i.test(text)) throw fault('XML recusado por formato ou segurança.');
    return text;
  }
}
function getFiscalProviderAdapter(name, token, ambiente) {
  if (name === 'focus_nfe') return new FocusNFeAdapter(token, ambiente);
  if (name === 'mock_homologacao' && process.env.NODE_TEST_CONTEXT && process.env.FISCAL_TEST_ADAPTER === 'enabled' && ambiente === 'homologacao') return new (require('../../tests/helpers/fiscalMock.cjs').MockHomologacaoAdapter)();
  throw fault('Configure um provedor fiscal real. Simulação não é homologação.');
}
module.exports = { FocusNFeAdapter, getFiscalProviderAdapter };
