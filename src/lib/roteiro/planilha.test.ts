import { describe, expect, it } from "vitest";
import { lerCsv } from "./csv";
import {
  categoriaDoTexto,
  dataDeSerialExcel,
  interpretarPlanilha,
  lerCusto,
  lerData,
  lerTurnoOuHorario,
  normalizarChave,
  turnoEfetivo,
  type Celula,
} from "./planilha";

const CABECALHO = ["Destino", "Data", "Turno_ou_Horario", "Atividade_ou_Lugar", "Categoria", "Custo_Estimado", "Observacoes"];

describe("lerData", () => {
  it("aceita AAAA-MM-DD, DD/MM/AAAA, DD-MM-AA e DD.MM.AAAA", () => {
    for (const t of ["2026-09-10", "10/09/2026", "10-09-26", "10.09.2026", "2026/09/10", "2026-09-10T00:00:00"]) {
      expect(lerData(t), t).toEqual({ ok: true, data: "2026-09-10" });
    }
  });

  it("converte o número de série do Excel (sem depender do fuso)", () => {
    expect(dataDeSerialExcel(46275)).toBe("2026-09-10");
    expect(lerData(46275)).toEqual({ ok: true, data: "2026-09-10" });
    expect(dataDeSerialExcel(36526)).toBe("2000-01-01");
    expect(dataDeSerialExcel(1)).toBeNull(); // 1899: fora da faixa de anos aceita
    expect(dataDeSerialExcel(0)).toBeNull();
    expect(dataDeSerialExcel(Number.NaN)).toBeNull();
  });

  it("vazio é dia sem data; inválida e sem ano viram motivo", () => {
    expect(lerData("")).toEqual({ ok: true, data: null });
    expect(lerData(null)).toEqual({ ok: true, data: null });
    expect(lerData("31/02/2026")).toMatchObject({ ok: false });
    expect(lerData("10/09")).toMatchObject({ ok: false, motivo: expect.stringContaining("sem o ano") });
    expect(lerData("amanhã")).toMatchObject({ ok: false });
  });
});

describe("lerTurnoOuHorario", () => {
  it("reconhece turnos com e sem acento", () => {
    expect(lerTurnoOuHorario("Manhã")).toEqual({ ok: true, horario: null, turno: "manha" });
    expect(lerTurnoOuHorario("tarde")).toEqual({ ok: true, horario: null, turno: "tarde" });
    expect(lerTurnoOuHorario("NOITE")).toEqual({ ok: true, horario: null, turno: "noite" });
  });

  it("reconhece horários em vários formatos e a faixa pelo começo", () => {
    for (const [entrada, esperado] of [
      ["09:30", "09:30"],
      ["9h", "09:00"],
      ["9h30", "09:30"],
      ["14:00:00", "14:00"],
      ["20", "20:00"],
      ["09:00-12:00", "09:00"],
      ["14h às 16h", "14:00"],
    ] as const) {
      expect(lerTurnoOuHorario(entrada), entrada).toEqual({ ok: true, horario: esperado, turno: null });
    }
  });

  it("fração de dia do Excel vira horário", () => {
    expect(lerTurnoOuHorario(0.375)).toEqual({ ok: true, horario: "09:00", turno: null });
    expect(lerTurnoOuHorario(0.5)).toEqual({ ok: true, horario: "12:00", turno: null });
  });

  it("vazio é sem turno; o resto vira motivo", () => {
    expect(lerTurnoOuHorario("")).toEqual({ ok: true, horario: null, turno: null });
    expect(lerTurnoOuHorario("25:00")).toMatchObject({ ok: false });
    expect(lerTurnoOuHorario("depois do almoço")).toMatchObject({ ok: false });
  });

  it("o turno efetivo vem do horário quando não há turno escrito", () => {
    expect(turnoEfetivo({ horario: "08:00", turno: null })).toBe("manha");
    expect(turnoEfetivo({ horario: "13:00", turno: null })).toBe("tarde");
    expect(turnoEfetivo({ horario: "21:00", turno: null })).toBe("noite");
    expect(turnoEfetivo({ horario: null, turno: "tarde" })).toBe("tarde");
    expect(turnoEfetivo({ horario: null, turno: null })).toBeNull();
  });
});

