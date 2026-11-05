/**
 * Modelos de e-mail do DuoPlanner (puros e testáveis: sem I/O).
 *
 * Cada modelo devolve assunto, HTML (tabelas e estilos inline, que é o que os
 * clientes de e-mail entendem) e a versão em texto puro. Todo valor dinâmico
 * passa por `escaparHtml`. Nomes digitados por usuários (nome, nome do
 * espaço) são limpos e encurtados: o convite vai para um endereço digitado
 * por outra pessoa, então nada que ela escreva pode virar HTML. Links só
 * entram se forem https (ou http em localhost, para testar).
 */

const COR = {
  fundo: "#EAE7E0",
  cartao: "#FBF9F4",
  texto: "#1C1917",
  titulo: "#12100E",
  suave: "#57534E",
  borda: "#D6CBBA",
  acento: "#181512",
  acentoTexto: "#FAF8F5",
  verde: "#2C5E5A",
};

const FONTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONTE_TITULO = "Georgia, 'Times New Roman', serif";

export interface EmailMontado {
  assunto: string;
  html: string;
  texto: string;
}

/* ------------------------------ utilitários ------------------------------ */

const ENTIDADES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => ENTIDADES[c] ?? c);
}

/** Texto digitado por alguém: sem caracteres de controle, espaços colapsados, curto. */
export function textoLimpo(valor: string, max = 60): string {
  const limpo = valor.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
}

/** Link aceito no e-mail: https, ou http só em localhost (desenvolvimento). */
export function linkSeguro(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return u.toString();
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return u.toString();
    return null;
  } catch {
    return null;
  }
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-12-01" → "01/12". */
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "2026-12-01" → "01/12/2026". */
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/* --------------------------------- blocos -------------------------------- */

const paragrafo = (html: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COR.texto};">${html}</p>`;

const nota = (html: string) =>
  `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${COR.suave};">${html}</p>`;

const subtitulo = (texto: string) =>
  `<p style="margin:18px 0 8px;font-size:12px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:${COR.suave};">${escaparHtml(texto)}</p>`;

function botao(rotulo: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr><td style="border-radius:12px;background:${COR.acento};"><a href="${escaparHtml(url)}" style="display:inline-block;padding:12px 22px;font-family:${FONTE};font-size:14px;font-weight:bold;color:${COR.acentoTexto};text-decoration:none;border-radius:12px;">${escaparHtml(rotulo)}</a></td></tr></table>`;
}

const link = (rotulo: string, url: string) =>
  `<a href="${escaparHtml(url)}" style="color:${COR.verde};text-decoration:underline;">${escaparHtml(rotulo)}</a>`;

/** Linhas "rótulo ........ valor" (valores já formatados, escapados aqui). */
function tabelaValores(linhas: { rotulo: string; valor: string; forte?: boolean }[]): string {
  const tr = linhas
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:${COR.texto};${l.forte ? "font-weight:bold;" : ""}">${escaparHtml(l.rotulo)}</td><td align="right" style="padding:6px 0;font-size:14px;color:${COR.titulo};white-space:nowrap;${l.forte ? "font-weight:bold;" : ""}">${escaparHtml(l.valor)}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border-top:1px solid ${COR.borda};border-bottom:1px solid ${COR.borda};">${tr}</table>`;
}

function moldura(m: { preheader: string; titulo: string; corpo: string; rodape: string }): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escaparHtml(m.titulo)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escaparHtml(m.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.fundo};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COR.cartao};border:1px solid ${COR.borda};border-radius:16px;">
<tr><td style="padding:28px 28px 10px;font-family:${FONTE};">
<p style="margin:0 0 18px;font-family:${FONTE_TITULO};font-size:17px;font-weight:bold;color:${COR.titulo};">DuoPlanner</p>
<h1 style="margin:0 0 14px;font-family:${FONTE_TITULO};font-size:23px;line-height:1.3;color:${COR.titulo};">${escaparHtml(m.titulo)}</h1>
${m.corpo}
</td></tr>
<tr><td style="padding:14px 28px 26px;font-family:${FONTE};font-size:12px;line-height:1.5;color:${COR.suave};border-top:1px solid ${COR.borda};">${m.rodape}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const saudacao = (nome: string) => {
  const limpo = textoLimpo(nome, 40);
  return limpo ? `Olá, ${limpo}!` : "Olá!";
};

/* ------------------------- (a) alerta de queda de preço ------------------------- */

