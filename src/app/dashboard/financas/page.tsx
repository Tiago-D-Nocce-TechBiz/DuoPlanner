"use client";

import { useState } from "react";

interface ItemDespesa {
  id: string;
  data: string;
  estabelecimento: string;
  valor: number;
  categoriaDestino:
    | "Passagens & Transporte"
    | "Hospedagem"
    | "Alimentação & Gastronomia"
    | "Passeios & Lazer"
    | "Gasto Pessoal (Fora da Viagem)";
  escopo: "viagem_compartilhado" | "pessoal_privado";
  origem: string;
}

function idAleatorio() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Classifica automaticamente um item da fatura/NF por palavras-chave.
 *
 * - Passagens & Transporte: companhias aéreas, viações de ônibus, apps de
 *   mobilidade, pedágios, combustível.
 * - Hospedagem: plataformas e tipos de acomodação.
 * - Passeios & Lazer: ingressos, parques, tours, passeios (antes de alimentação
 *   para não serem absorvidos por "bar"/"praia").
 * - Alimentação & Gastronomia: restaurantes, mercados, iFood, etc.
 * - Gastos Pessoais / Fora da Viagem (privado): assinaturas, farmácia, academia
 *   e qualquer coisa não reconhecida como da viagem.
 */
function classificarItemAutomaticamente(
  titulo: string,
  valor: number,
  data: string,
  origem = "Fatura / NF"
): ItemDespesa {
  const t = titulo.toLowerCase();

  const base = { id: idAleatorio(), data, estabelecimento: titulo, valor, origem };

  const transporte = [
    "latam", "azul", "gol", "voeazul", "voegol", "decolar", "skyscanner",
    "buser", "guanabara", "util", "clickbus", "flixbus", "deonibus", "gontijo",
    "cometa", "viacao", "viação", "rodoviaria", "rodoviária",
    "uber", "99", "99app", "cabify", "pedagio", "pedágio", "sem parar", "conectcar",
    "posto", "combustivel", "combustível", "shell", "ipiranga", "petrobras",
  ];
  const hospedagem = [
    "airbnb", "booking", "hoteis", "hotéis", "hotel", "pousada", "resort",
    "hospedagem", "hostel", "vrbo", "expedia", "trivago", "flat",
  ];
  const lazer = [
    "ingresso", "ingressos", "parque", "tour", "passeio", "museu", "cinema",
    "show", "balada", "ticket", "beach club", "mergulho", "escuna", "trilha",
  ];
  const alimentacao = [
    "restaurante", "bar ", "boteco", "praia", "quiosque", "padaria",
    "lanchonete", "ifood", "mercado", "supermercado", "cafe", "café",
    "pizzaria", "hamburgueria", "churrascaria", "sorveteria", "food",
  ];
  const pessoal = [
    "academia", "farmacia", "farmácia", "drogaria", "assinatura", "streaming",
    "netflix", "spotify", "amazon prime", "mensalidade", "consulta", "plano de saude",
  ];

  const casa = (lista: string[]) => lista.some((k) => t.includes(k));

  if (casa(pessoal)) {
    return { ...base, categoriaDestino: "Gasto Pessoal (Fora da Viagem)", escopo: "pessoal_privado" };
  }
  if (casa(transporte)) {
    return { ...base, categoriaDestino: "Passagens & Transporte", escopo: "viagem_compartilhado" };
  }
  if (casa(hospedagem)) {
    return { ...base, categoriaDestino: "Hospedagem", escopo: "viagem_compartilhado" };
  }
  if (casa(lazer)) {
    return { ...base, categoriaDestino: "Passeios & Lazer", escopo: "viagem_compartilhado" };
  }
  if (casa(alimentacao)) {
    return { ...base, categoriaDestino: "Alimentação & Gastronomia", escopo: "viagem_compartilhado" };
  }

  // Desconhecido: por segurança, trata como pessoal/privado (nunca vaza).
  return { ...base, categoriaDestino: "Gasto Pessoal (Fora da Viagem)", escopo: "pessoal_privado" };
}

