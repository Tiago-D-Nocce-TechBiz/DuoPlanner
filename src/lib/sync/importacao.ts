import { iataDaCidade } from "@/lib/concierge";
import { addDays } from "@/lib/dates";
import { CATEGORIAS, ESCOPOS, type Categoria, type Escopo } from "@/lib/finance/classificar";
import { parseValorMonetario } from "@/lib/finance/importar";
import { ESQUEMAS_CRIAR } from "./esquemas";
import type { Operacao } from "./fila";
import type { DadosLegados } from "./legado";
import type { AlertaPreco, Despesa, ItemChecklist, RoteiroDia, RoteiroItem } from "./modelos";

/**
 * Conversão dos dados antigos do navegador em operações "criar" (pura).
 *
 * Só roda quando a pessoa confirma a importação. Cada registro passa pelo
 * mesmo esquema que o servidor usa: o que não passaria lá é descartado aqui
 * (e contado), em vez de travar a fila. Documentos NÃO entram: vão direto ao
 * servidor para serem cifrados (nunca ficam na fila em texto puro).
 */

export interface ContextoImportacao {
  userId: string;
  workspaceId: string;
  hoje: string;
  agora: string;
  novoId: () => string;
}

export interface ResultadoImportacao {
  operacoes: Operacao[];
  descartados: number;
}

function brParaIso(br: string, hoje: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : hoje;
}

const categoriaValida = (c: string): Categoria =>
  (CATEGORIAS as readonly string[]).includes(c) ? (c as Categoria) : "Gasto Pessoal (Fora da Viagem)";
const escopoValido = (e: string): Escopo => ((ESCOPOS as readonly string[]).includes(e) ? (e as Escopo) : "pessoal_privado");

export function operacoesDoLegado(dados: DadosLegados, ctx: ContextoImportacao): ResultadoImportacao {
  const operacoes: Operacao[] = [];
  let descartados = 0;
  const comum = { atualizadoEm: ctx.agora, atualizadoPor: ctx.userId };

  function criar(recurso: Operacao["recurso"], registro: { id: string } & object) {
    const valido = ESQUEMAS_CRIAR[recurso].safeParse(registro);
    if (!valido.success) {
      descartados++;
      return false;
    }
    operacoes.push({ opId: ctx.novoId(), recurso, tipo: "criar", registro: registro as { id: string } & Record<string, unknown> });
    return true;
  }

  for (const d of dados.despesas) {
    const escopo = escopoValido(d.escopo);
    const despesa: Despesa = {
      id: ctx.novoId(),
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      pagoPor: ctx.userId,
      tipo: "gasto",
      descricao: d.estabelecimento.slice(0, 120),
      valor: Math.round(d.valor * 100) / 100,
      moeda: "BRL",
      cotacaoBrl: null,
      data: brParaIso(d.data, ctx.hoje),
      categoria: categoriaValida(d.categoriaDestino),
      escopo,
      proporcaoDivisao: null,
      origem: "legado",
      criadoEm: ctx.agora,
      ...comum,
    };
    criar("despesas", despesa);
  }

  dados.roteiro.forEach((dia, indiceDia) => {
    const novoDia: RoteiroDia = {
      id: ctx.novoId(),
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      data: /^\d{4}-\d{2}-\d{2}$/.test(dia.data) ? dia.data : null,
      ordem: indiceDia,
      ...comum,
    };
    if (!criar("roteiro_dias", novoDia)) {
      descartados += dia.itens.length;
      return;
    }
    dia.itens.forEach((item, indiceItem) => {
      const novoItem: RoteiroItem = {
        id: ctx.novoId(),
        workspaceId: ctx.workspaceId,
        diaId: novoDia.id,
        horario: /^([01]\d|2[0-3]):[0-5]\d$/.test(item.horario) ? item.horario : "",
        titulo: item.titulo.slice(0, 120),
        nota: item.nota.slice(0, 500),
        ordem: indiceItem,
        ...comum,
      };
      criar("roteiro_itens", novoItem);
    });
  });

  dados.checklist.forEach((item, indice) => {
    const novo: ItemChecklist = {
      id: ctx.novoId(),
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      texto: item.texto.slice(0, 120),
      categoria: (item.categoria || "Mão / Essenciais").slice(0, 40),
      feito: item.feito,
      ordem: indice,
      ...comum,
    };
    criar("checklist", novo);
  });

  for (const a of dados.alertas) {
    const tipo = a.tipo === "hospedagem" ? "hospedagem" : "voo";
    const ida = a.ida;
    const volta = /^\d{4}-\d{2}-\d{2}$/.test(a.volta) ? a.volta : tipo === "hospedagem" && /^\d{4}-\d{2}-\d{2}$/.test(ida) ? addDays(ida, 1) : null;
    const preco = parseValorMonetario(a.precoAlvo);
    const alerta: AlertaPreco = {
      id: ctx.novoId(),
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      tipo,
      origem: tipo === "voo" ? a.origem.slice(0, 80) : "",
      origemIata: tipo === "voo" ? iataDaCidade(a.origem) ?? null : null,
      destino: a.destino.slice(0, 80),
      destinoIata: tipo === "voo" ? iataDaCidade(a.destino) ?? null : null,
      ida,
      volta,
      adultos: 2,
      precoAlvo: preco !== null && preco > 0 ? preco : null,
      ativo: true,
      ultimoPreco: null,
      ultimoLink: null,
      ultimaVerificacaoEm: null,
      ultimoDisparoEm: null,
      ...comum,
    };
    criar("alertas", alerta);
  }

  return { operacoes, descartados };
}
