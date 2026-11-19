import { describe, expect, it } from "vitest";
import type { RoteiroDia, RoteiroItem } from "@/lib/sync/modelos";
import { fingerprintDaLinha, fingerprintDaSugestao, normalizarParaComparar } from "./fingerprint-roteiro";
import {
  aplicarCuradoria,
  chaveDeOrdem,
  linhasParaClassificar,
  montarEntradaCuradoria,
  organizarPlanilha,
  planoDeGravacao,
  resumoDaPrevisao,
  selecaoInicial,
  type Existentes,
} from "./organizar";
import { interpretarPlanilha, type Celula } from "./planilha";
import { FORMATO_FINGERPRINT_ROTEIRO, type LinhaPlanilha, type ResultadoCuradoria } from "./tipos";

const CAB = ["Destino", "Data", "Turno_ou_Horario", "Atividade_ou_Lugar", "Categoria", "Custo_Estimado", "Observacoes"];

function linhasDe(...registros: Celula[][]): LinhaPlanilha[] {
  return interpretarPlanilha([CAB, ...registros]).linhas;
}

const PLANILHA = [
  ["Lisboa", "2026-09-11", "Tarde", "Praia de Carcavelos", "Praia", "0", ""],
  ["Lisboa", "2026-09-10", "20:00", "Jantar no Time Out Market", "Gastronomia", "120", "Reservar"],
  ["Lisboa", "2026-09-10", "Manhã", "Bondinho 28", "Passeio", "25", ""],
  ["Porto", "", "", "Ribeira", "", "", ""],
] satisfies Celula[][];

const VAZIO: Existentes = { dias: [], itens: [] };

let seq = 0;
const ctx = { userId: "u1", workspaceId: "w1", agoraIso: "2026-05-01T10:00:00Z", novoId: () => `id-${++seq}` };

/** Aplica um plano a um "banco" em memória (o que o motor faria), para simular reimportações. */
function gravar(existentes: Existentes, plano: ReturnType<typeof planoDeGravacao>): Existentes {
  const dias: RoteiroDia[] = [
    ...existentes.dias.map((d) => {
      const u = plano.diasComDestino.find((x) => x.id === d.id);
      return u ? { ...d, destino: u.destino } : d;
    }),
    ...plano.diasNovos,
  ];
  return { dias, itens: [...existentes.itens, ...plano.itens] };
}

describe("fingerprint do roteiro", () => {
  it("é estável, no formato do banco, e ignora acento, caixa e espaços", () => {
    const a = fingerprintDaLinha({ destino: "Lisboa", data: "2026-09-10", atividade: "Bondinho 28" });
    expect(a).toMatch(FORMATO_FINGERPRINT_ROTEIRO);
    expect(fingerprintDaLinha({ destino: " LISBOA ", data: "2026-09-10", atividade: "bondinho   28" })).toBe(a);
    expect(fingerprintDaLinha({ destino: "Lisboa", data: "2026-09-11", atividade: "Bondinho 28" })).not.toBe(a);
    expect(fingerprintDaLinha({ destino: "Lisboa", data: null, atividade: "Bondinho 28" })).not.toBe(a);
    expect(normalizarParaComparar("  Açaí  Bar ")).toBe("acai bar");
  });

  it("sugestão e linha da planilha nunca colidem", () => {
    expect(fingerprintDaSugestao({ destino: "Lisboa", titulo: "Bondinho 28" })).not.toBe(
      fingerprintDaLinha({ destino: "Lisboa", data: null, atividade: "Bondinho 28" })
    );
  });
});

