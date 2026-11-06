'use strict';

/**
 * Catálogo Técnico de Domínios de Triagem da Linha Pesada
 */

const DOMINIOS_TRIAGEM = {
  SUSPENSAO: {
    codigo: 'SUSPENSAO',
    nome: 'Suspensão e Eixos',
    termos: ['suspensao', 'suspensão', 'mola', 'molas', 'bucha', 'buchas', 'eixo', 'embuchamento', 'feixe', 'arqueamento', 'pino', 'manga', 'batendo'],
    perguntas: [
      {
        id: 'q_susp_condicao',
        campo: 'condicoes',
        texto: 'Essa pancada ou ruído acontece mais passando em buracos ou esterçando com o veículo parado?',
        tipo: 'condicao'
      },
      {
        id: 'q_susp_regiao',
        campo: 'regiao',
        texto: 'Em qual eixo e lado você nota mais o problema (dianteiro, traseiro, direito ou esquerdo)?',
        tipo: 'regiao'
      }
    ]
  },
  FREIOS: {
    codigo: 'FREIOS',
    nome: 'Sistema de Freios',
    termos: ['freio', 'freios', 'pastilha', 'lona', 'cuica', 'cuíca', 'disco', 'tambor', 'chiando', 'apitando', 'pedal'],
    perguntas: [
      {
        id: 'q_freio_condicao',
        campo: 'condicoes',
        texto: 'O ruído ou chiado acontece apenas quando aciona o freio ou de forma contínua rodando?',
        tipo: 'condicao'
      },
      {
        id: 'q_freio_lado',
        campo: 'puxando',
        texto: 'Você nota o caminhão puxando para algum lado ao frear?',
        tipo: 'lado'
      }
    ]
  },
  DIRECAO: {
    codigo: 'DIRECAO',
    nome: 'Direção e Alinhamento',
    termos: ['direcao', 'direção', 'alinhamento', 'geometria', 'volante', 'puxando', 'trepidando', 'vibrando'],
    perguntas: [
      {
        id: 'q_dir_condicao',
        campo: 'condicoes',
        texto: 'O problema acontece o tempo todo ou principalmente em velocidades mais altas?',
        tipo: 'condicao'
      },
      {
        id: 'q_dir_volante',
        campo: 'volante',
        texto: 'O volante fica desalinhado em linha reta ou apresenta folga perceptível?',
        tipo: 'volante'
      }
    ]
  },
  TRANSMISSAO: {
    codigo: 'TRANSMISSAO',
    nome: 'Transmissão, Cardan e Diferencial',
    termos: ['cambio', 'câmbio', 'marcha', 'embreagem', 'cardan', 'diferencial', 'cruzeta', 'patinando', 'tranco', 'ronco'],
    perguntas: [
      {
        id: 'q_transm_condicao',
        campo: 'condicoes',
        texto: 'O sintoma se manifesta ao engatar a marcha, ao soltar a embreagem ou tracionando em subidas?',
        tipo: 'condicao'
      }
    ]
  },
  MOTOR: {
    codigo: 'MOTOR',
    nome: 'Motor e Arrefecimento',
    termos: ['motor', 'fumaca', 'fumaça', 'aquecendo', 'fervendo', 'falhando', 'potencia', 'potência', 'fraco'],
    perguntas: [
      {
        id: 'q_motor_condicao',
        campo: 'condicoes',
        texto: 'Apresenta fumaça visível (preta, branca ou azul) ou perda de força em subidas?',
        tipo: 'condicao'
      }
    ]
  },
  PNEUS: {
    codigo: 'PNEUS',
    nome: 'Pneus e Rodas',
    termos: ['pneu', 'pneus', 'roda', 'rodas', 'desgaste irregular', 'escamação', 'ombro'],
    perguntas: [
      {
        id: 'q_pneu_desgaste',
        campo: 'desgaste',
        texto: 'O desgaste anormal é no ombro interno, externo ou em escamação ao redor do pneu?',
        tipo: 'desgaste'
      }
    ]
  },
  ELETRICA: {
    codigo: 'ELETRICA',
    nome: 'Sistema Elétrico',
    termos: ['eletrica', 'elétrica', 'luz', 'farol', 'painel', 'bateria', 'alternador', 'partida', 'chicote'],
    perguntas: [
      {
        id: 'q_elet_condicao',
        campo: 'condicoes',
        texto: 'A falha ocorre na partida, na iluminação ou acendeu alguma luz de advertência no painel?',
        tipo: 'condicao'
      }
    ]
  },
  OUTROS: {
    codigo: 'OUTROS',
    nome: 'Geral e Acessórios',
    termos: [],
    perguntas: [
      {
        id: 'q_geral_condicao',
        campo: 'condicoes',
        texto: 'Quando esse problema começou a ser percebido e com que frequência ele ocorre?',
        tipo: 'condicao'
      }
    ]
  }
};

module.exports = {
  DOMINIOS_TRIAGEM
};
