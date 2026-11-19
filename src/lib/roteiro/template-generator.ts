import { COLUNAS_DO_MODELO } from "./planilha";

/**
 * Planilha modelo do Roteiro (`DuoPlanner-Modelo-Roteiro.xlsx`).
 *
 * O `xlsx` (SheetJS) só entra aqui por `import()` dinâmico, dentro da função
 * chamada no clique: quem nunca baixa o modelo nem importa uma planilha não
 * carrega uma linha dele. Nada deste módulo importa o `xlsx` no topo.
 */

export const NOME_ARQUIVO_MODELO = "DuoPlanner-Modelo-Roteiro.xlsx";
export const ABA_DO_ROTEIRO = "Roteiro";
export const ABA_DE_INSTRUCOES = "Instruções";

/** Cabeçalho + 3 linhas de exemplo (a pessoa as apaga e preenche as dela). */
export function linhasDoModelo(): string[][] {
  return [
    [...COLUNAS_DO_MODELO],
    ["Lisboa", "2026-09-10", "Manhã", "Bondinho 28 até a Alfama", "Passeio", "25", "Exemplo: chegue cedo para evitar fila"],
    ["Lisboa", "2026-09-10", "20:00", "Jantar no Time Out Market", "Gastronomia", "120", "Exemplo: reserva para dois"],
    ["Cascais", "2026-09-11", "Tarde", "Praia de Carcavelos", "Praia", "0", "Exemplo: leve protetor solar"],
  ];
}

export function instrucoesDoModelo(): string[][] {
  return [
    ["Como preencher a aba Roteiro"],
    ["1. Apague as 3 linhas de exemplo e escreva as suas, uma atividade por linha. Não mude os nomes das colunas."],
    ["Destino: cidade ou região do dia (ex.: Lisboa). Ajuda a Nora a sugerir praias, passeios e restaurantes."],
    ["Data: DD/MM/AAAA ou AAAA-MM-DD. Deixe em branco para atividades sem dia marcado."],
    ["Turno_ou_Horario: Manhã, Tarde, Noite ou um horário (09:30). Em branco, a atividade fica sem turno."],
    ["Atividade_ou_Lugar: obrigatório. O que vocês vão fazer ou o lugar (até 120 caracteres)."],
    ["Categoria: Praia, Passeio, Gastronomia, Transporte, Hospedagem ou Outros. Em branco, o app tenta descobrir."],
    ["Custo_Estimado: em reais, só o número (ex.: 120 ou 89,90). Grátis = 0. É uma estimativa, não um gasto lançado."],
    ["Observacoes: reservas, endereço, lembretes (até 500 caracteres)."],
    ["Até 300 atividades por planilha. Importar a mesma planilha de novo não duplica o que já está no roteiro."],
  ];
}

/** Gera o arquivo .xlsx na memória. */
export async function gerarPlanilhaModelo(): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const livro = XLSX.utils.book_new();

  const roteiro = XLSX.utils.aoa_to_sheet(linhasDoModelo());
  roteiro["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 34 }, { wch: 15 }, { wch: 15 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(livro, roteiro, ABA_DO_ROTEIRO);

  const instrucoes = XLSX.utils.aoa_to_sheet(instrucoesDoModelo());
  instrucoes["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(livro, instrucoes, ABA_DE_INSTRUCOES);

  const saida: ArrayBuffer | Uint8Array = XLSX.write(livro, { bookType: "xlsx", type: "array" });
  return saida instanceof Uint8Array ? saida : new Uint8Array(saida);
}

/** Gera e baixa o modelo no navegador. */
export async function baixarPlanilhaModelo(): Promise<void> {
  const bytes = await gerarPlanilhaModelo();
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = NOME_ARQUIVO_MODELO;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // O download já foi entregue ao navegador; soltar a URL depois evita cancelá-lo.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