describe("organizarPlanilha (caminho sem IA)", () => {
  it("agrupa por dia em ordem cronológica, dias sem data por último, e ordena por turno e horário", () => {
    const p = organizarPlanilha(linhasDe(...PLANILHA), VAZIO);
    expect(p.dias.map((d) => d.data)).toEqual(["2026-09-10", "2026-09-11", null]);
    expect(p.dias[0].itens.map((i) => i.titulo)).toEqual(["Bondinho 28", "Jantar no Time Out Market"]);
    expect(p.dias[0].itens.map((i) => i.turno)).toEqual(["manha", "noite"]);
    expect(p.dias[0].destino).toBe("Lisboa");
    expect(p.dias[2].destino).toBe("Porto");
  });

  it("junta destinos diferentes no mesmo dia e separa dias sem data por destino", () => {
    const p = organizarPlanilha(
      linhasDe(
        ["Lisboa", "2026-09-10", "", "A", "", "", ""],
        ["Sintra", "2026-09-10", "", "B", "", "", ""],
        ["Lisboa", "", "", "C", "", "", ""],
        ["Porto", "", "", "D", "", "", ""],
        ["lisboa", "", "", "E", "", "", ""]
      ),
      VAZIO
    );
    expect(p.dias).toHaveLength(3);
    expect(p.dias[0].destino).toBe("Lisboa · Sintra");
    expect(p.dias[1].itens.map((i) => i.titulo)).toEqual(["C", "E"]);
  });

  it("linhas idênticas na planilha entram uma vez só", () => {
    const p = organizarPlanilha(linhasDe(PLANILHA[1], PLANILHA[1], PLANILHA[1]), VAZIO);
    expect(p.dias[0].itens).toHaveLength(1);
    expect(p.repetidasNoArquivo).toBe(2);
  });

  it("a chave de ordem usa horário, depois meio do turno, depois o fim do dia", () => {
    expect(chaveDeOrdem("09:30", null)).toBe(570);
    expect(chaveDeOrdem("", "manha")).toBeLessThan(chaveDeOrdem("", "tarde"));
    expect(chaveDeOrdem("", "noite")).toBeLessThan(chaveDeOrdem("", null));
  });

  it("é determinística: a mesma planilha dá a mesma prévia", () => {
    const a = organizarPlanilha(linhasDe(...PLANILHA), VAZIO);
    const b = organizarPlanilha(linhasDe(...PLANILHA), VAZIO);
    expect(a).toEqual(b);
  });
});

