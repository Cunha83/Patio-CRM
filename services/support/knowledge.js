'use strict';

// Conteúdo revisável. Não carregue README, código, .env ou dados de oficinas como prompts.
const VERSION = '2026-09-14.1';
const articles = [
  {
    id: 'ordens', title: 'Encontrar uma ordem de serviço',
    keywords: ['ordem de servico', 'os', 'patio', 'box', 'boxes', 'placa', 'fila'],
    answer: 'No Pátio, procure pela placa e confira o filtro de situação. Uma OS pode estar na fila, em execução, aguardando aprovação, parada por peça ou finalizada. Se não encontrar, informe o nome da tela e o filtro usado, sem enviar dados pessoais do cliente.',
    sources: ['js/patio.js'],
  },
  {
    id: 'sincronizacao', title: 'Alterações pendentes ou conflito ao salvar',
    keywords: ['sincronizacao', 'salvar', 'salvou', 'rascunho', 'conflito', '409', 'pendente', 'sumiu'],
    answer: 'Se houver aviso de alterações pendentes, mantenha a página aberta e use “Exportar minhas alterações” para preservar o rascunho. Confira a conexão antes de tentar salvar novamente. “Usar dados do servidor” descarta alterações locais: só prossiga após preservar o rascunho e revisar o conflito. Se o aviso continuar, encaminhe ao suporte o horário e o texto do erro, sem anexar a base de dados.',
    sources: ['js/state.js', 'js/sync.js'],
  },
  {
    id: 'estoque', title: 'Estoque físico, reservado e disponível',
    keywords: ['estoque', 'peca', 'reservado', 'disponivel', 'almoxarifado', 'saldo'],
    answer: 'O estoque diferencia quantidade física, reservada para ordens de serviço e disponível. Confira a peça e as OS relacionadas antes de solicitar um ajuste. Uma diferença pode exigir revisão de recebimentos, reservas e devoluções; este atendimento não modifica saldos nem confirma a causa sem análise.',
    sources: ['js/estoque.js', 'services/inventoryService.js'],
  },
  {
    id: 'compras', title: 'Acompanhar compras e recebimentos',
    keywords: ['compra', 'compras', 'cotacao', 'fornecedor', 'pedido', 'recebimento'],
    answer: 'O fluxo de compras reúne necessidade de peça, cotação, pedido, aprovação e recebimento. Confira a situação do pedido e a quantidade já recebida antes de registrar outra entrada. O recebimento pode ser parcial. Divergências de valor, fornecedor ou nota devem ser conferidas pelo responsável por compras.',
    sources: ['services/procurementService.js', 'js/estoque.js'],
  },
  {
    id: 'orcamento', title: 'Orçamentos e aprovação do cliente',
    keywords: ['orcamento', 'aprovacao', 'aprovar', 'link', 'adicional'],
    answer: 'O orçamento possui versões e aprovação por link. Se o cliente não conseguir aprovar, confira se recebeu o link da versão atual e se o prazo de validade terminou. Não envie o link de aprovação neste chat: ele dá acesso ao orçamento. Uma alteração de escopo deve ser revisada pelo responsável antes de novo envio.',
    sources: ['services/quotationService.js', 'public/aprovacao.html'],
  },
  {
    id: 'financeiro', title: 'Entender o resultado gerencial de caixa',
    keywords: ['financeiro', 'dre', 'caixa', 'resultado', 'lucro', 'competencia', 'gerencial'],
    answer: 'O Resultado Gerencial de Caixa usa entradas e saídas realizadas. Ele não substitui a DRE contábil por competência. Para conferir uma diferença, compare o período do relatório com as datas das baixas. Não compartilhe extratos ou dados bancários neste chat; indique apenas a tela e o tipo de divergência.',
    sources: ['js/financeiro.js', 'services/financialEngine.js'],
  },
  {
    id: 'acesso', title: 'Problemas de acesso e permissão',
    keywords: ['acesso', 'login', 'senha', 'permissao', 'bloqueado', '403', '401', 'entrar'],
    answer: 'Confira se está acessando a oficina e o usuário corretos. Mensagens de acesso negado podem exigir revisão das permissões pelo administrador. Não compartilhe senha, chave de API ou código de autenticação. Posso registrar o problema para atendimento humano; não redefino senhas nem amplio permissões por conversa.',
    sources: ['lib/auth/context.js', 'lib/auth/userRepository.js'],
  },
  {
    id: 'whatsapp', title: 'Conexão do WhatsApp',
    keywords: ['whatsapp', 'zap', 'qr', 'mensagem', 'conexao'],
    answer: 'Confira a situação da conexão no painel de WhatsApp do sistema e solicite ao administrador que revise a sessão, se necessário. Não compartilhe QR de conexão ou códigos de verificação neste chat. Se uma mensagem não chegar, informe o horário e o tipo de envio; não envie o número pessoal do destinatário.',
    sources: ['js/whatsapp.js', 'server.js'],
  },
  {
    id: 'assinatura', title: 'Pagamento, plano ou cancelamento',
    keywords: ['assinatura', 'plano', 'cobranca', 'pagamento', 'boleto', 'pix', 'cartao', 'cancelamento', 'estorno'],
    answer: 'Questões sobre pagamento, mudança de plano, estorno ou cancelamento precisam ser conferidas pelo atendimento responsável. Este agente não gera cobranças, confirma pagamentos nem efetua cancelamentos. Informe apenas o tipo de solicitação; não envie cartão, comprovante ou dados bancários.',
    sources: ['services/billing/billingService.js', 'public/assinatura.html'], handoff: true,
  },
  {
    id: 'erp', title: 'Emissão fiscal e integração com ERP',
    keywords: ['erp', 'fiscal', 'nota fiscal', 'nfe', 'nfse', 'tributo', 'imposto', 'ncm', 'omie', 'totvs'],
    answer: 'O Pátio CRM oferece rotinas operacionais e uma API de integração. A existência da API não comprova uma integração ativa com um ERP específico. Emissão de notas e escrituração devem ser verificadas com o ERP e o responsável fiscal. Não atribuo NCM, alíquotas ou validade fiscal por conversa.',
    sources: ['services/erpIntegrationService.js'],
  },
  {
    id: 'backup', title: 'Backup, recuperação ou perda de dados',
    keywords: ['backup', 'restaurar', 'restauracao', 'recuperar', 'apagou', 'perdi', 'perda de dados'],
    answer: 'Para perda de dados ou restauração, preserve a situação atual e solicite atendimento humano antes de importar ou substituir informações. Se houver rascunho no navegador, mantenha a página aberta e exporte suas alterações. Não envie arquivos do banco ou backups neste chat. A recuperação precisa ser validada pelo responsável técnico.',
    sources: ['services/backupService.js', 'js/state.js'], handoff: true,
  },
  {
    id: 'privacidade', title: 'Privacidade e dados pessoais',
    keywords: ['lgpd', 'privacidade', 'dados pessoais', 'anonimizar', 'excluir meus dados', 'titular'],
    answer: 'Solicitações de acesso, correção ou eliminação de dados precisam de verificação de identidade e análise do responsável pelo tratamento. Posso abrir o atendimento para essa avaliação. Não envie documentos de identidade nem dados de terceiros aqui. Abrir o protocolo não significa que dados já foram excluídos.',
    sources: ['services/lgpdService.js'], handoff: true,
  },
  {
    id: 'seguranca', title: 'Suspeita de acesso indevido',
    keywords: ['vazamento', 'invasao', 'invadido', 'fraude', 'acesso indevido', 'dados de outra oficina'],
    answer: 'Vou registrar o caso com prioridade para análise humana. Não compartilhe credenciais ou copie dados de outra oficina. Informe somente a tela, o horário e o que observou. O registro não confirma um incidente e não substitui a avaliação do responsável de segurança.',
    sources: ['services/incidentResponseService.js'], handoff: true, urgent: true,
  },
];

const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function search(query) {
  const text = normalize(query);
  const tokens = new Set(text.match(/[a-z0-9]+/g) || []);
  return articles.map(article => ({ article, score: article.keywords.reduce((score, keyword) => {
    const words = normalize(keyword).split(' ');
    return score + (words.length > 1 ? (text.includes(keyword) ? 4 : 0) : (tokens.has(keyword) ? 2 : 0));
  }, 0) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
}

module.exports = { VERSION, articles, normalize, search };
