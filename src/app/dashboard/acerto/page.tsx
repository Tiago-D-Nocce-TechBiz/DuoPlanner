"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Handshake, Users, AlertTriangle, Coins } from "@/components/ui/icons";
import { salvarAcordoDivisao } from "@/app/dashboard/sincronizacao-actions";
import { calcularAcerto, descreverRegra, normalizarPercentual, valorEmReais, type Papel } from "@/lib/finance/acerto";
import { criarDespesa, atualizarDespesa, lancamentosDoAcerto, removerDespesa, useDespesas, type Despesa } from "@/lib/finance/store";
import { formatarMoeda } from "@/lib/cambio/use-cotacoes";
import { isoToBR, todayInSaoPaulo } from "@/lib/dates";
import { gerarPixCopiaECola } from "@/lib/pix/brcode";
import { papeisDoCasal, regraDoAcordo, type AcordoDivisao, type Membro } from "@/lib/sync/contexto";
import { atualizarContexto, useContextoSync } from "@/lib/sync/motor";

/**
 * Acerto de Contas — "quem deve a quem", direto dos gastos compartilhados.
 *
 * Lê `despesas_viagem` (sincronizado), aplica a regra do casal (50/50,
 * proporcional ou valor fixo; cada gasto pode ter divisão própria) e gera o
 * Pix Copia e Cola do saldo. Pagar e registrar o acerto zera a conta para os
 * dois na hora (lançamento `tipo = acerto`).
 */

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const OPCOES_DIVISAO: { valor: string; rotulo: string; proporcao: number | null }[] = [
  { valor: "regra", rotulo: "Regra do casal", proporcao: null },
  { valor: "metade", rotulo: "Metade (50/50)", proporcao: 50 },
  { valor: "pagador", rotulo: "Só de quem pagou", proporcao: 100 },
  { valor: "outro", rotulo: "Só do outro", proporcao: 0 },
];

function opcaoDaProporcao(p: number | null): string {
  if (p === null) return "regra";
  if (p === 50) return "metade";
  if (p === 100) return "pagador";
  if (p === 0) return "outro";
  return "regra";
}

export default function AcertoPage() {
  const despesas = useDespesas();
  const ctx = useContextoSync();
  const casal = ctx ? papeisDoCasal(ctx.membros) : null;

  if (!ctx) {
    return (
      <div className="space-y-8">
        <Cabecalho />
        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-[var(--color-muted)]">Carregando o acerto…</div>
      </div>
    );
  }

  if (!casal) {
    return (
      <div className="space-y-8">
        <Cabecalho />
        <div className="glass-panel rounded-2xl p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-[var(--color-heading)]" />
          <h2 className="mt-3 font-serif text-2xl font-bold text-[var(--color-heading)]">Convide seu par para acertar as contas</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)] max-w-md mx-auto">
            O acerto compara o que cada um pagou com a parte de cada um. Assim que a outra pessoa entrar no espaço,
            os gastos da viagem aparecem aqui para os dois.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("nora:abrir-convite"))}
            className="mt-5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
          >
            + Convidar parceiro(a)
          </button>
        </div>
      </div>
    );
  }

  return <AcertoDoCasal despesas={despesas} meuId={ctx.userId} dono={casal.dono} parceiro={casal.parceiro} acordo={ctx.acordo} />;
}

function Cabecalho() {
  return (
    <div>
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">Acerto de Contas</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Quem pagou o quê, a parte de cada um pela regra combinada e o Pix para zerar o saldo.
      </p>
    </div>
  );
}