describe("gravação e idempotência", () => {
  it("cria os dias antes das atividades, com ordem crescente, origem e impressão digital", () => {
    const p = organizarPlanilha(linhasDe(...PLANILHA), VAZIO);
    const plano = planoDeGravacao(p, selecaoInicial(p), VAZIO, ctx);
    expect(plano.diasNovos).toHaveLength(3);
    expect(plano.diasNovos.map((d) => d.ordem)).toEqual([0, 1, 2]);
    expect(plano.diasNovos[0]).toMatchObject({ workspaceId: "w1", userId: "u1", data: "2026-09-10", destino: "Lisboa" });
    expect(plano.itens).toHaveLength(4);
    const primeiroDia = plano.diasNovos[0].id;
    const doPrimeiro = plano.itens.filter((i) => i.diaId === primeiroDia);
    expect(doPrimeiro.map((i) => [i.titulo, i.ordem])).toEqual([["Bondinho 28", 0], ["Jantar no Time Out Market", 1]]);
    expect(doPrimeiro[0]).toMatchObject({ turno: "manha", horario: "", categoria: "Passeio", custoEstimado: 25, origem: "planilha", workspaceId: "w1" });
    expect(doPrimeiro[1]).toMatchObject({ turno: null, horario: "20:00", custoEstimado: 120, nota: "Reservar" });
    for (const i of plano.itens) expect(i.fingerprint).toMatch(FORMATO_FINGERPRINT_ROTEIRO);
    expect(new Set(plano.itens.map((i) => i.fingerprint)).size).toBe(4);
  });

  it("reimportar a mesma planilha não cria dia nem atividade", () => {
    const linhas = linhasDe(...PLANILHA);
    const p1 = organizarPlanilha(linhas, VAZIO);
    const depois = gravar(VAZIO, planoDeGravacao(p1, selecaoInicial(p1), VAZIO, ctx));

    const p2 = organizarPlanilha(linhas, depois);
    expect(selecaoInicial(p2).size).toBe(0);
    expect(p2.dias.every((d) => d.diaExistenteId !== null)).toBe(true);
    expect(p2.dias.flatMap((d) => d.itens).every((i) => i.jaNoRoteiro)).toBe(true);
    const plano = planoDeGravacao(p2, new Set(p2.dias.flatMap((d) => d.itens.map((i) => i.chave))), depois, ctx);
    expect(plano).toEqual({ diasNovos: [], diasComDestino: [], itens: [] });
    expect(resumoDaPrevisao(p2, selecaoInicial(p2))).toMatchObject({ daPlanilha: 0, jaNoRoteiro: 4, aSalvar: 0 });
  });

  it("planilha atualizada: só a linha nova entra, no dia que já existe, no fim dele", () => {
    const linhas = linhasDe(...PLANILHA);
    const p1 = organizarPlanilha(linhas, VAZIO);
    const depois = gravar(VAZIO, planoDeGravacao(p1, selecaoInicial(p1), VAZIO, ctx));

    const nova = linhasDe(...PLANILHA, ["Lisboa", "2026-09-10", "Noite", "Fado em Alfama", "Passeio", "80", ""]);
    const p2 = organizarPlanilha(nova, depois);
    const plano = planoDeGravacao(p2, selecaoInicial(p2), depois, ctx);
    expect(plano.diasNovos).toEqual([]);
    expect(plano.itens).toHaveLength(1);
    expect(plano.itens[0]).toMatchObject({ titulo: "Fado em Alfama", ordem: 2, diaId: depois.dias.find((d) => d.data === "2026-09-10")!.id });
  });

  it("mudar horário, categoria ou custo na planilha e reimportar não duplica", () => {
    const p1 = organizarPlanilha(linhasDe(PLANILHA[2]), VAZIO);
    const depois = gravar(VAZIO, planoDeGravacao(p1, selecaoInicial(p1), VAZIO, ctx));
    const p2 = organizarPlanilha(linhasDe(["Lisboa", "2026-09-10", "10:00", "Bondinho 28", "Transporte", "99", "outra nota"]), depois);
    expect(selecaoInicial(p2).size).toBe(0);
  });

  it("não duplica atividade que a dupla já digitou à mão no mesmo dia (mesmo título)", () => {
    const existentes: Existentes = {
      dias: [{ id: "d1", workspaceId: "w1", userId: "u1", data: "2026-09-10", ordem: 0, atualizadoEm: "", atualizadoPor: null }],
      itens: [{ id: "i1", workspaceId: "w1", diaId: "d1", horario: "", titulo: "  bondinho 28 ", nota: "", ordem: 0, atualizadoEm: "", atualizadoPor: null }],
    };
    const p = organizarPlanilha(linhasDe(PLANILHA[2], PLANILHA[1]), existentes);
    expect(p.dias[0].diaExistenteId).toBe("d1");
    expect(p.dias[0].itens.map((i) => [i.titulo, i.jaNoRoteiro])).toEqual([["Bondinho 28", true], ["Jantar no Time Out Market", false]]);
  });

  it("dia que existia sem destino o recebe; com destino, fica como está", () => {
    const dia = (destino: string | null): RoteiroDia => ({ id: "d1", workspaceId: "w1", userId: "u1", data: "2026-09-10", destino, ordem: 5, atualizadoEm: "", atualizadoPor: null });
    const itensNovos = (e: Existentes) => {
      const p = organizarPlanilha(linhasDe(PLANILHA[2]), e);
      return planoDeGravacao(p, selecaoInicial(p), e, ctx);
    };
    expect(itensNovos({ dias: [dia(null)], itens: [] }).diasComDestino).toEqual([{ id: "d1", destino: "Lisboa" }]);
    expect(itensNovos({ dias: [dia("Algarve")], itens: [] }).diasComDestino).toEqual([]);
  });

  it("dias novos continuam a ordem dos existentes", () => {
    const existentes: Existentes = {
      dias: [{ id: "d1", workspaceId: "w1", userId: "u1", data: "2026-08-01", ordem: 7, atualizadoEm: "", atualizadoPor: null }],
      itens: [],
    };
    const p = organizarPlanilha(linhasDe(PLANILHA[2]), existentes);
    const plano = planoDeGravacao(p, selecaoInicial(p), existentes, ctx);
    expect(plano.diasNovos[0].ordem).toBe(8);
  });

  it("só grava o que está selecionado", () => {
    const p = organizarPlanilha(linhasDe(...PLANILHA), VAZIO);
    const [primeiro] = p.dias[0].itens;
    const plano = planoDeGravacao(p, new Set([primeiro.chave]), VAZIO, ctx);
    expect(plano.itens.map((i) => i.titulo)).toEqual(["Bondinho 28"]);
    expect(plano.diasNovos).toHaveLength(1);
  });
});

