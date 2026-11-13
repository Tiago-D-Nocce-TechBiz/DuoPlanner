import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigrations, bancoComMigrations, comoPessoa, criarPessoa, migrationsEmOrdem, type Pessoa } from "./supabase-stub";

/**
 * As migrations de `supabase/migrations` num Postgres de verdade (PGlite):
 * aplicação em ordem e idempotência, RLS do casal, convites, cotas,
 * privilégios e o `transaction_fingerprint` da importação de fatura.
 */

let db: PGlite;

beforeAll(async () => {
  db = await bancoComMigrations();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

/* -------------------------------- auxiliares -------------------------------- */

const FP = (c: string) => `v1:${c.repeat(64)}`;

const GASTO = {
  descricao: "Uber",
  valor: 23.45,
  moeda: "BRL",
  categoria: "Passagens & Transporte",
  escopo: "pessoal_privado",
  origem: "manual",
  tipo: "gasto",
};

async function inserirGasto(tx: Transaction, campos: Record<string, unknown> = {}): Promise<string> {
  const linha = { ...GASTO, ...campos };
  const colunas = Object.keys(linha);
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.despesas_viagem (${colunas.join(", ")}) values (${colunas.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(linha)
  );
  return rows[0].id;
}

async function criarEspaco(dono: Pessoa, nome = "Nossa viagem"): Promise<string> {
  return comoPessoa(db, dono, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "insert into public.workspaces (nome, owner_id) values ($1, $2) returning id",
      [nome, dono.id]
    );
    return rows[0].id;
  });
}

async function convidar(dono: Pessoa, ws: string, email: string | null = null): Promise<string> {
  return comoPessoa(db, dono, async (tx) => {
    const { rows } = await tx.query<{ codigo: string }>(
      "insert into public.convites (workspace_id, convidado_por, email_convidado) values ($1, $2, $3) returning codigo",
      [ws, dono.id, email]
    );
    return rows[0].codigo;
  });
}

async function aceitar(pessoa: Pessoa, codigo: string): Promise<{ ok: boolean; mensagem: string }> {
  return comoPessoa(db, pessoa, async (tx) => (await tx.query<{ ok: boolean; mensagem: string }>("select * from public.aceitar_convite($1)", [codigo])).rows[0]);
}

/** Casal pronto: dono com espaço, parceiro aceito. */
async function casal(prefixo: string) {
  const dono = await criarPessoa(db, `${prefixo}Dono`);
  const parceiro = await criarPessoa(db, `${prefixo}Par`);
  const ws = await criarEspaco(dono);
  const r = await aceitar(parceiro, await convidar(dono, ws));
  expect(r.ok).toBe(true);
  return { dono, parceiro, ws };
}

const visiveis = (pessoa: Pessoa) =>
  comoPessoa(db, pessoa, async (tx) => (await tx.query<{ descricao: string }>("select descricao from public.despesas_viagem order by descricao")).rows.map((r) => r.descricao));

/* ---------------------------------- testes ---------------------------------- */

describe("aplicação das migrations", () => {
  it("roda todas em ordem de versão (a de 20261104 sem horário vem antes das de 20261104120000)", () => {
    const ordem = migrationsEmOrdem();
    expect(ordem[0]).toBe("20261030000000_esquema_base.sql");
    expect(ordem.indexOf("20261104_duofinance_fatura.sql")).toBeLessThan(ordem.indexOf("20261104120000_endurecimento_seguranca.sql"));
    expect(ordem.slice(-2)).toEqual(["20261105120000_fingerprint_fatura.sql", "20261112140000_indices_performance.sql"]);
  });

  it("é idempotente: aplicar de novo não falha nem duplica políticas, índices ou gatilhos", async () => {
    const contar = async () =>
      (
        await db.query<{ politicas: number; indices: number; gatilhos: number }>(`
          select (select count(*)::int from pg_policies where schemaname = 'public') as politicas,
                 (select count(*)::int from pg_indexes where schemaname = 'public') as indices,
                 (select count(*)::int from pg_trigger where not tgisinternal) as gatilhos`)
      ).rows[0];
    const antes = await contar();
    await aplicarMigrations(db);
    expect(await contar()).toEqual(antes);
  });

  it("perfil criado junto com a conta, com o nome do cadastro", async () => {
    const ana = await criarPessoa(db, "AnaPerfil");
    const { rows } = await db.query<{ nome: string }>("select nome from public.perfis where user_id = $1", [ana.id]);
    expect(rows).toEqual([{ nome: "AnaPerfil" }]);
  });

  it("Realtime publica as tabelas do casal (documentos de fora)", async () => {
    const { rows } = await db.query<{ tablename: string }>(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1"
    );
    const tabelas = rows.map((r) => r.tablename);
    expect(tabelas).toEqual(expect.arrayContaining(["despesas_viagem", "roteiro_dias", "roteiro_itens", "checklist_itens", "alertas_preco", "acordos_divisao"]));
    expect(tabelas).not.toContain("documentos_viagem");
  });
});

describe("privilégios", () => {
  it("anon não lê nem grava nenhuma tabela do app", async () => {
    for (const tabela of ["despesas_viagem", "perfis", "workspaces", "convites", "documentos_viagem", "checklist_itens"]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec("set local role anon");
          await tx.query(`select 1 from public.${tabela} limit 1`);
        })
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("authenticated não pode TRUNCATE (que ignora a RLS)", async () => {
    const ana = await criarPessoa(db, "AnaTruncate");
    await expect(comoPessoa(db, ana, (tx) => tx.exec("truncate public.despesas_viagem"))).rejects.toMatchObject({ code: "42501" });
  });
});

describe("RLS do casal em despesas_viagem", () => {
  it("o par vê só os gastos COMPARTILHADOS do espaço; quem é de fora não vê nada", async () => {
    const { dono, parceiro, ws } = await casal("Rls");
    const intruso = await criarPessoa(db, "RlsIntruso");
    await comoPessoa(db, dono, async (tx) => {
      await inserirGasto(tx, { descricao: "Jantar (viagem)", escopo: "viagem_compartilhado", workspace_id: ws });
      await inserirGasto(tx, { descricao: "Farmácia (privado)", escopo: "pessoal_privado", workspace_id: ws });
    });
    expect(await visiveis(dono)).toEqual(["Farmácia (privado)", "Jantar (viagem)"]);
    expect(await visiveis(parceiro)).toEqual(["Jantar (viagem)"]);
    expect(await visiveis(intruso)).toEqual([]);
  });

  it("ninguém grava gasto em nome de outra pessoa nem num espaço alheio", async () => {
    const { dono, ws } = await casal("Dono");
    const intruso = await criarPessoa(db, "DonoIntruso");
    await expect(comoPessoa(db, intruso, (tx) => inserirGasto(tx, { user_id: dono.id }))).rejects.toMatchObject({ code: "42501" });
    await expect(
      comoPessoa(db, intruso, (tx) => inserirGasto(tx, { escopo: "viagem_compartilhado", workspace_id: ws }))
    ).rejects.toMatchObject({ code: "42501" });
    // pago_por precisa ser alguém do espaço.
    await expect(comoPessoa(db, dono, (tx) => inserirGasto(tx, { workspace_id: ws, pago_por: intruso.id }))).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("o par corrige o valor de um gasto compartilhado, mas não o torna privado nem troca o dono", async () => {
    const { dono, parceiro, ws } = await casal("Edita");
    const id = await comoPessoa(db, dono, (tx) => inserirGasto(tx, { escopo: "viagem_compartilhado", workspace_id: ws }));
    await comoPessoa(db, parceiro, (tx) =>
      tx.query("update public.despesas_viagem set valor = 30, escopo = 'pessoal_privado', user_id = $2 where id = $1", [id, parceiro.id])
    );
    const { rows } = await db.query<{ valor: string; escopo: string; user_id: string; atualizado_por: string }>(
      "select valor, escopo, user_id, atualizado_por from public.despesas_viagem where id = $1",
      [id]
    );
    expect(rows[0]).toEqual({ valor: "30.00", escopo: "viagem_compartilhado", user_id: dono.id, atualizado_por: parceiro.id });
  });

  it("CHECKs: parcela consistente, categoria da fatura conhecida e acerto só compartilhado", async () => {
    const { dono, ws } = await casal("Check");
    const tentar = (campos: Record<string, unknown>) => comoPessoa(db, dono, (tx) => inserirGasto(tx, campos));
    await expect(tentar({ parcela_atual: 3 })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ parcela_atual: 5, total_parcelas: 4 })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ categoria_detalhada: "Cassino" })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ tipo: "acerto", proporcao_divisao: 0 })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ valor: 0 })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ parcela_atual: 2, total_parcelas: 10, categoria_detalhada: "Compras", workspace_id: ws })).resolves.toBeTypeOf("string");
  });
});

