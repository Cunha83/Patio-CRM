# Design Spec: Painel de KPIs eGestor, Cadastros Completos, Compras com XML e Vendas

**Data:** 2026-10-22  
**Autor:** Antigravity AI  
**Status:** Aprovado para Implementação  

---

## 1. Contexto e Objetivos

O Pátio CRM é um sistema de gestão para oficinas de veículos pesados (molas, freios, suspensões, eixos e mecânica pesada). O usuário identificou que:
1. Ao tentar carregar a Logo e a Imagem Institucional no cadastro da empresa, não era possível carregar nem persistir as imagens.
2. Os menus do WhatsApp, Painel de KPIs, Almoxarifado e Financeiro não abriam ao clicar ("não abre nada").
3. O módulo de Cadastros possuía apenas o botão de "Novo Cliente", sem navegação para os demais cadastros essenciais da oficina.
4. É necessário implementar os fluxos completos com vínculos reais baseados no modelo de ERP *eGestor* enviado nos anexos:
   - **Painel Inicial de KPIs:** 4 cards de topo (contas a receber e a pagar hoje e na semana/mês), gráfico de vendas por categoria, gráfico faturamento x quantidade, DRE consolidado, alertas e top produtos.
   - **Compras com Importação de XML:** Grid de compras, lançamento de notas e leitura de XML da NF-e com entrada no estoque e geração de títulos a pagar.
   - **Vendas de Produtos e Serviços:** Grid de vendas, situação (Em espera, Finalizada, Entregue), baixa de peças no almoxarifado e geração de títulos a receber.
   - **Cadastros Integrados:** Clientes, Veículos/Frotas, Fornecedores, Peças por Categoria, Serviços, Mecânicos e Empresa com Logo e Imagem Institucional.

---

## 2. Diagnóstico Técnico dos Erros

### 2.1. Exceções Não Tratadas em `emAberto()` e `saldoCaixa()`
- Em `js/state.js`, as funções `emAberto(tipo)` e `saldoCaixa()` executavam:
  ```javascript
  const emAberto = (tipo) => S.contas.filter(c => c.tipo === tipo && !c.pago);
  const saldoCaixa = () => ... soma(S.movimentos.filter(...)) ...
  ```
- No estado limpo ou em tenants sem essas coleções inicializadas, `S.contas` e `S.movimentos` eram `undefined`, gerando `Uncaught TypeError: Cannot read properties of undefined (reading 'filter')`.
- Isso quebrava o ciclo de renderização de `viewPainelInicial()`, `viewFinanceiro()` e `viewMensagens()`.

### 2.2. Falta de Upload e Persistência de Logo e Imagem Institucional
- Em `js/cadastros.js`, `viewEmpresa()` continha apenas um input de arquivo local sem integração com os endpoints `/api/configuracoes/empresa/logo` e `/api/configuracoes/empresa/imagem-institucional` e sem suporte ao campo de Imagem Institucional.

### 2.3. Roteamento de Cadastros
- Em `js/app.js` no `boot()`, `S.ui.abaCad` estava travado em `'clientes'`, pulando o menu de opções de cadastros e não disponibilizando as abas de navegação direta.

---

## 3. Arquitetura e Estrutura de Módulos

### 3.1. Tratamento de Estado (`js/state.js` e `js/app.js`)
- Inicialização preventiva de coleções:
  `S.contas = S.contas || [];`
  `S.movimentos = S.movimentos || [];`
  `S.compras = S.compras || [];`
  `S.vendas = S.vendas || [];`
  `S.fornecedores = S.fornecedores || [];`
  `S.pecas = S.pecas || [];`
  `S.servicos = S.servicos || [];`
- Unificação de acessos: `emAberto` compatível com `S.contas`, `S.contasReceber` e `S.contasPagar`.

### 3.2. Módulo de Cadastros (`js/cadastros.js` e `js/modules/cadastros_forms.js`)
- Abas superiores fixas:
  - 👥 Clientes
  - 🚛 Veículos / Frotas
  - 🏢 Fornecedores
  - 📦 Produtos & Peças (Categorias: Suspensão, Molas, Freio, Embreagem, Cardan, Embuchamento de Eixo)
  - 🔧 Serviços
  - 👨‍🔧 Mecânicos
  - 🏷️ Boxes do Pátio
  - ⚙️ Geral / Empresa
- Uploads de Logotipo e Imagem Institucional com prévia instantânea, conversão em Base64 / upload para API e remoção segura.

### 3.3. Módulo de Compras com XML (`js/compras.js`)
- Grid de Compras: Cód, Fornecedor, NF, Data, Situação, Total R$.
- Form de Nova Compra:
  - Seleção de Fornecedor, Data, Número da Nota, Despesas externas.
  - Carregador de XML da NF-e:
    - Extração automática de emitente, itens com NCM, quantidade e valores unitários.
    - Atualização do estoque físico no almoxarifado.
    - Lançamento automático das duplicatas no Contas a Pagar.

### 3.4. Módulo de Vendas (`js/vendas.js`)
- Grid de Vendas: Cód, Cliente, Vendedor, Data, Entrega, Tipo, Situação, Total R$.
- Form de Nova Venda:
  - Inclusão de peças e serviços.
  - Baixa de peças no estoque.
  - Lançamento no Contas a Receber.

### 3.5. Painel Inicial / KPIs (`js/app.js`)
- Indicadores superiores:
  - Contas a receber hoje
  - Contas a pagar hoje
  - A receber na semana/mês
  - A pagar na semana/mês
- Gráfico Donut de Vendas por Categoria (Chart.js)
- Gráfico Misto (Barras + Linha) de Faturamento x Quantidade
- Alertas e DRE Consolidado
- Top Produtos por Faturamento

---

## 4. Plano de Verificação e Testes
1. Testes unitários de parsing de XML de NF-e e movimentação de estoque.
2. Testes de renderização sem erros em todas as visões (Painel, Financeiro, WhatsApp, Almoxarifado, Cadastros, Compras, Vendas).
3. Testes da suíte de regressão de comandos e API HTTP.
