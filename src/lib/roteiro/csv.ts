/**
 * Leitor de CSV do roteiro (sem dependências, para o .csv nem precisar
 * baixar o `xlsx`). Aceita BOM, vírgula, ponto e vírgula ou tabulação,
 * aspas com "" escapado e quebras de linha dentro de campo entre aspas.
 */

/** O separador mais frequente fora de aspas na primeira linha com conteúdo. */
export function detectarSeparador(texto: string): "," | ";" | "\t" {
  const contagem = { ",": 0, ";": 0, "\t": 0 };
  let dentro = false;
  for (const ch of texto.slice(0, 4000)) {
    if (ch === '"') dentro = !dentro;
    else if (!dentro && (ch === "\n" || ch === "\r") && (contagem[","] || contagem[";"] || contagem["\t"])) break;
    else if (!dentro && ch in contagem) contagem[ch as keyof typeof contagem]++;
  }
  if (contagem[";"] >= contagem[","] && contagem[";"] >= contagem["\t"] && contagem[";"] > 0) return ";";
  if (contagem["\t"] > contagem[","]) return "\t";
  return ",";
}

export function lerCsv(bruto: string): string[][] {
  const texto = bruto.replace(/^\uFEFF/, "");
  const sep = detectarSeparador(texto);
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  const fecharCampo = () => {
    linha.push(campo);
    campo = "";
  };
  const fecharLinha = () => {
    fecharCampo();
    linhas.push(linha);
    linha = [];
  };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
    } else if (ch === '"' && campo === "") aspas = true;
    else if (ch === sep) fecharCampo();
    else if (ch === "\n") fecharLinha();
    else if (ch === "\r") {
      if (texto[i + 1] === "\n") i++;
      fecharLinha();
    } else campo += ch;
  }
  if (campo !== "" || linha.length > 0) fecharLinha();
  return linhas;
}