describe("transaction_fingerprint (importação de fatura sem duplicar)", () => {
  const importado = (fp: string | null, extra: Record<string, unknown> = {}) => ({ origem: "importacao", transaction_fingerprint: fp, ...extra });

  it("a mesma pessoa não grava a mesma compra duas vezes (23505), nem de outro aparelho", async () => {
    const ana = await criarPessoa(db, "FpAna");
    await comoPessoa(db, ana, (tx) => inserirGasto(tx, importado(FP("a"))));
    await expect(comoPessoa(db, ana, (tx) => inserirGasto(tx, importado(FP("a"))))).rejects.toMatchObject({ code: "23505" });
  });

  it("o par pode ter a mesma compra no cartão dele (unicidade por pessoa, não por espaço)", async () => {
    const { dono, parceiro, ws } = await casal("FpCasal");
    const compartilhado = { escopo: "viagem_compartilhado", workspace_id: ws };
    await comoPessoa(db, dono, (tx) => inserirGasto(tx, importado(FP("b"), compartilhado)));
    await expect(comoPessoa(db, parceiro, (tx) => inserirGasto(tx, importado(FP("b"), compartilhado)))).resolves.toBeTypeOf("string");
  });

  it("formato v1 + SHA-256 em hexadecimal, só em gasto importado", async () => {
    const ana = await criarPessoa(db, "FpFormato");
    const tentar = (campos: Record<string, unknown>) => comoPessoa(db, ana, (tx) => inserirGasto(tx, campos));
    await expect(tentar(importado("v1:curto"))).rejects.toMatchObject({ code: "23514" });
    await expect(tentar(importado(`v2:${"c".repeat(64)}`))).rejects.toMatchObject({ code: "23514" });
    await expect(tentar(importado(FP("C")))).rejects.toMatchObject({ code: "23514" }); // maiúsculas
    await expect(tentar({ origem: "manual", transaction_fingerprint: FP("d") })).rejects.toMatchObject({ code: "23514" });
  });

  it("gastos sem fingerprint (manuais, antigos) não colidem entre si", async () => {
    const ana = await criarPessoa(db, "FpNulos");
    await comoPessoa(db, ana, async (tx) => {
      await inserirGasto(tx, importado(null));
      await inserirGasto(tx, importado(null));
      await inserirGasto(tx);
    });
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.despesas_viagem where user_id = $1", [ana.id]);
    expect(rows[0].n).toBe(3);
  });

  it("é imutável: corrigir valor ou data não muda a impressão digital (reimportar reconhece)", async () => {
    const ana = await criarPessoa(db, "FpImutavel");
    const id = await comoPessoa(db, ana, (tx) => inserirGasto(tx, importado(FP("e"))));
    await comoPessoa(db, ana, async (tx) => {
      await tx.query("update public.despesas_viagem set valor = 99, transaction_fingerprint = $2 where id = $1", [id, FP("f")]);
      await tx.query("update public.despesas_viagem set transaction_fingerprint = null where id = $1", [id]);
    });
    const { rows } = await db.query<{ fp: string; valor: string }>(
      "select transaction_fingerprint as fp, valor from public.despesas_viagem where id = $1",
      [id]
    );
    expect(rows[0]).toEqual({ fp: FP("e"), valor: "99.00" });
  });

  it("apagar libera a impressão digital (a compra pode ser importada de novo)", async () => {
    const ana = await criarPessoa(db, "FpApaga");
    const id = await comoPessoa(db, ana, (tx) => inserirGasto(tx, importado(FP("1"))));
    await comoPessoa(db, ana, (tx) => tx.query("delete from public.despesas_viagem where id = $1", [id]));
    await expect(comoPessoa(db, ana, (tx) => inserirGasto(tx, importado(FP("1"))))).resolves.toBeTypeOf("string");
  });
});