function AcertoDoCasal({
  despesas,
  meuId,
  dono,
  parceiro,
  acordo,
}: {
  despesas: Despesa[];
  meuId: string;
  dono: Membro;
  parceiro: Membro;
  acordo: AcordoDivisao;
}) {
  const membros: Record<Papel, Membro> = { dono, parceiro };
  const nomes: Record<Papel, string> = { dono: dono.nome, parceiro: parceiro.nome };
  const meuPapel: Papel = meuId === dono.userId ? "dono" : "parceiro";
  // A regra nova vale na tela (saldo, partes, Pix) assim que é salva; se o
  // servidor recusar, volta sozinha à regra confirmada.
  const [acordoNaTela, mostrarAcordo] = useOptimistic(acordo);
  const regra = useMemo(() => regraDoAcordo(acordoNaTela), [acordoNaTela]);

  const { lancamentos, semCotacao } = useMemo(() => lancamentosDoAcerto(despesas), [despesas]);
  const r = useMemo(
    () => calcularAcerto(lancamentos, { dono: dono.userId, parceiro: parceiro.userId }, regra),
    [lancamentos, dono.userId, parceiro.userId, regra]
  );
  const gastos = despesas
    .filter((d) => d.escopo === "viagem_compartilhado" && d.tipo === "gasto")
    .sort((a, b) => b.data.localeCompare(a.data));
  const acertos = despesas
    .filter((d) => d.escopo === "viagem_compartilhado" && d.tipo === "acerto")
    .sort((a, b) => b.data.localeCompare(a.data));

  const devedor = r.devedor ? membros[r.devedor] : null;
  const credor = r.credor ? membros[r.credor] : null;

  return (
    <div className="space-y-8">
      <Cabecalho />

      {/* Saldo */}
      <section className="glass-panel rounded-2xl p-6 text-center" aria-live="polite">
        {r.totalGastos === 0 && acertos.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Nenhum gasto da viagem ainda. Lance no <Link href="/dashboard/financas" className="underline">DuoFinance</Link>.
          </p>
        ) : !devedor || !credor ? (
          <p className="inline-flex items-center justify-center gap-2 font-serif text-xl font-bold text-[var(--color-heading)]">
            <CheckCircle2 className="h-5 w-5" />
            Contas equilibradas! Ninguém deve nada.
          </p>
        ) : (
          <>
            <p className="text-sm text-[var(--color-muted)]">Acerto final</p>
            <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold text-[var(--color-heading)]">
              {devedor.userId === meuId ? "Você" : devedor.nome} paga {brl(r.valorAcerto)} para{" "}
              {credor.userId === meuId ? "você" : credor.nome}
            </p>
          </>
        )}
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Total da viagem {brl(r.totalGastos)} · {descreverRegra(regra, nomes)}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-left">
          {(["dono", "parceiro"] as Papel[]).map((papel) => (
            <div key={papel} className="rounded-xl border border-[var(--color-border)] p-3">
              <span className="text-[10px] font-mono uppercase text-[var(--color-subtle)]">{nomes[papel]}</span>
              <p className="mt-1 text-xs text-[var(--color-muted)]">Pagou <strong className="text-[var(--color-heading)]">{brl(r.pago[papel])}</strong></p>
              <p className="text-xs text-[var(--color-muted)]">Parte <strong className="text-[var(--color-heading)]">{brl(r.parte[papel])}</strong></p>
            </div>
          ))}
        </div>
        {(semCotacao > 0 || r.ignorados > 0) && (
          <p className="mt-4 flex items-start justify-center gap-2 text-xs text-[var(--color-muted)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {semCotacao > 0 && `${semCotacao} gasto(s) em moeda estrangeira sem cotação ficaram fora. `}
            {r.ignorados > 0 && `${r.ignorados} gasto(s) pagos por quem não está mais no espaço ficaram fora.`}
          </p>
        )}
      </section>

      {devedor && credor && (
        <PagamentoPix valor={r.valorAcerto} devedor={devedor} credor={credor} meuId={meuId} />
      )}

      <EditorRegra acordo={acordo} nomes={nomes} meuPapel={meuPapel} aoSalvar={mostrarAcordo} />

      {/* Gastos que entram no acerto */}
      <section className="glass-panel rounded-2xl p-5 space-y-3">
        <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Gastos da viagem</h2>
        {gastos.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Nenhum gasto compartilhado ainda.</p>
        ) : (
          <ul className="space-y-2.5">
            {gastos.map((d) => {
              const pagador = d.pagoPor ?? d.userId;
              const emReais = valorEmReais(d);
              return (
                <li key={d.id} className="rounded-xl border border-[var(--color-border)] px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-heading)] break-words">{d.descricao}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {isoToBR(d.data)} · {formatarMoeda(d.valor, d.moeda)}
                      {d.moeda !== "BRL" && emReais !== null && ` (≈ ${brl(emReais)})`}
                    </p>
                  </div>
                  <select
                    aria-label={`Quem pagou ${d.descricao}`}
                    value={pagador}
                    onChange={(e) => atualizarDespesa(d.id, { pagoPor: e.target.value })}
                    className="glass-input sm:w-40"
                  >
                    <option value={dono.userId}>{dono.nome} pagou</option>
                    <option value={parceiro.userId}>{parceiro.nome} pagou</option>
                  </select>
                  <select
                    aria-label={`Divisão de ${d.descricao}`}
                    value={opcaoDaProporcao(d.proporcaoDivisao)}
                    onChange={(e) => {
                      const opcao = OPCOES_DIVISAO.find((o) => o.valor === e.target.value);
                      atualizarDespesa(d.id, { proporcaoDivisao: opcao?.proporcao ?? null });
                    }}
                    className="glass-input sm:w-44"
                  >
                    {OPCOES_DIVISAO.map((o) => (
                      <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {acertos.length > 0 && (
        <section className="glass-panel rounded-2xl p-5 space-y-3">
          <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Pagamentos registrados</h2>
          <ul className="space-y-2">
            {acertos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-4 py-2.5">
                <span className="text-sm text-[var(--color-heading)]">
                  {a.descricao} <span className="text-xs text-[var(--color-muted)]">· {isoToBR(a.data)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <strong className="font-serif text-sm text-[var(--color-heading)]">{brl(a.valor)}</strong>
                  <button
                    type="button"
                    onClick={() => removerDespesa(a.id)}
                    aria-label={`Desfazer ${a.descricao}`}
                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)] cursor-pointer"
                  >
                    Desfazer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PagamentoPix({
  valor,
  devedor,
  credor,
  meuId,
}: {
  valor: number;
  devedor: Membro;
  credor: Membro;
  meuId: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const souDevedor = devedor.userId === meuId;

  const pix = useMemo(() => {
    if (!credor.pix) return { payload: null, erro: null };
    try {
      return {
        payload: gerarPixCopiaECola({
          chave: credor.pix.chave,
          nomeRecebedor: credor.pix.nomeRecebedor || credor.nome,
          cidade: credor.pix.cidade || "BRASIL",
          valor,
          txid: `DUOPLANNER${todayInSaoPaulo().replace(/-/g, "")}`,
          descricao: "Acerto da viagem DuoPlanner",
        }),
        erro: null,
      };
    } catch (e) {
      return { payload: null, erro: e instanceof Error ? e.message : "Não foi possível gerar o Pix." };
    }
  }, [credor, valor]);

  async function copiar() {
    if (!pix.payload) return;
    try {
      await navigator.clipboard.writeText(pix.payload);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  function registrarPagamento() {
    criarDespesa({
      tipo: "acerto",
      descricao: `Acerto via Pix: ${devedor.nome} → ${credor.nome}`,
      valor,
      categoria: "Gasto Pessoal (Fora da Viagem)",
      escopo: "viagem_compartilhado",
      proporcaoDivisao: 0,
      pagoPor: devedor.userId,
      origem: "manual",
    });
    setRegistrado(true);
  }

  return (
    <section className="glass-panel rounded-2xl p-6 space-y-4 ring-1 ring-[var(--color-border-strong)]">
      <div className="flex items-start gap-3">
        <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-heading)]" />
        <div>
          <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">
            {souDevedor ? `Pagar ${brl(valor)} para ${credor.nome}` : `Receber ${brl(valor)} de ${devedor.nome}`}
          </h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {souDevedor
              ? "Copie o Pix, cole no app do seu banco e confirme. Depois registre aqui para zerar o saldo dos dois."
              : "Envie o Pix abaixo para seu par ou registre aqui quando receber."}
          </p>
        </div>
      </div>

      {pix.payload ? (
        <div className="space-y-2">
          <label htmlFor="pix-copia-cola" className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Pix Copia e Cola
          </label>
          <textarea
            id="pix-copia-cola"
            readOnly
            value={pix.payload}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="glass-input resize-none font-mono text-[11px] break-all"
          />
          <button
            type="button"
            onClick={copiar}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
          >
            <Coins className="h-4 w-4" />
            {copiado ? "✓ Copiado!" : "Copiar Pix Copia e Cola"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">
          {pix.erro ??
            (credor.userId === meuId
              ? "Cadastre sua chave Pix em Configurações para seu par pagar com um toque."
              : `${credor.nome} ainda não cadastrou a chave Pix (Configurações).`)}{" "}
          {credor.userId === meuId && (
            <Link href="/dashboard/configuracoes" className="underline">Cadastrar chave Pix</Link>
          )}
        </p>
      )}

      <div className="pt-1">
        {registrado ? (
          <p role="status" className="inline-flex items-center gap-2 text-xs text-[var(--color-heading)]">
            <CheckCircle2 className="h-4 w-4" /> Acerto registrado para os dois.
          </p>
        ) : (
          <button
            type="button"
            onClick={registrarPagamento}
            className="px-4 py-2 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            {souDevedor ? "Já paguei: registrar o acerto" : "Recebi: registrar o acerto"}
          </button>
        )}
      </div>
    </section>
  );
}

function EditorRegra({
  acordo,
  nomes,
  meuPapel,
  aoSalvar,
}: {
  acordo: AcordoDivisao;
  nomes: Record<Papel, string>;
  meuPapel: Papel;
  /** Mostra a regra na tela antes da confirmação do servidor (useOptimistic). */
  aoSalvar: (acordo: AcordoDivisao) => void;
}) {
  const [regra, setRegra] = useState(acordo.regra);
  const [percentual, setPercentual] = useState(String(acordo.percentualDono));
  const [fixo, setFixo] = useState(acordo.valorFixo !== null ? String(acordo.valorFixo).replace(".", ",") : "");
  const [quemCobre, setQuemCobre] = useState<Papel>(acordo.quemCobreFixo);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();

  // Mesmas 2 casas do banco (numeric(5,2)): o que aparece é o que será salvo.
  const pct = normalizarPercentual(Number(percentual.replace(",", ".")) || 0);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const valorFixo = fixo ? Number(fixo.replace(/\./g, "").replace(",", ".")) : null;
    if (regra === "fixo" && (valorFixo === null || !Number.isFinite(valorFixo) || valorFixo < 0)) {
      setMensagem("Informe o valor fixo (ex.: 3.000,00).");
      return;
    }
    startSalvar(async () => {
      aoSalvar({
        ...acordo,
        regra,
        percentualDono: regra === "proporcional" ? pct : 50,
        valorFixo: regra === "fixo" ? valorFixo : null,
        quemCobreFixo: quemCobre,
      });
      try {
        const r = await salvarAcordoDivisao({ regra, percentualDono: pct, valorFixo, quemCobreFixo: quemCobre });
        if (!r.success) return setMensagem(r.error);
        atualizarContexto({ acordo: r.data });
        setMensagem("Regra salva para os dois.");
      } catch {
        setMensagem("Sem conexão: a regra não foi salva. Tente de novo quando voltar a internet.");
      }
    });
  }

  return (
    <form onSubmit={salvar} className="glass-panel rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Como vocês dividem</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">A regra vale para os dois e pode ser ajustada a qualquer momento.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Regra de divisão">
        {([
          ["igual", "50/50"],
          ["proporcional", "Proporcional (renda)"],
          ["fixo", "Valor fixo"],
        ] as const).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={regra === valor}
            onClick={() => setRegra(valor)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
              regra === valor ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "glass-panel text-[var(--color-muted)]"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {regra === "proporcional" && (
        <div className="space-y-2">
          <label htmlFor="percentual-dono" className="block text-xs text-[var(--color-muted)]">
            Parte de {nomes.dono}: <strong className="text-[var(--color-heading)]">{pct}%</strong> · {nomes.parceiro}:{" "}
            <strong className="text-[var(--color-heading)]">{normalizarPercentual(100 - pct)}%</strong>
          </label>
          <input
            id="percentual-dono"
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => setPercentual(e.target.value)}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>
      )}

      {regra === "fixo" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select aria-label="Quem cobre o valor fixo" value={quemCobre} onChange={(e) => setQuemCobre(e.target.value as Papel)} className="glass-input">
            <option value="dono">{nomes.dono}{meuPapel === "dono" ? " (você)" : ""} cobre</option>
            <option value="parceiro">{nomes.parceiro}{meuPapel === "parceiro" ? " (você)" : ""} cobre</option>
          </select>
          <input
            aria-label="Valor fixo em reais"
            inputMode="decimal"
            placeholder="Valor em R$ (ex.: 3.000,00)"
            value={fixo}
            onChange={(e) => setFixo(e.target.value)}
            className="glass-input"
          />
          <p className="sm:col-span-2 text-xs text-[var(--color-muted)]">O outro cobre o restante dos gastos da viagem.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={salvando}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar regra"}
        </button>
        {mensagem && <p role="status" className="text-xs text-[var(--color-muted)]">{mensagem}</p>}
      </div>
    </form>
  );
}
