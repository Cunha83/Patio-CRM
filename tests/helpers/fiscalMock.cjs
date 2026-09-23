'use strict';

const crypto = require('crypto');

/**
 * Cálculo do Dígito Verificador (Módulo 11) para Chave de Acesso de NF-e
 */
function calcularDVChave44(chave43) {
  let peso = 2;
  let soma = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += parseInt(chave43.charAt(i), 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Monta chave de acesso oficial de 44 dígitos da NF-e
 */
function gerarChaveAcessoNFe({ uf = '35', dataEmissao = new Date(), cnpj, modelo = '55', serie = '1', numero, codigoAleatorio = null }) {
  const cUF = String(uf).padStart(2, '0');
  const d = new Date(dataEmissao);
  const aa = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aamm = `${aa}${mm}`;
  const cnpjLimpo = String(cnpj || '00000000000191').replace(/\D/g, '').padStart(14, '0');
  const mod = String(modelo).padStart(2, '0');
  const ser = String(serie).padStart(3, '0');
  const nNF = String(numero).padStart(9, '0');
  const tpEmis = '1'; // 1 = Emissão normal
  const cNF = (codigoAleatorio || crypto.randomBytes(4).readUInt32BE(0).toString()).slice(0, 8).padStart(8, '0');

  const chave43 = `${cUF}${aamm}${cnpjLimpo}${mod}${ser}${nNF}${tpEmis}${cNF}`;
  const cDV = calcularDVChave44(chave43);
  return `${chave43}${cDV}`;
}

/**
 * Adaptador Oficial de Homologação e Simulação Fidedigna da SEFAZ & NFS-e Nacional
 */
class MockHomologacaoAdapter {
  constructor() {
    this.name = 'mock_homologacao';
  }

  async emitirDocumento({ doc, config }) {
    const isNFe = doc.modelo === '55' || doc.modelo === '65';
    const isServico = doc.modelo === 'NFS-e';
    const agora = new Date().toISOString();

    if (isNFe) {
      const chaveAcesso = gerarChaveAcessoNFe({
        uf: config.uf === 'GO' ? '52' : (config.uf === 'MG' ? '31' : '35'),
        dataEmissao: doc.createdAt || agora,
        cnpj: config.cnpj,
        modelo: doc.modelo,
        serie: doc.serie,
        numero: doc.numero
      });

      const protocolo = `1352600${Math.floor(1000000 + Math.random() * 9000000)}`;

      // Gera XML canônico básico para armazenamento e validação
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${chaveAcesso}" versao="4.00">
      <ide>
        <cUF>${chaveAcesso.substring(0, 2)}</cUF>
        <cNF>${chaveAcesso.substring(35, 43)}</cNF>
        <natOp>VENDA DE MERCADORIA</natOp>
        <mod>${doc.modelo}</mod>
        <serie>${doc.serie}</serie>
        <nNF>${doc.numero}</nNF>
        <dhEmi>${agora}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>${config.codigoMunicipioIbge || '3509502'}</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>${chaveAcesso.substring(43)}</cDV>
        <tpAmb>${doc.ambiente === 'producao' ? '1' : '2'}</tpAmb>
        <finNFe>1</finNFe>
      </ide>
      <emit>
        <CNPJ>${config.cnpj.replace(/\D/g, '')}</CNPJ>
        <xNome>${config.razaoSocial || 'Oficina Mecânica Pesada'}</xNome>
        <IE>${config.inscricaoEstadual || 'ISENTO'}</IE>
        <CRT>${config.regimeTributario === 'simples_nacional' ? '1' : '3'}</CRT>
      </emit>
      <dest>
        <CNPJ>${(doc.destinatario?.documento || '00000000000191').replace(/\D/g, '')}</CNPJ>
        <xNome>${doc.destinatario?.nome || 'Cliente Oficina'}</xNome>
      </dest>
      <total>
        <ICMSTot>
          <vBC>${doc.totais.baseICMS || 0}</vBC>
          <vICMS>${doc.totais.valorICMS || 0}</vICMS>
          <vProd>${doc.totais.valorProdutos || 0}</vProd>
          <vNF>${doc.totais.valorTotalDocumento || 0}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>${doc.ambiente === 'producao' ? '1' : '2'}</tpAmb>
      <verAplic>SP_NFE_PL_009</verAplic>
      <chNFe>${chaveAcesso}</chNFe>
      <dhRecbto>${agora}</dhRecbto>
      <nProt>${protocolo}</nProt>
      <digVal>${crypto.createHash('sha1').update(chaveAcesso).digest('base64')}</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;

      return {
        ok: true,
        status: 'autorizado',
        chaveAcesso,
        protocolo,
        dataAutorizacao: agora,
        codigoStatus: '100',
        motivoStatus: 'Autorizado o uso da NF-e',
        xmlOficial: xml,
        danfeUrl: `/api/fiscal/documentos/${doc.id}/danfe`
      };
    }

    if (isServico) {
      const protocolo = `NFS2609${Math.floor(100000 + Math.random() * 900000)}`;
      const codigoVerificacao = crypto.randomBytes(4).toString('hex').toUpperCase();

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseResposta xmlns="http://www.abrasf.org.br/nfse.xsd">
  <ListaNfse>
    <CompNfse>
      <Nfse versao="2.04">
        <InfNfse Id="NFSE_${doc.numero}">
          <Numero>${doc.numero}</Numero>
          <CodigoVerificacao>${codigoVerificacao}</CodigoVerificacao>
          <DataEmissao>${agora}</DataEmissao>
          <IdentificacaoRps>
            <Numero>${doc.numero}</Numero>
            <Serie>${doc.serie}</Serie>
            <Tipo>1</Tipo>
          </IdentificacaoRps>
          <ValoresNfse>
            <ValorServicos>${doc.totais.valorServicos || 0}</ValorServicos>
            <ValorIss>${doc.totais.valorISS || 0}</ValorIss>
            <Aliquota>${doc.itens[0]?.aliquotaISS || 5.0}</Aliquota>
            <ValorLiquidoNfse>${doc.totais.valorTotalDocumento || 0}</ValorLiquidoNfse>
          </ValoresNfse>
          <PrestadorServico>
            <IdentificacaoPrestador>
              <CpfCnpj><Cnpj>${config.cnpj.replace(/\D/g, '')}</Cnpj></CpfCnpj>
              <InscricaoMunicipal>${config.inscricaoMunicipal || '12345'}</InscricaoMunicipal>
            </IdentificacaoPrestador>
          </PrestadorServico>
          <TomadorServico>
            <IdentificacaoTomador>
              <CpfCnpj><Cnpj>${(doc.destinatario?.documento || '00000000000191').replace(/\D/g, '')}</Cnpj></CpfCnpj>
            </IdentificacaoTomador>
            <RazaoSocial>${doc.destinatario?.nome || 'Cliente Oficina'}</RazaoSocial>
          </TomadorServico>
        </InfNfse>
      </Nfse>
    </CompNfse>
  </ListaNfse>
</GerarNfseResposta>`;

      return {
        ok: true,
        status: 'autorizado',
        chaveAcesso: codigoVerificacao,
        protocolo,
        dataAutorizacao: agora,
        codigoStatus: '100',
        motivoStatus: 'NFS-e emitida com sucesso',
        xmlOficial: xml,
        danfeUrl: `/api/fiscal/documentos/${doc.id}/danfe`
      };
    }

    throw new Error(`Modelo de documento não suportado: ${doc.modelo}`);
  }

  async consultarSituacao({ doc, config }) {
    if (doc.status === 'autorizado') {
      return {
        ok: true,
        status: 'autorizado',
        codigoStatus: '100',
        motivoStatus: 'Autorizado o uso do documento fiscal',
        chaveAcesso: doc.chaveAcesso,
        protocolo: doc.protocoloAutorizacao
      };
    }
    return {
      ok: true,
      status: doc.status,
      codigoStatus: doc.codigoStatusSefaz || '100',
      motivoStatus: doc.motivoStatusSefaz || 'Situação regular'
    };
  }

  async cancelarDocumento({ doc, justificativa, config }) {
    if (!justificativa || justificativa.trim().length < 15) {
      throw new Error('Justificativa de cancelamento deve possuir no mínimo 15 caracteres.');
    }
    const protocoloCanc = `1352600999${Math.floor(1000 + Math.random() * 9000)}`;
    const agora = new Date().toISOString();

    return {
      ok: true,
      status: 'cancelado',
      protocoloCancelamento: protocoloCanc,
      dataCancelamento: agora,
      codigoStatus: '101',
      motivoStatus: 'Cancelamento de documento fiscal homologado com sucesso'
    };
  }

  async enviarCCE({ doc, correcao, sequencial = 1, config }) {
    if (!correcao || correcao.trim().length < 15) {
      throw new Error('Texto da Carta de Correção deve possuir no mínimo 15 caracteres.');
    }
    const protocoloCCE = `1352600888${Math.floor(1000 + Math.random() * 9000)}`;
    const agora = new Date().toISOString();

    return {
      ok: true,
      status: 'autorizado',
      protocoloCCE,
      sequencial,
      dataEvento: agora,
      codigoStatus: '135',
      motivoStatus: 'Evento registrado e vinculado a NF-e'
    };
  }
}


module.exports = { MockHomologacaoAdapter, calcularDVChave44, gerarChaveAcessoNFe };