describe("convites", () => {
  it("aceitar vincula ao espaço e leva o que a pessoa planejou sozinha", async () => {
    const dono = await criarPessoa(db, "ConvDono");
    const par = await criarPessoa(db, "ConvPar");
    const ws = await criarEspaco(dono);
    const solo = await criarEspaco(par, "Só meu");
    await comoPessoa(db, par, (tx) => inserirGasto(tx, { descricao: "Hotel (antes do convite)", escopo: "viagem_compartilhado", workspace_id: solo }));

    expect(await aceitar(par, await convidar(dono, ws))).toEqual({ ok: true, mensagem: "Conta vinculada ao espaço compartilhado!" });
    expect(await visiveis(dono)).toContain("Hotel (antes do convite)");
    const { rows } = await db.query<{ papel: string }>("select papel from public.workspace_members where workspace_id = $1 order by papel", [ws]);
    expect(rows.map((r) => r.papel)).toEqual(["dono", "parceiro"]);
  });

  it("no máximo duas pessoas; convite usado, expirado ou de outro e-mail é recusado", async () => {
    const { dono, ws } = await casal("Limite");
    const terceira = await criarPessoa(db, "LimiteTerceira");
    expect(await aceitar(terceira, await convidar(dono, ws))).toEqual({ ok: false, mensagem: "Este espaço já tem duas pessoas." });

    const outroDono = await criarPessoa(db, "ExpDono");
    const ws2 = await criarEspaco(outroDono);
    const codigo = await convidar(outroDono, ws2);
    await db.query("update public.convites set expira_em = now() - interval '1 minute' where codigo = $1", [codigo]);
    expect((await aceitar(terceira, codigo)).mensagem).toBe("Este convite expirou. Peça um novo link.");

    const soDaBia = await convidar(outroDono, ws2, "bia@teste.dev");
    expect((await aceitar(terceira, soDaBia)).mensagem).toMatch(/outro e-mail/);
  });

  it("quem é de fora não lista os códigos de convite", async () => {
    const { dono, ws } = await casal("Lista");
    await convidar(dono, ws);
    const intruso = await criarPessoa(db, "ListaIntruso");
    const vistos = await comoPessoa(db, intruso, async (tx) => (await tx.query("select codigo from public.convites")).rows);
    expect(vistos).toEqual([]);
  });
});

