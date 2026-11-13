import { describe, expect, it } from "vitest";
import { criarExtratorDeExperiencias } from "./experiencias-em-fluxo";
import {
  aplicarEvento,
  criarLeitorDeLinhas,
  destinoAceito,
  estadoInicial,
  linhaDoEvento,
  type EventoExperiencias,
  type LocalGem,
} from "./experiencias-protocolo";

const gem = (n: number): LocalGem => ({
  nome: `Lugar ${n}`,
  descricao: `O que fazer no lugar ${n}.`,
  custo: n % 2 ? "gratuito" : "baixo custo",
  custo_estimado: "Grátis",
  melhor_momento: "Fim de tarde",
  dica_local: "Chegue cedo.",
});

const RESPOSTA = JSON.stringify({ experiencias: [gem(1), gem(2), gem(3)] });

/** A resposta da IA cortada em pedaços de `tamanho` caracteres (como num stream). */
const trechos = (texto: string, tamanho: number) =>
  Array.from({ length: Math.ceil(texto.length / tamanho) }, (_, i) => texto.slice(i * tamanho, (i + 1) * tamanho));

describe("extrator de experiências (JSON parcial da IA)", () => {
  it("cada sugestão sai validada assim que fica completa, antes de a resposta terminar", () => {
    const ler = criarExtratorDeExperiencias();
    let acumulado = "";
    const momentos: { ate: number; nomes: string[] }[] = [];
    for (const t of trechos(RESPOSTA, 17)) {
      acumulado += t;
      const { prontas } = ler(acumulado);
      if (prontas.length) momentos.push({ ate: acumulado.length, nomes: prontas.map((p) => p.experiencia.nome) });
    }
    const finais = ler(acumulado, true).prontas;
    // A 1ª e a 2ª saem no meio do fluxo; a 3ª só no fim (podia estar pela metade).
    expect(momentos.flatMap((m) => m.nomes)).toEqual(["Lugar 1", "Lugar 2"]);
    expect(momentos[0].ate).toBeLessThan(RESPOSTA.length / 2);
    expect(finais).toEqual([{ indice: 2, experiencia: gem(3) }]);
  });

  it("o card em escrita sai como rascunho, começando pelo nome, e cresce a cada trecho", () => {
    const ler = criarExtratorDeExperiencias();
    const r1 = ler('{"experiencias":[{"nome":"Mira').rascunho;
    expect(r1).toEqual({ indice: 0, experiencia: { nome: "Mira" } });
    const r2 = ler('{"experiencias":[{"nome":"Miradouro","descricao":"Pôr do').rascunho;
    expect(r2).toEqual({ indice: 0, experiencia: { nome: "Miradouro", descricao: "Pôr do" } });
    // Trecho que não muda o texto (espaço, vírgula): sem rascunho repetido.
    expect(ler('{"experiencias":[{"nome":"Miradouro","descricao":"Pôr do" ').rascunho).toBeNull();
  });

  it("quando a próxima começa, a anterior vira pronta e o rascunho passa para a nova posição", () => {
    const ler = criarExtratorDeExperiencias();
    const texto = `{"experiencias":[${JSON.stringify(gem(1))},{"nome":"Feira`;
    const leitura = ler(texto);
    expect(leitura.prontas).toEqual([{ indice: 0, experiencia: gem(1) }]);
    expect(leitura.rascunho).toEqual({ indice: 1, experiencia: { nome: "Feira" } });
  });

  it("campos desconhecidos não entram no rascunho (o custo parcial entra como texto; o selo só sai com o valor completo)", () => {
    const ler = criarExtratorDeExperiencias();
    const r = ler('{"experiencias":[{"nome":"X","extra":{"a":1},"custo":"grat').rascunho;
    expect(r?.experiencia).toEqual({ nome: "X", custo: "grat" });
  });

  it("não repete sugestões já entregues", () => {
    const ler = criarExtratorDeExperiencias();
    expect(ler(RESPOSTA).prontas.map((p) => p.indice)).toEqual([0, 1]);
    expect(ler(RESPOSTA).prontas).toEqual([]);
    expect(ler(RESPOSTA, true).prontas.map((p) => p.indice)).toEqual([2]);
    expect(ler(RESPOSTA, true).prontas).toEqual([]);
  });

  it("sugestão fora do formato é descartada sem travar as próximas (as posições se mantêm)", () => {
    const ler = criarExtratorDeExperiencias();
    const torta = JSON.stringify({ experiencias: [{ nome: "Sem o resto" }, gem(2), gem(3)] });
    expect(ler(torta, true).prontas.map((p) => [p.indice, p.experiencia.nome])).toEqual([
      [1, "Lugar 2"],
      [2, "Lugar 3"],
    ]);
  });

  it("no máximo 3, mesmo se a IA mandar mais (e sem rascunho de uma 4ª)", () => {
    const ler = criarExtratorDeExperiencias();
    const demais = `{"experiencias":[${[gem(1), gem(2), gem(3)].map((g) => JSON.stringify(g)).join(",")},{"nome":"Quarta`;
    const leitura = ler(demais);
    expect(leitura.prontas).toHaveLength(3);
    expect(leitura.rascunho).toBeNull();
    expect(ler(demais, true).prontas).toEqual([]);
  });

  it("texto que não é o JSON esperado não quebra", () => {
    const ler = criarExtratorDeExperiencias();
    expect(ler("Desculpe, não posso ajudar.", true)).toEqual({ prontas: [], rascunho: null });
    expect(ler("", true)).toEqual({ prontas: [], rascunho: null });
  });
});