describe("lerCusto", () => {
  it("entende formatos brasileiros e internacionais", () => {
    for (const [entrada, esperado] of [
      ["R$ 1.234,56", 1234.56],
      ["1234.56", 1234.56],
      ["1.234", 1234],
      ["89,90", 89.9],
      ["12.5", 12.5],
      [120, 120],
      ["R$120", 120],
    ] as const) {
      expect(lerCusto(entrada), String(entrada)).toEqual({ ok: true, custo: esperado });
    }
  });

  it("grátis é zero; vazio é sem estimativa", () => {
    expect(lerCusto("Grátis")).toEqual({ ok: true, custo: 0 });
    expect(lerCusto("gratuito")).toEqual({ ok: true, custo: 0 });
    expect(lerCusto("")).toEqual({ ok: true, custo: null });
  });

  it("recusa negativo, acima do teto e texto", () => {
    expect(lerCusto("-5")).toMatchObject({ ok: false });
    expect(lerCusto(2_000_000)).toMatchObject({ ok: false });
    expect(lerCusto("caro")).toMatchObject({ ok: false });
    expect(lerCusto(Number.NaN)).toMatchObject({ ok: false });
  });
});

describe("categoriaDoTexto", () => {
  it("usa a categoria escrita e, sem ela, palavras-chave", () => {
    expect(categoriaDoTexto("Praia")).toEqual({ categoria: "Praia", reconhecida: true });
    expect(categoriaDoTexto("gastronomia")).toEqual({ categoria: "Gastronomia", reconhecida: true });
    expect(categoriaDoTexto("Jantar no Time Out Market").categoria).toBe("Gastronomia");
    expect(categoriaDoTexto("Voo para Lisboa").categoria).toBe("Transporte");
    expect(categoriaDoTexto("Check-in no hotel").categoria).toBe("Hospedagem");
    expect(categoriaDoTexto("Praia de Carcavelos").categoria).toBe("Praia");
    expect(categoriaDoTexto("Visita ao museu").categoria).toBe("Passeio");
  });

  it("o que não reconhece vira Outros, sem acertar por palpite", () => {
    expect(categoriaDoTexto("Compras")).toEqual({ categoria: "Outros", reconhecida: false });
    expect(categoriaDoTexto("")).toEqual({ categoria: "Outros", reconhecida: false });
  });

  it("normalizarChave tira acento e símbolos", () => {
    expect(normalizarChave("  Turno_ou_Horário ")).toBe("turno_ou_horario");
  });
});