describe("cotas de uso e roteiro", () => {
  it("consumir_cota conta por pessoa e recusa acima do limite; sem sessão, nunca permite", async () => {
    const ana = await criarPessoa(db, "CotaAna");
    const usar = () =>
      comoPessoa(db, ana, async (tx) => (await tx.query<{ permitido: boolean }>("select * from public.consumir_cota('ia', 2, 3600)")).rows[0].permitido);
    expect([await usar(), await usar(), await usar()]).toEqual([true, true, false]);
    const semSessao = await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      return (await tx.query<{ permitido: boolean }>("select * from public.consumir_cota('ia', 5, 3600)")).rows[0].permitido;
    });
    expect(semSessao).toBe(false);
    await expect(comoPessoa(db, ana, (tx) => tx.query("select * from public.consumir_cota('bitcoin', 5, 3600)"))).rejects.toMatchObject({
      code: "22023",
    });
  });

  it("atividade do roteiro só aponta para um dia do mesmo espaço", async () => {
    const a = await casal("RotA");
    const b = await casal("RotB");
    const diaDeB = await comoPessoa(db, b.dono, async (tx) =>
      (await tx.query<{ id: string }>("insert into public.roteiro_dias (workspace_id, ordem) values ($1, 0) returning id", [b.ws])).rows[0].id
    );
    await expect(
      comoPessoa(db, a.dono, (tx) =>
        tx.query("insert into public.roteiro_itens (workspace_id, dia_id, titulo, ordem) values ($1, $2, 'Passeio', 0)", [a.ws, diaDeB])
      )
    ).rejects.toMatchObject({ code: "23503" });
  });
});