describe("aplicarCuradoria", () => {
  const linhas = linhasDe(PLANILHA[1], ["Lisboa", "2026-09-12", "", "Loja da esquina", "Compras", "", ""], ["Porto", "2026-09-14", "", "Ribeira", "Passeio", "", ""]);
  const base = () => organizarPlanilha(linhas, VAZIO);

  const curadoria = (parcial: Partial<ResultadoCuradoria>): ResultadoCuradoria => ({ origem: "ia", aviso: null, classificacoes: [], sugestoes: [], ...parcial });

  it("só classifica o que a planilha não deixou claro e nunca sobrescreve o que a pessoa escreveu", () => {
    const incerta = linhas.find((l) => !l.categoriaCerta)!;
    const certa = linhas.find((l) => l.categoriaCerta)!;
    expect(linhasParaClassificar(linhas).map((l) => l.linha)).toEqual([incerta.linha]);
    const p = aplicarCuradoria(
      base(),
      curadoria({
        classificacoes: [
          { linha: incerta.linha, categoria: "Passeio", turno: "tarde" },
          { linha: certa.linha, categoria: "Praia", turno: "manha" },
        ],
      }),
      VAZIO
    );
    const itens = p.dias.flatMap((d) => d.itens);
    expect(itens.find((i) => i.linha === incerta.linha)).toMatchObject({ categoria: "Passeio", turno: "tarde" });
    expect(itens.find((i) => i.linha === certa.linha)).toMatchObject({ categoria: "Gastronomia", turno: "noite" });
  });

  it("encaixa a sugestão no dia pedido, se for do destino; senão, no primeiro dia do destino", () => {
    const sug = (titulo: string, destino: string, diaNumero: number | null) => ({
      destino,
      titulo,
      categoria: "Praia" as const,
      porque: "Areia dourada e pôr do sol.",
      turno: "tarde" as const,
      diaNumero,
      custoEstimadoBrl: null,
    });
    const p = aplicarCuradoria(
      base(),
      curadoria({ sugestoes: [sug("Praia do Guincho", "Lisboa", 2), sug("Praia de Matosinhos", "Porto", 1), sug("Praia da Adraga", "Lisboa", null)] }),
      VAZIO
    );
    expect(p.dias[1].sugestoes.map((s) => s.titulo)).toEqual(["Praia do Guincho"]); // dia 2 é Lisboa: respeitado
    expect(p.dias[2].sugestoes.map((s) => s.titulo)).toEqual(["Praia de Matosinhos"]); // dia 1 não é do Porto: vai ao dia do Porto
    expect(p.dias[0].sugestoes.map((s) => s.titulo)).toEqual(["Praia da Adraga"]);
    expect(p.dias[1].sugestoes[0]).toMatchObject({ origem: "nora_sugestao", porque: "Areia dourada e pôr do sol.", categoria: "Praia", jaNoRoteiro: false });
  });

  it("descarta sugestão de destino que não está na planilha, repetida ou igual a uma atividade", () => {
    const s = (titulo: string, destino: string) => ({ destino, titulo, categoria: "Passeio" as const, porque: "x", turno: null, diaNumero: null, custoEstimadoBrl: null });
    const p = aplicarCuradoria(base(), curadoria({ sugestoes: [s("Ribeira", "Porto"), s("Torre de Belém", "Paris"), s("Mosteiro", "Lisboa"), s("mosteiro", "LISBOA")] }), VAZIO);
    expect(p.dias.flatMap((d) => d.sugestoes.map((x) => x.titulo))).toEqual(["Mosteiro"]);
  });

  it("sugestão já aceita antes (mesma impressão digital) vem marcada como já no roteiro", () => {
    const chave = fingerprintDaSugestao({ destino: "Lisboa", titulo: "Mosteiro" });
    const existentes: Existentes = {
      dias: [],
      itens: [{ id: "i", workspaceId: "w1", diaId: "d", horario: "", titulo: "Mosteiro", nota: "", fingerprint: chave, origem: "nora_sugestao", ordem: 0, atualizadoEm: "", atualizadoPor: null }],
    };
    const p = aplicarCuradoria(
      organizarPlanilha(linhas, existentes),
      curadoria({ sugestoes: [{ destino: "Lisboa", titulo: "Mosteiro", categoria: "Passeio", porque: "x", turno: null, diaNumero: null, custoEstimadoBrl: null }] }),
      existentes
    );
    const s = p.dias.flatMap((d) => d.sugestoes);
    expect(s).toHaveLength(1);
    expect(s[0].jaNoRoteiro).toBe(true);
    expect(resumoDaPrevisao(p, new Set([chave])).sugestoes).toBe(0);
  });

  it("sugestão só entra no roteiro se for incluída; aceita, grava com origem nora_sugestao", () => {
    const sugestao = { destino: "Lisboa", titulo: "Mosteiro dos Jerónimos", categoria: "Passeio" as const, porque: "Arquitetura manuelina.", turno: "manha" as const, diaNumero: 1, custoEstimadoBrl: 40 };
    const p = aplicarCuradoria(base(), curadoria({ sugestoes: [sugestao] }), VAZIO);
    const inicial = selecaoInicial(p);
    expect(planoDeGravacao(p, inicial, VAZIO, ctx).itens.some((i) => i.origem === "nora_sugestao")).toBe(false);

    const chave = p.dias[0].sugestoes[0].chave;
    const plano = planoDeGravacao(p, new Set([...inicial, chave]), VAZIO, ctx);
    const gravada = plano.itens.find((i) => i.origem === "nora_sugestao")!;
    expect(gravada).toMatchObject({ titulo: "Mosteiro dos Jerónimos", nota: "Arquitetura manuelina.", categoria: "Passeio", custoEstimado: 40, turno: "manha", fingerprint: chave });
    // Aceitar de novo numa reimportação não duplica.
    const depois = gravar(VAZIO, plano);
    const p2 = aplicarCuradoria(organizarPlanilha(linhas, depois), curadoria({ sugestoes: [sugestao] }), depois);
    expect(p2.dias[0].sugestoes[0].jaNoRoteiro).toBe(true);
  });

  it("monta o pedido da curadoria com dias, linhas e o que classificar", () => {
    const entrada = montarEntradaCuradoria(base(), true);
    expect(entrada.incluirSugestoes).toBe(true);
    expect(entrada.dias.map((d) => d.numero)).toEqual([1, 2, 3]);
    expect(entrada.linhas.find((l) => l.atividade === "Loja da esquina")).toMatchObject({ classificar: true, dia: 2 });
    expect(entrada.linhas.find((l) => l.atividade === "Ribeira")).toMatchObject({ classificar: false });
  });
});

describe("RoteiroItem", () => {
  it("o tipo aceita atividades antigas, sem os campos novos", () => {
    const antigo: RoteiroItem = { id: "1", workspaceId: null, diaId: null, horario: "", titulo: "", nota: "", ordem: 0, atualizadoEm: "", atualizadoPor: null };
    expect(antigo.origem).toBeUndefined();
  });
});
