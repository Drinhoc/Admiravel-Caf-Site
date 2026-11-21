// Dados fixos da loja (não são segredos). Preencha uma vez com os dados reais da empresa.
// Tudo que é senha/token fica nas variáveis de ambiente do Netlify (ver docs/COMO-PUBLICAR.md).
export const LOJA = {
  nome: 'Admirável Café',
  email: 'admiravelcafe@gmail.com',
  whatsapp: '5519982207977',

  // Remetente das etiquetas e emitente da NF. CNPJ e endereço vêm do rodapé do site atual; [CONFIRMAR] o que falta.
  remetente: {
    nome: 'Admirável Café',
    razao_social: '[CONFIRMAR razão social do MEI]',
    cnpj: '62774762000100',   // 62.774.762/0001-00
    inscricao_estadual: '',   // só números · [CONFIRMAR] MEI de comércio em SP costuma ter IE
    telefone: '19982207977',
    email: 'admiravelcafe@gmail.com',
    cep: '13480000',          // [CONFIRMAR] CEP exato da Rua Presidente Prudente, 232
    rua: 'Rua Presidente Prudente',
    numero: '232',
    complemento: '',
    bairro: '[CONFIRMAR bairro]',
    cidade: 'Limeira',
    uf: 'SP',
  },

  // Entrega local (hoje no Wix: "Entrega Local" R$ 7, 1 a 4 dias). Faixa de CEP de Limeira.
  entregaLocal: { ativa: true, nome: 'Entrega local em Limeira', preco: 7, prazo: '1 a 4 dias úteis', cepDe: 13480000, cepAte: 13489999 },

  // Serviços do Melhor Envio oferecidos no carrinho: 1 = Correios PAC, 2 = Correios SEDEX.
  // (Jadlog e outras exigem escolher agência; dá para incluir depois.)
  servicosFrete: '1,2',
  // Comprar a etiqueta automaticamente com o saldo da carteira do Melhor Envio quando a NF sair.
  comprarEtiquetaAuto: true,

  // Embalagem padrão quando o produto não tem medidas (cm) — caixa de envio.
  caixaPadrao: { altura: 12, largura: 16, comprimento: 20 },

  // Sem NF automática: 'declaracao' = a etiqueta sai com declaração de conteúdo (MEI vendendo para pessoa física).
  // 'manual' = o dono emite a NF por fora e cola a chave no painel para liberar a etiqueta.
  envioSemNF: 'declaracao',

  // Parcelamento máximo no cartão (só vale para o Mercado Pago; no InfinitePay é configurado no app deles).
  parcelasMax: 3,

  // Regras fiscais da NF-e. [CONFIRMAR TUDO COM O CONTADOR antes de emitir em produção]
  fiscal: {
    natureza_operacao: 'Venda de mercadoria',
    ncm: '09012100',          // café torrado, não descafeinado
    cfop_dentro_estado: '5101', // compra café cru e paga a torrefação (industrialização por encomenda): em geral 5101. Se comprasse já torrado: 5102. [CONTADOR]
    cfop_fora_estado: '6101',   // 6101 / 6102
    icms_situacao_tributaria: '102', // CSOSN 102 (Simples/MEI sem permissão de crédito)
    icms_origem: '0',
    pis_situacao_tributaria: '49',
    cofins_situacao_tributaria: '49',
    unidade: 'UN',
  },
};