export interface DadosEmailAlerta {
  nome: string;
  tipo: "voo" | "hospedagem";
  origem: string;
  destino: string;
  ida: string;
  volta: string | null;
  adultos: number;
  precoAtual: number;
  precoAlvo: number;
  /** Preço do aviso anterior (para mostrar quanto caiu desde então). */
  precoAnterior: number | null;
  /** Ex.: "LATAM · voo direto" ou "Hotel Mar Azul · nota 8,9". */
  detalhe: string | null;
  /** Deep link da oferta no parceiro (Kiwi.com, Booking.com...). */
  linkOferta: string | null;
  /** O alerta aberto no DuoPlanner. */
  linkAlerta: string;
  linkPreferencias: string;
}

export function emailAlertaPreco(d: DadosEmailAlerta): EmailMontado {
  const destino = textoLimpo(d.destino, 60);
  const origem = textoLimpo(d.origem, 60);
  const voo = d.tipo === "voo";
  const rota = voo ? `${origem} → ${destino}` : `hospedagem em ${destino}`;
  const rotaTitulo = voo ? `${origem} → ${destino}` : `Hospedagem em ${destino}`;
  const datas = d.volta ? `${diaMes(d.ida)} a ${diaMes(d.volta)}` : diaMes(d.ida);
  const pessoas = voo
    ? d.adultos === 1 ? "1 viajante" : `${d.adultos} viajantes`
    : d.adultos === 1 ? "1 hóspede" : `${d.adultos} hóspedes`;
  const relacaoAlvo = d.precoAtual < d.precoAlvo ? `abaixo do seu alvo de ${brl(d.precoAlvo)}` : `no seu alvo de ${brl(d.precoAlvo)}`;
  const queda =
    d.precoAnterior !== null && d.precoAnterior > d.precoAtual
      ? Math.round((1 - d.precoAtual / d.precoAnterior) * 100)
      : null;
  const oferta = linkSeguro(d.linkOferta);
  const alerta = linkSeguro(d.linkAlerta);
  const prefs = linkSeguro(d.linkPreferencias);
  const total = voo ? `O preço é o total para ${pessoas}.` : `O preço é o total da estadia para ${pessoas}.`;

  const assunto = `Queda de preço: ${rota} por ${brl(d.precoAtual)}`;
  const titulo = voo ? "O voo chegou ao seu preço" : "A hospedagem chegou ao seu preço";

  const sujeitoHtml = voo
    ? `O voo <strong>${escaparHtml(rotaTitulo)}</strong>`
    : `A hospedagem em <strong>${escaparHtml(destino)}</strong>`;
  const sujeitoTexto = voo ? `O voo ${rotaTitulo}` : `A hospedagem em ${destino}`;

  const corpo = [
    paragrafo(
      `${escaparHtml(saudacao(d.nome))} ${sujeitoHtml} (${escaparHtml(datas)}, ${escaparHtml(pessoas)}) chegou a <strong>${escaparHtml(brl(d.precoAtual))}</strong>, ${escaparHtml(relacaoAlvo)}.`
    ),
    queda !== null && queda > 0 ? paragrafo(escaparHtml(`Caiu ${queda}% desde o último aviso (${brl(d.precoAnterior!)}).`)) : "",
    d.detalhe ? nota(escaparHtml(textoLimpo(d.detalhe, 120))) : "",
    oferta ? botao("Ver a oferta", oferta) : alerta ? botao("Abrir o alerta no DuoPlanner", alerta) : "",
    oferta && alerta ? nota(link("Abrir o alerta no DuoPlanner", alerta)) : "",
    nota(escaparHtml(`Preços mudam rápido: confira o valor final antes de comprar. ${total}`)),
  ].join("");

  const rodape = `Você recebe este aviso porque criou este alerta de preço no DuoPlanner.${prefs ? ` ${link("Desligar os avisos por e-mail", prefs)}.` : ""}`;

  const texto = [
    saudacao(d.nome),
    "",
    `${sujeitoTexto} (${datas}, ${pessoas}) chegou a ${brl(d.precoAtual)}, ${relacaoAlvo}.`,
    queda !== null && queda > 0 ? `Caiu ${queda}% desde o último aviso (${brl(d.precoAnterior!)}).` : null,
    d.detalhe ? textoLimpo(d.detalhe, 120) : null,
    "",
    oferta ? `Ver a oferta: ${oferta}` : null,
    alerta ? `Abrir o alerta no DuoPlanner: ${alerta}` : null,
    "",
    `Preços mudam rápido: confira o valor final antes de comprar. ${total}`,
    "",
    "Você recebe este aviso porque criou este alerta de preço no DuoPlanner.",
    prefs ? `Desligar os avisos por e-mail: ${prefs}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return {
    assunto,
    html: moldura({ preheader: `${rotaTitulo}: ${brl(d.precoAtual)} (${relacaoAlvo}).`, titulo, corpo, rodape }),
    texto,
  };
}

/* ------------------------ (b) convite para o espaço do casal ------------------------ */

export interface DadosEmailConvite {
  nomeConvidante: string;
  nomeEspaco: string;
  link: string;
  validadeDias: number;
}

/** Lança erro se o link não for seguro: sem link válido não há convite a enviar. */
export function emailConvite(d: DadosEmailConvite): EmailMontado {
  const url = linkSeguro(d.link);
  if (!url) throw new Error("Link do convite inválido.");
  const quem = textoLimpo(d.nomeConvidante, 40) || "Seu par";
  const espaco = textoLimpo(d.nomeEspaco, 60) || "Nossa Viagem";
  const assunto = `${quem} convidou você para planejar a viagem no DuoPlanner`;
  const validade = `O convite vale por ${d.validadeDias} dias e só pode ser usado uma vez.`;

  const corpo = [
    paragrafo(
      `Olá! <strong>${escaparHtml(quem)}</strong> quer planejar a próxima viagem com você no DuoPlanner, no espaço <strong>“${escaparHtml(espaco)}”</strong>.`
    ),
    paragrafo(
      escaparHtml(
        "Vocês dividem roteiro, checklist, alertas de preço e os gastos da viagem, com o acerto de contas pronto. Os gastos pessoais e os documentos de cada um continuam privados."
      )
    ),
    botao("Aceitar o convite", url),
    nota(`${escaparHtml(validade)} Se o botão não funcionar, copie este endereço no navegador: ${escaparHtml(url)}`),
    nota(escaparHtml("Não conhece quem enviou? Ignore este e-mail: nada acontece sem você entrar e confirmar o convite.")),
  ].join("");

  const rodape = escaparHtml("Você recebeu este e-mail porque alguém informou este endereço ao criar um convite no DuoPlanner.");

  const texto = [
    `Olá! ${quem} quer planejar a próxima viagem com você no DuoPlanner, no espaço “${espaco}”.`,
    "",
    "Vocês dividem roteiro, checklist, alertas de preço e os gastos da viagem, com o acerto de contas pronto. Os gastos pessoais e os documentos de cada um continuam privados.",
    "",
    `Aceitar o convite: ${url}`,
    validade,
    "",
    "Não conhece quem enviou? Ignore este e-mail: nada acontece sem você entrar e confirmar o convite.",
  ].join("\n");

  return {
    assunto,
    html: moldura({ preheader: `${quem} convidou você para o espaço “${espaco}”.`, titulo: "Convite para planejar a viagem juntos", corpo, rodape }),
    texto,
  };
}

/* ------------------------- (c) resumo semanal do orçamento ------------------------- */

export interface DadosEmailResumo {
  nome: string;
  periodo: { inicio: string; fim: string };
  nomeEspaco: string | null;
  totalCompartilhado: number;
  qtdCompartilhado: number;
  porCategoria: { categoria: string; total: number }[];
  totalPrivado: number;
  qtdPrivado: number;
  /** Gastos em moeda estrangeira sem cotação (ficam fora dos totais). */
  semCotacao: number;
  acerto: { situacao: "quites" | "receber" | "pagar"; valor: number; nomePar: string; regra: string } | null;
  linkFinancas: string;
  linkAcerto: string;
  linkPreferencias: string;
}

const qtdGastos = (n: number) => (n === 1 ? "1 gasto" : `${n} gastos`);

export function emailResumoSemanal(d: DadosEmailResumo): EmailMontado {
  const periodo = `${dataBr(d.periodo.inicio)} a ${dataBr(d.periodo.fim)}`;
  const espaco = d.nomeEspaco ? textoLimpo(d.nomeEspaco, 60) : null;
  const par = d.acerto ? textoLimpo(d.acerto.nomePar, 40) || "seu par" : "";
  const financas = linkSeguro(d.linkFinancas);
  const acertoLink = linkSeguro(d.linkAcerto);
  const prefs = linkSeguro(d.linkPreferencias);

  const assunto = `Resumo da semana (${diaMes(d.periodo.inicio)} a ${diaMes(d.periodo.fim)}): ${
    d.qtdCompartilhado > 0 ? `${brl(d.totalCompartilhado)} em gastos da viagem` : "seus gastos e o acerto"
  }`;

  const fraseAcerto = !d.acerto
    ? null
    : d.acerto.situacao === "quites"
      ? "Vocês estão quites: ninguém deve nada a ninguém."
      : d.acerto.situacao === "pagar"
        ? `Você tem ${brl(d.acerto.valor)} a acertar com ${par}.`
        : `${par} tem ${brl(d.acerto.valor)} a acertar com você.`;

  const categorias = d.porCategoria.slice(0, 5);
  const blocoViagem =
    d.qtdCompartilhado > 0
      ? tabelaValores([
          { rotulo: `Total da viagem (${qtdGastos(d.qtdCompartilhado)})`, valor: brl(d.totalCompartilhado), forte: true },
          ...categorias.map((c) => ({ rotulo: c.categoria, valor: brl(c.total) })),
        ])
      : nota(escaparHtml("Nenhum gasto da viagem lançado nesta semana."));

  const corpo = [
    paragrafo(
      `${escaparHtml(saudacao(d.nome))} Este é o resumo dos gastos de ${escaparHtml(periodo)}${espaco ? ` no espaço <strong>“${escaparHtml(espaco)}”</strong>` : ""}.`
    ),
    subtitulo("Gastos da viagem (compartilhados)"),
    blocoViagem,
    d.qtdPrivado > 0 ? subtitulo("Só seus (privados)") : "",
    d.qtdPrivado > 0
      ? tabelaValores([{ rotulo: `Seus gastos pessoais (${qtdGastos(d.qtdPrivado)})`, valor: brl(d.totalPrivado) }])
      : "",
    d.qtdPrivado > 0 ? nota(escaparHtml("Só você vê este valor: ele nunca entra na divisão.")) : "",
    d.semCotacao > 0
      ? nota(escaparHtml(`${qtdGastos(d.semCotacao)} em moeda estrangeira sem cotação ficaram fora dos totais. Informe a cotação no DuoFinance.`))
      : "",
    fraseAcerto ? subtitulo("Acerto de contas") : "",
    fraseAcerto ? paragrafo(`<strong>${escaparHtml(fraseAcerto)}</strong>`) : "",
    d.acerto ? nota(escaparHtml(`Regra combinada: ${d.acerto.regra}.`)) : "",
    d.acerto && d.acerto.situacao !== "quites" && acertoLink
      ? botao("Ver o acerto e o Pix", acertoLink)
      : financas
        ? botao("Abrir o DuoFinance", financas)
        : "",
  ].join("");

  const rodape = `Você recebe este resumo toda segunda-feira porque ele está ligado nas suas configurações.${prefs ? ` ${link("Desligar o resumo semanal", prefs)}.` : ""}`;

  const texto = [
    `${saudacao(d.nome)} Este é o resumo dos gastos de ${periodo}${espaco ? ` no espaço “${espaco}”` : ""}.`,
    "",
    "GASTOS DA VIAGEM (COMPARTILHADOS)",
    d.qtdCompartilhado > 0
      ? [`Total: ${brl(d.totalCompartilhado)} (${qtdGastos(d.qtdCompartilhado)})`, ...categorias.map((c) => `- ${c.categoria}: ${brl(c.total)}`)].join("\n")
      : "Nenhum gasto da viagem lançado nesta semana.",
    d.qtdPrivado > 0 ? `\nSÓ SEUS (PRIVADOS)\n${brl(d.totalPrivado)} (${qtdGastos(d.qtdPrivado)}). Só você vê este valor.` : null,
    d.semCotacao > 0 ? `\n${qtdGastos(d.semCotacao)} em moeda estrangeira sem cotação ficaram fora dos totais.` : null,
    fraseAcerto ? `\nACERTO DE CONTAS\n${fraseAcerto}\nRegra combinada: ${d.acerto!.regra}.` : null,
    "",
    acertoLink && d.acerto && d.acerto.situacao !== "quites" ? `Ver o acerto e o Pix: ${acertoLink}` : null,
    financas ? `Abrir o DuoFinance: ${financas}` : null,
    "",
    "Você recebe este resumo toda segunda-feira porque ele está ligado nas suas configurações.",
    prefs ? `Desligar o resumo semanal: ${prefs}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return {
    assunto,
    html: moldura({
      preheader: fraseAcerto ?? `Gastos de ${periodo}.`,
      titulo: "Resumo da semana",
      corpo,
      rodape,
    }),
    texto,
  };
}
