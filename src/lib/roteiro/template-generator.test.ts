import { describe, expect, it } from "vitest";
import { lerArquivoDoRoteiro, pareceXlsx } from "./ler-arquivo";
import { COLUNAS_DO_MODELO, interpretarPlanilha } from "./planilha";
import { ABA_DE_INSTRUCOES, ABA_DO_ROTEIRO, NOME_ARQUIVO_MODELO, gerarPlanilhaModelo, instrucoesDoModelo, linhasDoModelo } from "./template-generator";
import { LIMITES_ROTEIRO } from "./tipos";

const arquivo = (conteudo: BlobPart, nome: string) => new File([conteudo], nome);

describe("modelo da planilha", () => {
  it("tem as 7 colunas pedidas, na ordem, e 3 linhas de exemplo", () => {
    expect([...COLUNAS_DO_MODELO]).toEqual(["Destino", "Data", "Turno_ou_Horario", "Atividade_ou_Lugar", "Categoria", "Custo_Estimado", "Observacoes"]);
    const linhas = linhasDoModelo();
    expect(linhas[0]).toEqual([...COLUNAS_DO_MODELO]);
    expect(linhas).toHaveLength(4);
    expect(linhas.every((l) => l.length === 7)).toBe(true);
    expect(instrucoesDoModelo().length).toBeGreaterThan(5);
    expect(NOME_ARQUIVO_MODELO).toBe("DuoPlanner-Modelo-Roteiro.xlsx");
  });

  it("o arquivo gerado é um .xlsx de verdade, com a aba Roteiro e a aba de instruções", async () => {
    const bytes = await gerarPlanilhaModelo();
    expect(pareceXlsx(bytes)).toBe(true);
    const XLSX = await import("xlsx");
    const livro = XLSX.read(bytes, { type: "array" });
    expect(livro.SheetNames).toEqual([ABA_DO_ROTEIRO, ABA_DE_INSTRUCOES]);
  });

  it("ciclo completo: gera o modelo, lê o arquivo e interpreta as 3 linhas sem nenhum problema", async () => {
    const bytes = await gerarPlanilhaModelo();
    const leitura = await lerArquivoDoRoteiro(arquivo(bytes as BlobPart, NOME_ARQUIVO_MODELO));
    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    expect(leitura.formato).toBe("xlsx");
    const r = interpretarPlanilha(leitura.matriz);
    expect(r.problemas).toEqual([]);
    expect(r.linhas.map((l) => [l.destino, l.data, l.horario ?? l.turno, l.categoria, l.custo])).toEqual([
      ["Lisboa", "2026-09-10", "manha", "Passeio", 25],
      ["Lisboa", "2026-09-10", "20:00", "Gastronomia", 120],
      ["Cascais", "2026-09-11", "tarde", "Praia", 0],
    ]);
  });
});

describe("leitura do arquivo", () => {
  it("lê um .xlsx com datas e horas do Excel (números de série) e acha a aba certa", async () => {
    const XLSX = await import("xlsx");
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet([["Leia-me"]]), "Capa");
    XLSX.utils.book_append_sheet(
      livro,
      XLSX.utils.aoa_to_sheet([
        ["Destino", "Data", "Turno_ou_Horario", "Atividade_ou_Lugar", "Custo_Estimado"],
        ["Roma", 46296, 0.375, "Coliseu", 60],
      ]),
      "Roteiro"
    );
    const bytes = new Uint8Array(XLSX.write(livro, { bookType: "xlsx", type: "array" }));
    const leitura = await lerArquivoDoRoteiro(arquivo(bytes as BlobPart, "roma.xlsx"));
    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    const r = interpretarPlanilha(leitura.matriz);
    expect(r.linhas[0]).toMatchObject({ destino: "Roma", data: "2026-10-01", horario: "09:00", custo: 60 });
  });

  it("mantém o número real da linha mesmo com linhas em branco no começo", async () => {
    const XLSX = await import("xlsx");
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet([[], [], ["Destino", "Atividade_ou_Lugar"], ["Roma", "Coliseu"], ["Roma", ""]]), "Roteiro");
    const bytes = new Uint8Array(XLSX.write(livro, { bookType: "xlsx", type: "array" }));
    const leitura = await lerArquivoDoRoteiro(arquivo(bytes as BlobPart, "x.xlsx"));
    if (!leitura.ok) throw new Error(leitura.mensagem);
    const r = interpretarPlanilha(leitura.matriz);
    expect(r.linhas[0].linha).toBe(4);
    expect(r.problemas[0]).toMatchObject({ linha: 5, gravidade: "erro" });
  });

  it("lê CSV (UTF-8 com BOM e Windows-1252) sem carregar o xlsx", async () => {
    const csv = "Destino;Data;Atividade_ou_Lugar\nSão Paulo;10/09/2026;Museu do Ipiranga\n";
    const utf8 = await lerArquivoDoRoteiro(arquivo(`\uFEFF${csv}`, "a.csv"));
    expect(utf8).toMatchObject({ ok: true, formato: "csv" });
    const latin1 = Uint8Array.from(csv, (c) => c.charCodeAt(0)); // "ã" em 1 byte (Windows-1252)
    const r = await lerArquivoDoRoteiro(arquivo(latin1 as BlobPart, "b.csv"));
    if (!r.ok) throw new Error(r.mensagem);
    expect(interpretarPlanilha(r.matriz).linhas[0]).toMatchObject({ destino: "São Paulo", atividade: "Museu do Ipiranga" });
  });

  it("recusa extensão errada, arquivo vazio, grande demais e conteúdo que não é o que diz ser", async () => {
    expect(await lerArquivoDoRoteiro(arquivo("x", "a.pdf"))).toMatchObject({ ok: false, mensagem: expect.stringContaining(".xlsx") });
    expect(await lerArquivoDoRoteiro(arquivo("", "a.csv"))).toMatchObject({ ok: false, mensagem: expect.stringContaining("vazio") });
    expect(await lerArquivoDoRoteiro(arquivo(new Uint8Array(LIMITES_ROTEIRO.arquivoBytes + 1), "a.csv"))).toMatchObject({ ok: false, mensagem: expect.stringContaining("MB") });
    expect(await lerArquivoDoRoteiro(arquivo("isto é texto", "a.xlsx"))).toMatchObject({ ok: false, mensagem: expect.stringContaining("não é uma planilha") });
    const zip = await gerarPlanilhaModelo();
    expect(await lerArquivoDoRoteiro(arquivo(zip as BlobPart, "falso.csv"))).toMatchObject({ ok: false });
  });
});
