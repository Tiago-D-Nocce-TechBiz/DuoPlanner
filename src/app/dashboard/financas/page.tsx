"use client";

import { useState } from "react";

/**
 * Finanças Duo — controle de gastos da viagem com triagem de privacidade.
 *
 * Importa uma fatura (CSV/TXT) ou texto colado, classifica os itens por
 * categoria e separa o que é da viagem (compartilhado) do que é pessoal
 * (privado, nunca entra na divisão da dupla). Começa vazio, pronto para dados
 * reais — sem marcas de bancos nem dados de exemplo.
 */

type Categoria =
  | "Passagens & Transporte"
  | "Hospedagem"
  | "Alimentação & Gastronomia"
  | "Passeios & Lazer"
  | "Gasto Pessoal (Fora da Viagem)";

type Escopo = "viagem_compartilhado" | "pessoal_privado";

interface ItemDespesa {
  id: string;
  data: string;
  estabelecimento: string;
  valor: number;
  categoriaDestino: Categoria;
  escopo: Escopo;
  origem: string;
}

function idAleatorio() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Classifica automaticamente um item por palavras-chave:
 * transporte, hospedagem, lazer, alimentação ou pessoal (privado por padrão
 * quando não reconhecido, para nunca vazar um gasto particular).
 */
function classificarItemAutomaticamente(
  titulo: string,
  valor: number,
  data: string,
  origem = "Importado"
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
    "mensalidade", "consulta", "plano de saude",
  ];

  const casa = (lista: string[]) => lista.some((k) => t.includes(k));

  if (casa(pessoal)) return { ...base, categoriaDestino: "Gasto Pessoal (Fora da Viagem)", escopo: "pessoal_privado" };
  if (casa(transporte)) return { ...base, categoriaDestino: "Passagens & Transporte", escopo: "viagem_compartilhado" };
  if (casa(hospedagem)) return { ...base, categoriaDestino: "Hospedagem", escopo: "viagem_compartilhado" };
  if (casa(lazer)) return { ...base, categoriaDestino: "Passeios & Lazer", escopo: "viagem_compartilhado" };
  if (casa(alimentacao)) return { ...base, categoriaDestino: "Alimentação & Gastronomia", escopo: "viagem_compartilhado" };
  return { ...base, categoriaDestino: "Gasto Pessoal (Fora da Viagem)", escopo: "pessoal_privado" };
}

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "Passagens & Transporte", label: "✈️ Passagens & Transporte" },
  { value: "Hospedagem", label: "🏨 Hospedagem" },
  { value: "Alimentação & Gastronomia", label: "🍽️ Alimentação & Gastronomia" },
  { value: "Passeios & Lazer", label: "🎟️ Passeios & Lazer" },
  { value: "Gasto Pessoal (Fora da Viagem)", label: "🔒 Gasto Pessoal (Privado)" },
];

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export default function FinancasPage() {
  // Começa vazio — pronto para receber dados reais.
  const [despesas, setDespesas] = useState<ItemDespesa[]>([]);
  const [itensTriagem, setItensTriagem] = useState<ItemDespesa[]>([]);
  const [textoColado, setTextoColado] = useState("");
  const [aba, setAba] = useState<"compartilhado" | "privado">("compartilhado");

  const [tituloManual, setTituloManual] = useState("");
  const [valorManual, setValorManual] = useState("");
  const [categoriaManual, setCategoriaManual] = useState<Categoria>("Alimentação & Gastronomia");
  const [escopoManual, setEscopoManual] = useState<Escopo>("viagem_compartilhado");

  // Importa arquivo CSV/TXT (formato tolerante: data,categoria,titulo,valor).
  const handleUploadFatura = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const texto = await file.text();
    extrairDoTexto(texto);
    e.target.value = "";
  };

  // Lê texto colado (CSV ou "título ... valor" por linha).
  const extrairDoTexto = (texto: string) => {
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const extraidos: ItemDespesa[] = [];
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i].trim();
      if (i === 0 && linha.toLowerCase().includes("amount")) continue;

      const partes = linha.split(/[,;\t]/).map((p) => p.trim());
      if (partes.length >= 4) {
        const data = partes[0] || new Date().toLocaleDateString("pt-BR");
        const titulo = partes[2];
        const valor = Math.abs(parseFloat(partes[3].replace(/[^0-9,.-]/g, "").replace(",", ".")) || 0);
        if (titulo && valor > 0) extraidos.push(classificarItemAutomaticamente(titulo, valor, data));
        continue;
      }
      const m = linha.match(/(.+?)[\s.]*R?\$?\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)\s*$/);
      if (m) {
        const titulo = m[1].replace(/[.\-–—]+$/, "").trim();
        const valor = Math.abs(parseFloat(m[2].replace(/\./g, "").replace(",", ".")) || 0);
        if (titulo && valor > 0) {
          extraidos.push(
            classificarItemAutomaticamente(titulo, valor, new Date().toLocaleDateString("pt-BR"))
          );
        }
      }
    }
    if (extraidos.length > 0) {
      setItensTriagem(extraidos);
      setTextoColado("");
    }
  };

  const alternarEscopoTriagem = (id: string) =>
    setItensTriagem((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, escopo: item.escopo === "viagem_compartilhado" ? "pessoal_privado" : "viagem_compartilhado" }
          : item
      )
    );

  const confirmarTriagem = () => {
    setDespesas((prev) => [...itensTriagem, ...prev]);
    setItensTriagem([]);
  };

  const adicionarDespesaManual = (e: React.FormEvent) => {
    e.preventDefault();
    const valorNum = parseFloat(valorManual.replace(",", "."));
    if (!tituloManual || isNaN(valorNum) || valorNum <= 0) return;
    const nova: ItemDespesa = {
      id: idAleatorio(),
      data: new Date().toLocaleDateString("pt-BR"),
      estabelecimento: tituloManual,
      valor: valorNum,
      categoriaDestino: categoriaManual,
      escopo: escopoManual,
      origem: "Manual",
    };
    setDespesas((prev) => [nova, ...prev]);
    setTituloManual("");
    setValorManual("");
  };

  const compartilhados = despesas.filter((d) => d.escopo === "viagem_compartilhado");
  const privados = despesas.filter((d) => d.escopo === "pessoal_privado");
  const totalCompartilhado = compartilhados.reduce((a, i) => a + i.valor, 0);
  const totalPrivado = privados.reduce((a, i) => a + i.valor, 0);
  const lista = aba === "compartilhado" ? compartilhados : privados;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Finanças Duo
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)] max-w-2xl">
          Controle os gastos da viagem a dois. Importe uma fatura ou lance manualmente — apenas os gastos marcados como da viagem são compartilhados; os pessoais ficam privados.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Total da viagem (compartilhado)
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(totalCompartilhado)}</p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">Visível para as duas contas</span>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Sua parte (50%)
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(totalCompartilhado / 2)}</p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">Divisão igual dos itens da viagem</span>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Seus gastos pessoais 🔒
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(totalPrivado)}</p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">Privado: nunca entra na divisão</span>
        </div>
      </div>

      {/* Importar + Lançar manual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Importar fatura ou recibo</h2>
            <p className="mt-1.5 text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
              Envie um arquivo CSV/TXT ou cole o texto. Você revisa a triagem antes de confirmar.
            </p>
          </div>

          <div className="mt-5">
            <label className="inline-flex px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer hover:opacity-90 transition-opacity">
              📂 Selecionar arquivo (CSV / TXT)
              <input type="file" accept=".csv,.txt" onChange={handleUploadFatura} className="hidden" />
            </label>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
              Ou cole o texto da fatura
            </label>
            <textarea
              value={textoColado}
              onChange={(e) => setTextoColado(e.target.value)}
              rows={3}
              placeholder={"Um lançamento por linha. Ex.:\nRestaurante na orla  R$ 120,00"}
              className="glass-input resize-none font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => extrairDoTexto(textoColado)}
              disabled={!textoColado.trim()}
              className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer disabled:opacity-50"
            >
              📝 Ler texto colado
            </button>
          </div>
        </div>

        <form onSubmit={adicionarDespesaManual} className="glass-panel rounded-2xl p-6 space-y-4">
          <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Adicionar gasto manualmente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Descrição"
              value={tituloManual}
              onChange={(e) => setTituloManual(e.target.value)}
              className="glass-input"
            />
            <input
              type="text"
              placeholder="Valor R$ (ex.: 180,00)"
              value={valorManual}
              onChange={(e) => setValorManual(e.target.value)}
              className="glass-input"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={categoriaManual} onChange={(e) => setCategoriaManual(e.target.value as Categoria)} className="glass-input">
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select value={escopoManual} onChange={(e) => setEscopoManual(e.target.value as Escopo)} className="glass-input">
              <option value="viagem_compartilhado">👥 Compartilhar na viagem</option>
              <option value="pessoal_privado">🔒 Apenas meu (privado)</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
          >
            + Registrar lançamento
          </button>
        </form>
      </div>

      {/* Triagem de privacidade (aparece ao importar) */}
      {itensTriagem.length > 0 && (
        <div className="glass-panel rounded-2xl p-6 ring-1 ring-[var(--color-border-strong)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="font-serif text-xl font-bold text-[var(--color-heading)]">Revisar antes de salvar</h3>
              <p className="text-xs text-[var(--color-muted)]">
                Toque no status para alternar entre compartilhado e pessoal.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setItensTriagem([])} className="px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel cursor-pointer">
                Cancelar
              </button>
              <button type="button" onClick={confirmarTriagem} className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer">
                ✓ Confirmar
              </button>
            </div>
          </div>
          <div className="space-y-2.5">
            {itensTriagem.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--color-border)] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">{item.estabelecimento}</p>
                  <p className="text-xs text-[var(--color-muted)]">{item.data} • {item.categoriaDestino}</p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="font-serif font-bold text-sm text-[var(--color-heading)]">{brl(item.valor)}</span>
                  <button
                    type="button"
                    onClick={() => alternarEscopoTriagem(item.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                      item.escopo === "viagem_compartilhado"
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-500/20 text-[var(--color-muted)]"
                    }`}
                  >
                    {item.escopo === "viagem_compartilhado" ? "👥 Viagem" : "🔒 Pessoal"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de despesas */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setAba("compartilhado")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              aba === "compartilhado" ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "glass-panel text-[var(--color-muted)]"
            }`}
          >
            👥 Compartilhados ({compartilhados.length})
          </button>
          <button
            type="button"
            onClick={() => setAba("privado")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              aba === "privado" ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "glass-panel text-[var(--color-muted)]"
            }`}
          >
            🔒 Pessoais ({privados.length})
          </button>
        </div>

        {lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            Nenhum gasto {aba === "compartilhado" ? "da viagem" : "pessoal"} ainda. Importe uma fatura ou adicione um lançamento.
          </p>
        ) : (
          <div className="space-y-3">
            {lista.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--color-border)] px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">{item.estabelecimento}</p>
                  <p className="text-xs text-[var(--color-muted)]">{item.data} • {item.categoriaDestino}</p>
                </div>
                <span className="font-serif text-base font-bold text-[var(--color-heading)]">{brl(item.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
