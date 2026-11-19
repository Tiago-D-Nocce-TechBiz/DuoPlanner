import type { AnaliseNora, ContextoUsado, EstrategiaId, OpcaoAnalise, PontoDeAtencao } from "./nora-strategies";

/**
 * Lista de conferência de cada estratégia, 100% local e determinística: é o
 * que a Nora devolve quando não dá para chamar a IA (sem chave, cota esgotada,
 * prazo estourado) e quando a pessoa está sem conexão. Não decide nada pelo
 * casal (sem nota e sem veredito): ensina o método e aponta o que conferir,
 * usando o destino e as datas da viagem quando já se sabe.
 *
 * Sem dependências: roda no navegador (offline) e no servidor.
 */

interface Roteiro {
  resumo: (c: ContextoUsado) => string;
  opcoes: OpcaoAnalise[];
  pontos: PontoDeAtencao[];
  recomendacao: (c: ContextoUsado) => string;
  acao: (c: ContextoUsado) => AnaliseNora["acaoSugerida"];
}

const opcao = (titulo: string, detalhe: string, destaque: string | null = null): OpcaoAnalise => ({
  titulo,
  destaque,
  detalhe,
  custoEstimadoBrl: null,
});
const ponto = (gravidade: PontoDeAtencao["gravidade"], titulo: string, detalhe: string): PontoDeAtencao => ({ gravidade, titulo, detalhe });

const para = (c: ContextoUsado) => (c.destino ? ` para ${c.destino}` : "");
const emDestino = (c: ContextoUsado) => (c.destino ? ` em ${c.destino}` : " no destino");
const podeAlertar = (c: ContextoUsado): AnaliseNora["acaoSugerida"] => (c.destino && c.ida ? "criar_alerta_preco" : "salvar_dica_roteiro");