describe("leitor de linhas NDJSON (rota → tela)", () => {
  it("junta linhas partidas entre trechos", () => {
    const linhas = criarLeitorDeLinhas();
    const fluxo =
      linhaDoEvento({ tipo: "inicio", destino: "Lisboa", contexto: [] }) +
      linhaDoEvento({ tipo: "experiencia", indice: 0, experiencia: gem(1) }) +
      linhaDoEvento({ tipo: "fim" });
    const eventos = trechos(fluxo, 9).flatMap((t) => linhas(t));
    expect(eventos.map((e) => e.tipo)).toEqual(["inicio", "experiencia", "fim"]);
  });

  it("linha corrompida é ignorada; o resto segue", () => {
    const linhas = criarLeitorDeLinhas();
    const eventos = linhas('{"tipo":"inicio","destino":"X","contexto":[]}\n{quebrada\n{"tipo":"fim"}\n', true);
    expect(eventos.map((e) => e.tipo)).toEqual(["inicio", "fim"]);
  });
});

describe("estado da tela (aplicarEvento)", () => {
  const aplicar = (...eventos: EventoExperiencias[]) => eventos.reduce(aplicarEvento, estadoInicial("Lisboa"));

  it("rascunho e card pronto da mesma posição: o pronto substitui o rascunho", () => {
    const e1 = aplicar(
      { tipo: "inicio", destino: "Lisboa", contexto: ["Passeios só gratuitos"] },
      { tipo: "rascunho", indice: 0, experiencia: { nome: "Lug" } }
    );
    expect(e1).toMatchObject({ fase: "escrevendo", contexto: ["Passeios só gratuitos"], rascunho: { indice: 0 } });
    const e2 = aplicarEvento(e1, { tipo: "experiencia", indice: 0, experiencia: gem(1) });
    expect(e2.prontas).toEqual([{ indice: 0, experiencia: gem(1) }]);
    expect(e2.rascunho).toBeNull();
  });

  it("rascunho atrasado de uma posição já pronta é ignorado", () => {
    const e = aplicar(
      { tipo: "experiencia", indice: 0, experiencia: gem(1) },
      { tipo: "rascunho", indice: 0, experiencia: { nome: "velho" } }
    );
    expect(e.rascunho).toBeNull();
  });

  it("prontas ficam em ordem de posição e sem repetição", () => {
    const e = aplicar(
      { tipo: "experiencia", indice: 2, experiencia: gem(3) },
      { tipo: "experiencia", indice: 0, experiencia: gem(1) },
      { tipo: "experiencia", indice: 0, experiencia: gem(9) }
    );
    expect(e.prontas.map((p) => p.experiencia.nome)).toEqual(["Lugar 1", "Lugar 3"]);
  });

  it("fim e erro são finais; erro guarda as sugestões que já chegaram", () => {
    const comErro = aplicar(
      { tipo: "experiencia", indice: 0, experiencia: gem(1) },
      { tipo: "rascunho", indice: 1, experiencia: { nome: "meia" } },
      { tipo: "erro", mensagem: "A IA demorou demais para responder." },
      { tipo: "experiencia", indice: 1, experiencia: gem(2) }
    );
    expect(comErro).toMatchObject({ fase: "erro", erro: "A IA demorou demais para responder.", rascunho: null });
    expect(comErro.prontas).toHaveLength(1);
    expect(aplicar({ tipo: "fim" }, { tipo: "erro", mensagem: "x" }).fase).toBe("pronto");
  });

  it("evento fora do formato (posição inválida, sem dados) não muda nada", () => {
    const inicial = estadoInicial("Lisboa");
    const lixo = [
      { tipo: "experiencia", indice: 7, experiencia: gem(1) },
      { tipo: "experiencia", indice: -1, experiencia: gem(1) },
      { tipo: "rascunho", indice: 0, experiencia: null },
      { tipo: "desconhecido" },
    ] as unknown as EventoExperiencias[];
    expect(lixo.reduce(aplicarEvento, inicial)).toBe(inicial);
  });
});

describe("destino aceito pela rota", () => {
  it("nomes de lugar com acento e pontuação; recusa número, símbolo e tamanho fora da faixa", () => {
    for (const ok of ["Lisboa", "São Paulo", "Rio de Janeiro (RJ)", "Saint-Tropez", "L'Aquila", "Ilhabela, SP"]) {
      expect(destinoAceito(ok)).toBe(true);
    }
    for (const nao of ["L", "Lisboa 2", "<script>", "x".repeat(81), "   "]) expect(destinoAceito(nao)).toBe(false);
  });
});