describe("interpretarPlanilha", () => {
  const dados: Celula[][] = [
    CABECALHO,
    ["Lisboa", "2026-09-10", "Manhã", "Bondinho 28", "Passeio", "25", "Chegar cedo"],
    ["Lisboa", "10/09/2026", "20:00", "Jantar no Time Out Market", "Gastronomia", "R$ 120,00", ""],
    ["Cascais", 46276, 0.5, "Praia de Carcavelos", "", "Grátis", ""],
  ];

  it("lê as linhas do modelo, com data, turno, horário, categoria e custo", () => {
    const r = interpretarPlanilha(dados);
    expect(r.problemas).toEqual([]);
    expect(r.lidas).toBe(3);
    expect(r.linhas[0]).toMatchObject({ linha: 2, destino: "Lisboa", data: "2026-09-10", turno: "manha", horario: null, categoria: "Passeio", custo: 25, observacoes: "Chegar cedo" });
    expect(r.linhas[1]).toMatchObject({ horario: "20:00", turno: null, custo: 120 });
    // Categoria vazia: reconhecida pelo nome da atividade; data e hora em número de série.
    expect(r.linhas[2]).toMatchObject({ data: "2026-09-11", horario: "12:00", categoria: "Praia", categoriaCerta: true, custo: 0 });
  });

  it("acha o cabeçalho abaixo de linhas de título e aceita apelidos e ordem diferente", () => {
    const r = interpretarPlanilha([
      ["Minha viagem"],
      [],
      ["Cidade", "Atividade", "Dia", "Valor"],
      ["Roma", "Coliseu", "01/10/2026", "R$ 60"],
    ]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ linha: 4, destino: "Roma", atividade: "Coliseu", data: "2026-10-01", custo: 60 });
  });

  it("sem cabeçalho reconhecível, explica", () => {
    const r = interpretarPlanilha([["a", "b"], ["1", "2"]]);
    expect(r.linhas).toEqual([]);
    expect(r.problemas[0]).toMatchObject({ gravidade: "erro", linha: null });
  });

  it("linha sem atividade é descartada com a linha apontada; linha em branco passa batida", () => {
    const r = interpretarPlanilha([CABECALHO, ["Lisboa", "2026-09-10", "", "", "", "", ""], [], ["", "", "", "", "", "", ""], ["Lisboa", "", "", "Alfama", "", "", ""]]);
    expect(r.linhas.map((l) => l.atividade)).toEqual(["Alfama"]);
    expect(r.problemas).toEqual([{ linha: 2, gravidade: "erro", mensagem: expect.stringContaining("sem Atividade_ou_Lugar") }]);
    expect(r.lidas).toBe(2);
  });

  it("valores inválidos não derrubam a linha: viram aviso e ficam vazios", () => {
    const r = interpretarPlanilha([CABECALHO, ["Lisboa", "31/02/2026", "mais ou menos", "Alfama", "", "caro", ""]]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ data: null, horario: null, turno: null, custo: null });
    expect(r.problemas.filter((p) => p.gravidade === "aviso")).toHaveLength(3);
    expect(r.problemas.every((p) => p.linha === 2)).toBe(true);
  });

  it("encurta textos longos e avisa", () => {
    const r = interpretarPlanilha([CABECALHO, ["L".repeat(200), "", "", "A".repeat(300), "", "", "O".repeat(900)]]);
    expect(r.linhas[0].destino.length).toBeLessThanOrEqual(80);
    expect(r.linhas[0].atividade.length).toBeLessThanOrEqual(120);
    expect(r.linhas[0].observacoes.length).toBeLessThanOrEqual(500);
    expect(r.problemas).toHaveLength(3);
  });

  it("limita a 300 linhas", () => {
    const muitas: Celula[][] = [CABECALHO, ...Array.from({ length: 350 }, (_, i) => ["Lisboa", "2026-09-10", "", `Atividade ${i}`, "", "", ""])];
    const r = interpretarPlanilha(muitas);
    expect(r.linhas).toHaveLength(300);
    expect(r.problemas.some((p) => p.gravidade === "erro" && p.mensagem.includes("300"))).toBe(true);
  });

  it("remove caracteres de controle das células", () => {
    const r = interpretarPlanilha([CABECALHO, ["Lis\u0000boa", "", "", "Alfama\n\tcentro", "", "", ""]]);
    expect(r.linhas[0]).toMatchObject({ destino: "Lis boa", atividade: "Alfama centro" });
  });
});

describe("lerCsv", () => {
  it("lê ponto e vírgula, aspas, vírgula dentro do campo e BOM", () => {
    const csv = '\uFEFFDestino;Data;Atividade_ou_Lugar;Observacoes\r\nLisboa;2026-09-10;"Bar, com música";"Ele disse ""oi"""\r\n';
    expect(lerCsv(csv)).toEqual([
      ["Destino", "Data", "Atividade_ou_Lugar", "Observacoes"],
      ["Lisboa", "2026-09-10", "Bar, com música", 'Ele disse "oi"'],
    ]);
  });

  it("detecta vírgula e tabulação, e quebra de linha dentro de aspas", () => {
    expect(lerCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(lerCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(lerCsv('a,b\n"x\ny",2')).toEqual([["a", "b"], ["x\ny", "2"]]);
  });

  it("o CSV do modelo passa pelo parser inteiro", () => {
    const csv = ["Destino;Data;Turno_ou_Horario;Atividade_ou_Lugar;Categoria;Custo_Estimado;Observacoes", "Lisboa;10/09/2026;Manhã;Alfama;Passeio;25,50;"].join("\n");
    const r = interpretarPlanilha(lerCsv(csv));
    expect(r.problemas).toEqual([]);
    expect(r.linhas[0]).toMatchObject({ data: "2026-09-10", turno: "manha", custo: 25.5 });
  });
});
