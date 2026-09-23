# Guia Rápido de Operação do Piloto — Pátio CRM

Instruções objetivas para os 3 perfis autorizados para o piloto controlado de 5 dias úteis.

---

## 1. Instruções para o Atendimento / Consultor de Pátio (Perfil: `atendente`)

### 1.1 Cadastro de Cliente
1. Acesse o menu lateral **Cadastros & Frotas** > **Clientes**.
2. Clique em **Novo Cliente**.
3. Digite a Razão Social/Nome, CNPJ/CPF, Telefone e Endereço.
4. Clique em **Salvar Cliente**.  
   *(Nota: Se clicar em "Consultar CNPJ", o sistema exibirá aviso de consulta externa indisponível. Basta preencher os dados reais informados pelo cliente).*

### 1.2 Entrada de Veículo e Abertura de OS
1. No menu **Pátio & Boxes**, clique no botão **Nova OS**.
2. Digite a **Placa** do caminhão (padrão Mercosul ou antigo de 7 letras/dígitos).
3. Selecione o **Cliente** já cadastrado.
4. Escolha o **Box disponível** onde o veículo estacionou (ex.: Box 01, Box 02).
5. Digite o **KM atual do painel** e descreva a **Queixa do Motorista** (ex.: "Mola mestra partida, barulho no eixo dianteiro").
6. Clique em **Criar OS**. O veículo aparecerá imediatamente no grid do pátio.

### 1.3 Inserção de Serviços e Peças
1. Na visualização da OS, selecione a aba **Serviços** ou **Peças**.
2. Clique em **Adicionar**.
3. Utilize o seletor modal com busca para encontrar o serviço ou peça cadastrada.
4. Confirme a inclusão. O valor total da OS é atualizado automaticamente.

---

## 2. Instruções para o Mecânico / Técnico de Box (Perfil: `mecanico`)

### 2.1 Visualização das OSs do Box
1. Ao acessar o sistema com seu usuário mecânico, você verá o painel de trabalho simplificado.
2. Todas as cifras financeiras (R$, preços de venda e margens) ficam **ocultadas**.
3. Localize o veículo alocado no seu box.

### 2.2 Apontamento de Execução
1. Clique no botão de **Iniciar Atendimento**. O status passará para `executando`.
2. Caso precise parar para almoço ou aguardar peça, clique em **Pausar**.
3. Ao retornar, clique em **Retomar**.
4. Ao concluir o reparo de molas/suspensão, clique em **Concluir Serviço**.

### 2.3 Requisição de Peças
1. Se durante a desmontagem constatar a necessidade de troca de buchas, pinos ou lâminas extras, vá até a aba de **Peças da OS**.
2. Selecione a peça necessária no catálogo e clique em **Requisitar/Reservar**.
3. O almoxarifado recebe a reserva sem que você precise digitar valores monetários.

---

## 3. Instruções para o Gestor / Administrador da Oficina (Perfil: `tenant_admin`)

### 3.1 Acompanhamento em Tempo Real
1. O painel inicial exibe a ocupação de boxes, veículos em espera e produtividade de cada mecânico.
2. Se um box estiver com veículo atrasado, você pode remanejá-lo arrastando o card ou editando o box da OS.

### 3.2 Conferência e Faturamento da OS
1. Quando o mecânico marcar a OS como concluída, acesse a OS.
2. Como gestor, você verá todos os valores detalhados de mão de obra e peças, além do custo real e margem bruta.
3. Se desejar imprimir a via física para o motorista assinar, clique em **Imprimir OS**.
4. Clique em **Faturar & Entregar**, confirme as condições de pagamento combinadas e finalize. O veículo é liberado do box e os títulos vão para o financeiro gerencial.

### 3.3 Uso do Assistente de Voz no Navegador
1. Para agilizar consultas na mesa de atendimento, clique no botão de **Microfone** (canto superior direito).
2. Exemplos de perguntas aceitas:
   - *"Qual o saldo atual do caixa?"*
   - *"Quais os próximos vencimentos a pagar?"*
   - *"Tem lâmina de mola do Constellation no estoque?"*
   - *"Como cadastrar um cliente?"*
3. Para ações críticas via voz (ex.: excluir OS), o sistema solicitará confirmação com botão de segurança na tela.