const ROTEIROS: Record<EstrategiaId, Roteiro> = {
  matriz_datas: {
    resumo: (c) => `Sem a IA agora: o método para achar as datas mais baratas${para(c)}.`,
    opcoes: [
      opcao("Mexa ±3 dias na ida e na volta", "Terça, quarta e quinta costumam sair mais baratas que sexta, domingo e segunda.", "Maior efeito"),
      opcao("Teste 1 noite a mais ou a menos", "Mudar a duração em 1 dia muda o dia da semana da volta e, às vezes, o preço."),
      opcao("Fuja de feriados e férias escolares", "Perto de feriado prolongado o preço sobe tanto no voo quanto na hospedagem."),
    ],
    pontos: [
      ponto("info", "Compare a combinação inteira", "Olhe voo + hospedagem juntos: a data mais barata do voo pode ser a mais cara do hotel."),
      ponto("atencao", "Tarifa muda sem aviso", "O preço que você viu há algumas horas pode já ter mudado. Confira na hora de emitir."),
    ],
    recomendacao: (c) =>
      c.ida
        ? `Abra a busca de passagens com ida em ${c.ida} ±3 dias e crie um alerta de preço para a melhor combinação.`
        : "Abra a busca de passagens com uma janela de 7 dias e crie um alerta de preço para a melhor combinação.",
    acao: podeAlertar,
  },
  aeroportos_proximos: {
    resumo: (c) => `Sem a IA agora: como avaliar aeroportos alternativos${para(c)}, até 240 km.`,
    opcoes: [
      opcao("Aeroporto principal da cidade", "É o ponto de comparação: anote o preço do voo e o custo de ir até o hotel."),
      opcao("Aeroportos num raio de até 240 km", "Procure companhias de baixo custo, que costumam usar aeroportos secundários.", "Pode compensar"),
    ],
    pontos: [
      ponto("atencao", "Some o custo de terra", "Trem, ônibus ou transfer entre o aeroporto e a cidade pode comer toda a economia do voo."),
      ponto("atencao", "Horário de chegada e saída", "Voo que chega de madrugada num aeroporto distante pode exigir táxi caro ou uma noite extra."),
      ponto("info", "Bagagem em low cost", "Nessas companhias a mala despachada e a de mão costumam ser cobradas à parte."),
    ],
    recomendacao: (c) => `Compare o total (voo + deslocamento até a cidade${emDestino(c)}) dos 2 ou 3 aeroportos antes de escolher o mais barato.`,
    acao: () => "salvar_dica_roteiro",
  },
  conexoes_inteligentes: {
    resumo: (c) => `Sem a IA agora: o que olhar antes de montar uma conexão por conta própria${para(c)}.`,
    opcoes: [
      opcao("Dois bilhetes separados (self-transfer)", "Costuma ser mais barato, mas cada voo é um contrato à parte.", "Mais barato"),
      opcao("Bilhete único com conexão", "Se o primeiro voo atrasar, a companhia reacomoda vocês sem custo."),
    ],
    pontos: [
      ponto("critico", "Atraso não é coberto", "Perdeu o segundo voo por atraso do primeiro? Em bilhetes separados, o novo bilhete é por sua conta."),
      ponto("critico", "Bagagem e imigração", "Em self-transfer é preciso retirar a mala, passar de novo pelo check-in e, às vezes, pela imigração."),
      ponto("atencao", "Visto de trânsito", "Confira se a conexão exige visto ou autorização, mesmo sem sair do aeroporto."),
      ponto("atencao", "Margem de tempo", "Deixe pelo menos 4 a 6 horas entre os voos; menos que isso é aposta."),
    ],
    recomendacao: () => "Só compense o self-transfer se a economia for grande e a margem entre os voos for de várias horas. Na dúvida, fique com o bilhete único.",
    acao: () => "salvar_dica_roteiro",
  },
  auditoria_voo: {
    resumo: (c) => `Sem a IA agora: a lista para auditar a tarifa do voo${para(c)}. Confira cada item no site da companhia.`,
    opcoes: [],
    pontos: [
      ponto("atencao", "Bagagem despachada", "A tarifa mais barata muitas vezes não inclui mala. Some o valor da bagagem de vocês dois."),
      ponto("atencao", "Marcação de assento", "Casal que quer sentar junto pode pagar para marcar. Veja o valor antes de fechar."),
      ponto("atencao", "Remarcação e cancelamento", "Tarifas promocionais costumam cobrar caro (ou não permitem) mudar a data."),
      ponto("info", "Duração e escalas", "Compare o tempo total da viagem: uma economia pequena não vale uma conexão de 10 horas."),
      ponto("info", "Horários", "Voos de madrugada exigem transporte noturno; some esse custo."),
    ],
    recomendacao: () => "Calcule o preço final: tarifa + mala dos dois + assento. Compare esse total, não o preço anunciado.",
    acao: podeAlertar,
  },
  verificacao_taxas: {
    resumo: (c) => `Sem a IA agora: as taxas que mais pegam o casal de surpresa${emDestino(c)}.`,
    opcoes: [],
    pontos: [
      ponto("critico", "Resort fee / taxa de destino", "Cobrada no check-in, em moeda local, e raramente aparece no preço da reserva."),
      ponto("atencao", "City tax (taxa turística)", "Cobrada por pessoa e por noite em muitas cidades europeias, no pagamento no local."),
      ponto("atencao", "Bagagem em voo", "Mala despachada e de mão podem ser cobradas à parte, ida e volta."),
      ponto("atencao", "Traslado aeroporto–hotel", "Táxi e transfer pesam no orçamento; pesquise o transporte público antes."),
      ponto("info", "IOF e câmbio", "Compras no exterior no cartão têm IOF e spread; simule no Conversor de Moedas do app."),
      ponto("info", "Estacionamento e Wi-Fi", "Em alguns hotéis são cobrados por dia."),
    ],
    recomendacao: () => "Antes de reservar, leia a seção de taxas e políticas da hospedagem e some tudo ao valor da diária.",
    acao: () => "salvar_dica_roteiro",
  },
  escolha_bairros: {
    resumo: (c) => `Sem a IA agora: o que comparar para escolher o bairro${emDestino(c)}.`,
    opcoes: [
      opcao("Perto do transporte", "Estação de metrô ou trem a pé: economiza táxi e tempo todos os dias.", "Prático"),
      opcao("Perto do que vocês mais querem ver", "Hospedagem central custa mais por noite, mas reduz o gasto com deslocamento."),
      opcao("Bairro residencial bem avaliado", "Costuma ser mais barato e tranquilo; confirme a distância até o centro."),
    ],
    pontos: [
      ponto("atencao", "Segurança à noite", "Leia avaliações recentes e confira o trajeto da estação até a porta, à noite."),
      ponto("info", "Mapa de calor das avaliações", "Notas por localização, nas avaliações dos hóspedes, mostram bem o bairro."),
    ],
    recomendacao: () => "Escolha 3 bairros, veja a diária média de cada um e a distância até o transporte, e some o custo de deslocamento por dia.",
    acao: () => "salvar_dica_roteiro",
  },
  comparativo_hospedagem: {
    resumo: (c) => `Sem a IA agora: como comparar hotel, Airbnb e apart-hotel${emDestino(c)} pelo custo total.`,
    opcoes: [
      opcao("Hotel", "Café da manhã, limpeza e recepção costumam estar incluídos; confira a taxa de destino."),
      opcao("Airbnb", "Soma taxa de limpeza e taxa de serviço; tem cozinha para economizar em refeições."),
      opcao("Apart-hotel", "Meio-termo: cozinha e serviços de hotel; veja a política de limpeza e de cancelamento."),
    ],
    pontos: [
      ponto("atencao", "Compare o total, não a diária", "Diária + taxa de limpeza + taxa de serviço + taxa de destino, dividido pelas noites."),
      ponto("info", "Cozinha vale dinheiro", "Preparar o café da manhã e alguns jantares reduz bem o gasto com alimentação."),
      ponto("info", "Cancelamento", "Prefira cancelamento grátis até perto da data, enquanto os voos não estiverem fechados."),
    ],
    recomendacao: () => "Monte uma tabela com o custo total de cada opção (estadia + taxas + refeições) e escolha pelo total.",
    acao: () => "salvar_dica_roteiro",
  },
  otimizacao_orcamento: {
    resumo: () => "Sem a IA agora: onde costuma estar o corte de 20% sem perder conforto nem segurança.",
    opcoes: [
      opcao("Hospedagem", "Maior parte do gasto: troque datas, bairro ou tipo de hospedagem antes de cortar passeios.", "Maior efeito"),
      opcao("Alimentação", "Café da manhã incluído e uma refeição principal por dia fora do circuito turístico."),
      opcao("Transporte local", "Passe de transporte por dias no lugar de táxi e aplicativo."),
      opcao("Passeios", "Misture atrações pagas com opções gratuitas (miradouros, feiras, museus de entrada grátis)."),
    ],
    pontos: [
      ponto("critico", "O que não cortar", "Seguro viagem, transporte seguro à noite e margem de tempo nas conexões."),
      ponto("info", "Revise os gastos lançados", "Use o DuoFinance para ver a categoria que mais pesa."),
    ],
    recomendacao: () => "Comece pela maior categoria do DuoFinance e corte 20% nela antes de mexer nas outras.",
    acao: () => "salvar_dica_roteiro",
  },
  veredito_reserva: {
    resumo: (c) => `Sem a IA agora: a lista para decidir se reservam${para(c)} ou esperam. A decisão é de vocês.`,
    opcoes: [
      opcao("Reserve agora se...", "o preço está dentro do orçamento, o cancelamento é gratuito e as datas estão fechadas.", "Reserve"),
      opcao("Espere se...", "há folga até a data, o preço está acima do que costuma ser e vocês podem criar um alerta.", "Espere"),
      opcao("Mude de plano se...", "o total (com taxas) passa do orçamento mesmo nas melhores datas.", "Mude"),
    ],
    pontos: [
      ponto("atencao", "Confirme o total", "Some bagagem, assento e taxas locais ao preço anunciado."),
      ponto("info", "Sem prazo para decidir?", "Um alerta de preço avisa por e-mail quando a tarifa cair até o valor que vocês definirem."),
    ],
    recomendacao: (c) =>
      c.destino && c.ida
        ? `Crie um alerta de preço${para(c)} e decidam quando ele disparar, ou reservem se o cancelamento for gratuito.`
        : "Informe destino e datas na busca de passagens para o alerta de preço acompanhar por vocês.",
    acao: podeAlertar,
  },
};

/** A lista de conferência da estratégia, no mesmo formato da análise da IA (sem nota nem veredito). */
export function analiseLocal(id: EstrategiaId, contexto: ContextoUsado): AnaliseNora {
  const r = ROTEIROS[id];
  return {
    resumo: r.resumo(contexto),
    vereditoBadge: null,
    notaCustoBeneficio: null,
    economiaEstimada: null,
    opcoes: r.opcoes,
    pontosDeAtencao: r.pontos,
    recomendacaoPratica: r.recomendacao(contexto),
    acaoSugerida: r.acao(contexto),
    precoAlvoSugeridoBrl: null,
  };
}