export default function FinancasPage() {
  const [despesasConfirmadas, setDespesasConfirmadas] = useState<ItemDespesa[]>([
    {
      id: "1",
      data: "08/07/2027",
      estabelecimento: "Expresso Guanabara - Passagens BH x RJ",
      valor: 340.0,
      categoriaDestino: "Passagens & Transporte",
      escopo: "viagem_compartilhado",
      origem: "Nubank CSV",
    },
    {
      id: "2",
      data: "09/07/2027",
      estabelecimento: "Airbnb Pousada Búzios",
      valor: 1480.0,
      categoriaDestino: "Hospedagem",
      escopo: "viagem_compartilhado",
      origem: "Nubank CSV",
    },
  ]);

  const [itensTriagem, setItensTriagem] = useState<ItemDespesa[]>([]);
  const [textoColado, setTextoColado] = useState("");
  const [abaVisualizacao, setAbaVisualizacao] = useState<"compartilhado" | "privado">("compartilhado");
  const [tituloManual, setTituloManual] = useState("");
  const [valorManual, setValorManual] = useState("");
  const [categoriaManual, setCategoriaManual] =
    useState<ItemDespesa["categoriaDestino"]>("Alimentação & Gastronomia");
  const [escopoManual, setEscopoManual] =
    useState<ItemDespesa["escopo"]>("viagem_compartilhado");

  // Processa arquivo CSV real do Nubank (date,category,title,amount) ou texto de NF
  const handleUploadFatura = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const linhas = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const extraidos: ItemDespesa[] = [];

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      if (i === 0 && linha.toLowerCase().includes("amount")) continue;

      const partes = linha.split(",");
      if (partes.length >= 4) {
        const data = partes[0].trim();
        const titulo = partes[2].trim();
        const valor = Math.abs(parseFloat(partes[3].trim()) || 0);
        if (valor > 0) {
          extraidos.push(classificarItemAutomaticamente(titulo, valor, data));
        }
      } else if (partes.length >= 2) {
        const titulo = partes[0].trim();
        const valor = Math.abs(parseFloat(partes[1].replace("R$", "").trim()) || 0);
        if (valor > 0) {
          extraidos.push(classificarItemAutomaticamente(titulo, valor, "10/07/2027"));
        }
      }
    }

    if (extraidos.length > 0) {
      setItensTriagem(extraidos);
    }
  };

  // Processa texto colado diretamente da fatura ou NF.
  // Aceita linhas no formato "data,categoria,titulo,valor" (CSV Nubank) ou,
  // de forma tolerante, "titulo .... valor" / "titulo;valor".
  const processarTextoColado = () => {
    const linhas = textoColado.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const extraidos: ItemDespesa[] = [];

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i].trim();
      if (i === 0 && linha.toLowerCase().includes("amount")) continue;

      const partesCsv = linha.split(/[,;\t]/).map((p) => p.trim());
      if (partesCsv.length >= 4) {
        const data = partesCsv[0] || new Date().toLocaleDateString("pt-BR");
        const titulo = partesCsv[2];
        const valor = Math.abs(parseFloat(partesCsv[3].replace(/[^0-9,.-]/g, "").replace(",", ".")) || 0);
        if (titulo && valor > 0) extraidos.push(classificarItemAutomaticamente(titulo, valor, data, "Texto colado"));
        continue;
      }

      // Formato livre: pega o último número como valor e o resto como título.
      const m = linha.match(/(.+?)[\s.]*R?\$?\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)\s*$/);
      if (m) {
        const titulo = m[1].replace(/[.\-–—]+$/, "").trim();
        const valor = Math.abs(parseFloat(m[2].replace(/\./g, "").replace(",", ".")) || 0);
        if (titulo && valor > 0) {
          extraidos.push(
            classificarItemAutomaticamente(titulo, valor, new Date().toLocaleDateString("pt-BR"), "Texto colado")
          );
        }
      }
    }

    if (extraidos.length > 0) {
      setItensTriagem(extraidos);
      setTextoColado("");
    }
  };

  // Simulação rápida de Fatura Nubank Realista para teste imediato com 1 clique
  const carregarExemploFaturaNubank = () => {
    const simulacao: ItemDespesa[] = [
      classificarItemAutomaticamente("Buser Fretamento BH - Cabo Frio", 298.9, "08/07/2027"),
      classificarItemAutomaticamente("Booking.com Pousada Rua das Pedras", 1650.0, "09/07/2027"),
      classificarItemAutomaticamente("Restaurante Porto da Barra Búzios", 245.5, "10/07/2027"),
      classificarItemAutomaticamente("Uber Viagem Praia de Geribá", 42.8, "10/07/2027"),
      classificarItemAutomaticamente("Academia Mensalidade Pessoal", 139.9, "05/07/2027"),
      classificarItemAutomaticamente("Farmácia Araújo Uso Pessoal", 94.2, "06/07/2027"),
      classificarItemAutomaticamente("Assinatura Streaming Pessoal", 55.9, "07/07/2027"),
    ];
    setItensTriagem(simulacao);
  };

  const alternarEscopoTriagem = (id: string) => {
    setItensTriagem((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              escopo:
                item.escopo === "viagem_compartilhado"
                  ? "pessoal_privado"
                  : "viagem_compartilhado",
            }
          : item
      )
    );
  };

  const confirmarTriagem = () => {
    setDespesasConfirmadas((prev) => [...itensTriagem, ...prev]);
    setItensTriagem([]);
  };

  const adicionarDespesaManual = (e: React.FormEvent) => {
    e.preventDefault();
    const valorNum = parseFloat(valorManual.replace(",", "."));
    if (!tituloManual || isNaN(valorNum) || valorNum <= 0) return;

    const nova: ItemDespesa = {
      id: Math.random().toString(36).substring(2, 9),
      data: new Date().toLocaleDateString("pt-BR"),
      estabelecimento: tituloManual,
      valor: valorNum,
      categoriaDestino: categoriaManual,
      escopo: escopoManual,
      origem: "Manual",
    };

    setDespesasConfirmadas((prev) => [nova, ...prev]);
    setTituloManual("");
    setValorManual("");
  };

  const gastosCompartilhados = despesasConfirmadas.filter(
    (d) => d.escopo === "viagem_compartilhado"
  );
  const gastosPrivados = despesasConfirmadas.filter(
    (d) => d.escopo === "pessoal_privado"
  );

  const totalCompartilhado = gastosCompartilhados.reduce((acc, i) => acc + i.valor, 0);
  const metadeCasal = totalCompartilhado / 2;
  const totalPrivadoOculto = gastosPrivados.reduce((acc, i) => acc + i.valor, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Finanças Duo & Triagem Nubank / NF
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Importe sua fatura do Nubank ou Nota Fiscal: o sistema separa para onde foi cada gasto, mas compartilha com seu parceiro(a) <strong>apenas os gastos da viagem</strong>.
        </p>
      </div>

      {/* Resumo Financeiro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Total da Viagem (Compartilhado)
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">
            R$ {totalCompartilhado.toFixed(2).replace(".", ",")}
          </p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">
            Visível para as 2 contas conectadas
          </span>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Sua Parte (50% da Viagem)
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">
            R$ {metadeCasal.toFixed(2).replace(".", ",")}
          </p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">
            Divisão igualitária apenas dos itens de viagem
          </span>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Seus Gastos Pessoais (Ocultos 🔒)
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">
            R$ {totalPrivadoOculto.toFixed(2).replace(".", ",")}
          </p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">
            Privado: nunca entra na divisão da dupla
          </span>
        </div>
      </div>

      {/* Importador de Fatura Nubank / NF + Lançamento Manual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">
              Importar Fatura Nubank ou Nota Fiscal
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
              Envie o CSV do Nubank (padrão <code>date,category,title,amount</code>), uma Nota Fiscal ou cole o texto da fatura. Antes de sincronizar com a pessoa convidada, você revisa o que é da viagem e o que é pessoal.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer hover:opacity-90 transition-opacity">
              📂 Selecionar arquivo (CSV / TXT / NF)
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleUploadFatura}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={carregarExemploFaturaNubank}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              ⚡ Testar com fatura de exemplo
            </button>
          </div>

          {/* Colagem direta do texto da fatura */}
          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
              Ou cole o texto da fatura
            </label>
            <textarea
              value={textoColado}
              onChange={(e) => setTextoColado(e.target.value)}
              rows={3}
              placeholder={"Ex.:\n08/07/2027,transporte,Buser BH x Cabo Frio,298,90\nRestaurante Búzios  R$ 245,50"}
              className="glass-input resize-none font-mono text-xs"
            />
            <button
              type="button"
              onClick={processarTextoColado}
              disabled={!textoColado.trim()}
              className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer disabled:opacity-50"
            >
              📝 Ler texto colado
            </button>
          </div>
        </div>

        {/* Lançamento Manual */}
        <form onSubmit={adicionarDespesaManual} className="glass-panel rounded-2xl p-6 space-y-4">
          <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">
            Adicionar Gasto Manualmente
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Descrição (Ex.: Jantar em Búzios)"
              value={tituloManual}
              onChange={(e) => setTituloManual(e.target.value)}
              className="glass-input"
            />
            <input
              type="text"
              placeholder="Valor R$ (Ex.: 180,00)"
              value={valorManual}
              onChange={(e) => setValorManual(e.target.value)}
              className="glass-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={categoriaManual}
              onChange={(e) =>
                setCategoriaManual(e.target.value as ItemDespesa["categoriaDestino"])
              }
              className="glass-input"
            >
              <option value="Passagens & Transporte">✈️ Passagens & Transporte</option>
              <option value="Hospedagem">🏨 Hospedagem</option>
              <option value="Alimentação & Gastronomia">🍽️ Alimentação & Gastronomia</option>
              <option value="Passeios & Lazer">🎟️ Passeios & Lazer</option>
              <option value="Gasto Pessoal (Fora da Viagem)">🔒 Gasto Pessoal (Privado)</option>
            </select>

            <select
              value={escopoManual}
              onChange={(e) => setEscopoManual(e.target.value as ItemDespesa["escopo"])}
              className="glass-input"
            >
              <option value="viagem_compartilhado">👥 Compartilhar na Viagem</option>
              <option value="pessoal_privado">🔒 Apenas Meu (Privado)</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
          >
            + Registrar Lançamento
          </button>
        </form>
      </div>

      {/* Caixa de Triagem de Privacidade (Aparece ao importar Fatura Nubank / NF) */}
      {itensTriagem.length > 0 && (
        <div className="glass-panel rounded-2xl p-6 border-2 border-[var(--color-border-strong)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-serif text-xl font-bold text-[var(--color-heading)]">
                🔍 Triagem de Privacidade da Fatura Importada
              </h3>
              <p className="text-xs text-[var(--color-muted)]">
                Classificamos automaticamente cada item. Clique no botão de status caso queira mudar entre <strong>Compartilhado na Viagem</strong> ou <strong>Pessoal (Oculto)</strong>.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setItensTriagem([])}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarTriagem}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
              >
                ✓ Confirmar e Sincronizar Apenas Gastos da Viagem
              </button>
            </div>
          </div>

          {/* Resumo analítico da fatura importada, por categoria */}
          {(() => {
            const porCategoria = itensTriagem.reduce<Record<string, { total: number; qtd: number }>>(
              (acc, item) => {
                const atual = acc[item.categoriaDestino] ?? { total: 0, qtd: 0 };
                atual.total += item.valor;
                atual.qtd += 1;
                acc[item.categoriaDestino] = atual;
                return acc;
              },
              {}
            );
            const totalGeral = itensTriagem.reduce((a, i) => a + i.valor, 0);
            return (
              <div className="mb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {Object.entries(porCategoria).map(([cat, { total, qtd }]) => (
                  <div key={cat} className="rounded-xl border border-[var(--color-border)] px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-[var(--color-muted)] leading-tight">{cat}</p>
                    <p className="mt-1 font-serif text-base font-bold text-[var(--color-heading)]">
                      R$ {total.toFixed(2).replace(".", ",")}
                    </p>
                    <p className="text-[11px] text-[var(--color-subtle)]">{qtd} item(ns)</p>
                  </div>
                ))}
                <div className="rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-foreground)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold opacity-80 leading-tight">Total da fatura</p>
                  <p className="mt-1 font-serif text-base font-bold">
                    R$ {totalGeral.toFixed(2).replace(".", ",")}
                  </p>
                  <p className="text-[11px] opacity-80">{itensTriagem.length} item(ns)</p>
                </div>
              </div>
            );
          })()}

          <div className="space-y-2.5">
            {itensTriagem.map((item) => (
              <div
                key={item.id}
                className="glass-panel rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">
                    {item.estabelecimento}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {item.data} • Para onde foi: <strong>{item.categoriaDestino}</strong>
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="font-serif font-bold text-sm">
                    R$ {item.valor.toFixed(2).replace(".", ",")}
                  </span>
                  <button
                    type="button"
                    onClick={() => alternarEscopoTriagem(item.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                      item.escopo === "viagem_compartilhado"
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-500/20 text-[var(--color-muted)]"
                    }`}
                  >
                    {item.escopo === "viagem_compartilhado"
                      ? "👥 Viagem (Compartilhar)"
                      : "🔒 Pessoal (Oculto p/ Dupla)"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Listagem Separada: Compartilhados da Viagem vs. Meus Gastos Pessoais */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setAbaVisualizacao("compartilhado")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              abaVisualizacao === "compartilhado"
                ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                : "glass-panel text-[var(--color-muted)]"
            }`}
          >
            👥 Gastos da Viagem Compartilhados ({gastosCompartilhados.length})
          </button>
          <button
            type="button"
            onClick={() => setAbaVisualizacao("privado")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              abaVisualizacao === "privado"
                ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                : "glass-panel text-[var(--color-muted)]"
            }`}
          >
            🔒 Meus Gastos Pessoais da Fatura ({gastosPrivados.length})
          </button>
        </div>

        <div className="space-y-3">
          {(abaVisualizacao === "compartilhado" ? gastosCompartilhados : gastosPrivados).map(
            (item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[var(--color-border)] px-4 py-3 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">
                    {item.estabelecimento}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {item.data} • Destino do gasto: <strong>{item.categoriaDestino}</strong> • Origem: {item.origem}
                  </p>
                </div>
                <span className="font-serif text-base font-bold text-[var(--color-heading)]">
                  R$ {item.valor.toFixed(2).replace(".", ",")}
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}