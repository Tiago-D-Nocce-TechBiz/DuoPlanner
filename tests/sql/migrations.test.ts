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
    expect(ordem.slice(-4)).toEqual([
      "20261105120000_fingerprint_fatura.sql",
      "20261112140000_indices_performance.sql",
      "20261119120000_roteiro_planilha.sql",
      "20261120120000_historico_precos_alertas.sql",
    ]);
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

/* ------------------------- roteiro: planilha e fingerprint ------------------------- */

const FPR = (c: string) => `r1:${c.repeat(64)}`;

async function novoDia(tx: Transaction, ws: string, campos: Record<string, unknown> = {}): Promise<string> {
  const linha = { workspace_id: ws, ordem: 0, ...campos };
  const colunas = Object.keys(linha);
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.roteiro_dias (${colunas.join(", ")}) values (${colunas.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(linha)
  );
  return rows[0].id;
}

async function novoItem(tx: Transaction, ws: string, dia: string, campos: Record<string, unknown> = {}): Promise<string> {
  const linha = { workspace_id: ws, dia_id: dia, titulo: "Passeio", ordem: 0, ...campos };
  const colunas = Object.keys(linha);
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.roteiro_itens (${colunas.join(", ")}) values (${colunas.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(linha)
  );
  return rows[0].id;
}

describe("roteiro com planilha (colunas novas, CHECKs e impressão digital)", () => {
  it("atividade antiga continua valendo: origem 'manual' por padrão e os campos novos nulos", async () => {
    const { dono, ws } = await casal("RotPadrao");
    const linha = await comoPessoa(db, dono, async (tx) => {
      const dia = await novoDia(tx, ws);
      const id = await novoItem(tx, ws, dia);
      return (await tx.query<Record<string, unknown>>("select turno, categoria, custo_estimado, origem, fingerprint from public.roteiro_itens where id = $1", [id])).rows[0];
    });
    expect(linha).toEqual({ turno: null, categoria: null, custo_estimado: null, origem: "manual", fingerprint: null });
  });

  it("grava dia com destino e atividade importada completa; o par enxerga os dois", async () => {
    const { dono, parceiro, ws } = await casal("RotCompleto");
    await comoPessoa(db, dono, async (tx) => {
      const dia = await novoDia(tx, ws, { destino: "Lisboa", data: "2026-09-10" });
      await novoItem(tx, ws, dia, { titulo: "Bondinho 28", turno: "manha", categoria: "Passeio", custo_estimado: 25.5, origem: "planilha", fingerprint: FPR("a") });
    });
    const vistas = await comoPessoa(db, parceiro, async (tx) =>
      (await tx.query<{ destino: string; categoria: string; custo_estimado: string; origem: string }>(
        "select d.destino, i.categoria, i.custo_estimado, i.origem from public.roteiro_itens i join public.roteiro_dias d on d.id = i.dia_id"
      )).rows
    );
    expect(vistas).toEqual([{ destino: "Lisboa", categoria: "Passeio", custo_estimado: "25.50", origem: "planilha" }]);
  });

  it("CHECKs: turno, custo, origem, formato da impressão digital e tamanho do destino", async () => {
    const { dono, ws } = await casal("RotChecks");
    const tentar = (campos: Record<string, unknown>) =>
      comoPessoa(db, dono, async (tx) => novoItem(tx, ws, await novoDia(tx, ws), campos));
    await expect(tentar({ turno: "madrugada" })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ custo_estimado: -1 })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ custo_estimado: 1_000_001 })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ origem: "robo" })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ categoria: "x".repeat(41) })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ origem: "planilha", fingerprint: "r1:abc" })).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ origem: "planilha", fingerprint: `v1:${"a".repeat(64)}` })).rejects.toMatchObject({ code: "23514" });
    // Atividade digitada à mão não tem impressão digital.
    await expect(tentar({ origem: "manual", fingerprint: FPR("a") })).rejects.toMatchObject({ code: "23514" });
    await expect(comoPessoa(db, dono, (tx) => novoDia(tx, ws, { destino: "x".repeat(81) }))).rejects.toMatchObject({ code: "23514" });
    await expect(tentar({ turno: "noite", categoria: "Praia", custo_estimado: 0, origem: "nora_sugestao", fingerprint: FPR("b") })).resolves.toBeTruthy();
  });

  it("a mesma impressão digital não entra duas vezes no espaço (23505), mas o outro casal pode ter a sua", async () => {
    const a = await casal("RotUnicoA");
    const b = await casal("RotUnicoB");
    const importar = (c: { dono: Pessoa; ws: string }, fp: string) =>
      comoPessoa(db, c.dono, async (tx) => novoItem(tx, c.ws, await novoDia(tx, c.ws), { origem: "planilha", fingerprint: fp }));
    await importar(a, FPR("c"));
    await expect(importar(a, FPR("c"))).rejects.toMatchObject({ code: "23505" });
    await expect(importar(b, FPR("c"))).resolves.toBeTruthy();
  });

  it("atividades sem impressão digital não colidem entre si; apagar libera a impressão digital", async () => {
    const { dono, ws } = await casal("RotLivre");
    const id = await comoPessoa(db, dono, async (tx) => {
      const dia = await novoDia(tx, ws);
      await novoItem(tx, ws, dia);
      await novoItem(tx, ws, dia);
      return novoItem(tx, ws, dia, { origem: "planilha", fingerprint: FPR("d") });
    });
    await comoPessoa(db, dono, (tx) => tx.query("delete from public.roteiro_itens where id = $1", [id]));
    await expect(comoPessoa(db, dono, async (tx) => novoItem(tx, ws, await novoDia(tx, ws), { origem: "planilha", fingerprint: FPR("d") }))).resolves.toBeTruthy();
  });

  it("origem e impressão digital são imutáveis; custo, categoria e turno continuam editáveis", async () => {
    const { dono, ws } = await casal("RotImutavel");
    const linha = await comoPessoa(db, dono, async (tx) => {
      const id = await novoItem(tx, ws, await novoDia(tx, ws), { origem: "planilha", fingerprint: FPR("e"), custo_estimado: 10 });
      await tx.query("update public.roteiro_itens set fingerprint = $2, origem = 'manual', custo_estimado = 99, categoria = 'Praia', turno = 'tarde' where id = $1", [id, FPR("f")]);
      return (await tx.query<Record<string, unknown>>("select fingerprint, origem, custo_estimado, categoria, turno from public.roteiro_itens where id = $1", [id])).rows[0];
    });
    expect(linha).toEqual({ fingerprint: FPR("e"), origem: "planilha", custo_estimado: "99.00", categoria: "Praia", turno: "tarde" });
  });

  it("aceitar um convite não quebra quando os dois já tinham importado a mesma planilha: a cópia repetida é descartada", async () => {
    const dono = await criarPessoa(db, "RotMescDono");
    const par = await criarPessoa(db, "RotMescPar");
    const ws = await criarEspaco(dono);
    const solo = await criarEspaco(par, "Só meu");
    await comoPessoa(db, dono, async (tx) => novoItem(tx, ws, await novoDia(tx, ws), { titulo: "Bondinho 28", origem: "planilha", fingerprint: FPR("1") }));
    await comoPessoa(db, par, async (tx) => {
      const dia = await novoDia(tx, solo);
      await novoItem(tx, solo, dia, { titulo: "Bondinho 28", origem: "planilha", fingerprint: FPR("1") }); // repetida
      await novoItem(tx, solo, dia, { titulo: "Alfama", origem: "planilha", fingerprint: FPR("2") });
      await novoItem(tx, solo, dia, { titulo: "Anotação minha" });
    });

    expect(await aceitar(par, await convidar(dono, ws))).toEqual({ ok: true, mensagem: "Conta vinculada ao espaço compartilhado!" });

    const { rows } = await db.query<{ titulo: string; fingerprint: string | null }>(
      "select titulo, fingerprint from public.roteiro_itens where workspace_id = $1 order by titulo",
      [ws]
    );
    expect(rows.map((r) => r.titulo)).toEqual(["Alfama", "Anotação minha", "Bondinho 28"]);
    expect(rows.filter((r) => r.fingerprint === FPR("1"))).toHaveLength(1);
    const sobrou = await db.query("select 1 from public.roteiro_itens where workspace_id = $1", [solo]);
    expect(sobrou.rows).toHaveLength(0);
  });
});

/* ------------------------- alertas: histórico de preços ------------------------- */

async function novoAlerta(pessoa: Pessoa, ws: string): Promise<string> {
  return comoPessoa(db, pessoa, async (tx) =>
    (await tx.query<{ id: string }>(
      "insert into public.alertas_preco (user_id, workspace_id, tipo, destino, ida) values ($1, $2, 'voo', 'Lisboa', '2030-09-10') returning id",
      [pessoa.id, ws]
    )).rows[0].id
  );
}

/** O monitor usa a chave de serviço (ignora a RLS): aqui, o superusuário do banco de teste. */
const registrarPreco = (alerta: string, ws: string, preco: number, dia = "2030-09-01") =>
  db.query("insert into public.alertas_preco_historico (alerta_id, workspace_id, dia, preco) values ($1, $2, $3, $4)", [alerta, ws, dia, preco]);

describe("histórico de preços dos alertas", () => {
  it("o par enxerga a série do alerta do casal; quem é de fora não vê nada", async () => {
    const { dono, parceiro, ws } = await casal("HistCasal");
    const fora = await criarPessoa(db, "HistFora");
    const alerta = await novoAlerta(dono, ws);
    await registrarPreco(alerta, ws, 1900, "2030-09-01");
    await registrarPreco(alerta, ws, 1800.5, "2030-09-02");
    const ler = (p: Pessoa) =>
      comoPessoa(db, p, async (tx) => (await tx.query<{ preco: string }>("select preco from public.alertas_preco_historico where alerta_id = $1 order by dia", [alerta])).rows.map((r) => r.preco));
    expect(await ler(parceiro)).toEqual(["1900.00", "1800.50"]);
    expect(await ler(dono)).toHaveLength(2);
    expect(await ler(fora)).toEqual([]);
  });

  it("nenhum navegador grava: authenticated não insere, atualiza nem apaga; anon não lê", async () => {
    const { dono, ws } = await casal("HistEscrita");
    const alerta = await novoAlerta(dono, ws);
    await registrarPreco(alerta, ws, 1000);
    const tentar = (sql: string, params: unknown[] = []) => comoPessoa(db, dono, (tx) => tx.query(sql, params));
    await expect(tentar("insert into public.alertas_preco_historico (alerta_id, workspace_id, preco) values ($1, $2, 1)", [alerta, ws])).rejects.toMatchObject({ code: "42501" });
    await expect(tentar("update public.alertas_preco_historico set preco = 1")).rejects.toMatchObject({ code: "42501" });
    await expect(tentar("delete from public.alertas_preco_historico")).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select 1 from public.alertas_preco_historico limit 1");
      })
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("um preço por alerta e dia: o monitor atualiza o do dia (upsert) em vez de criar outro", async () => {
    const { dono, ws } = await casal("HistUpsert");
    const alerta = await novoAlerta(dono, ws);
    await registrarPreco(alerta, ws, 1000, "2030-09-05");
    await expect(registrarPreco(alerta, ws, 900, "2030-09-05")).rejects.toMatchObject({ code: "23505" });
    await db.query(
      `insert into public.alertas_preco_historico (alerta_id, workspace_id, dia, preco) values ($1, $2, '2030-09-05', 900)
       on conflict (alerta_id, dia) do update set preco = excluded.preco`,
      [alerta, ws]
    );
    const { rows } = await db.query<{ preco: string }>("select preco from public.alertas_preco_historico where alerta_id = $1", [alerta]);
    expect(rows).toEqual([{ preco: "900.00" }]);
  });

  it("CHECK do preço (positivo, até 10 milhões) e dia padrão no fuso de São Paulo", async () => {
    const { dono, ws } = await casal("HistCheck");
    const alerta = await novoAlerta(dono, ws);
    await expect(registrarPreco(alerta, ws, 0)).rejects.toMatchObject({ code: "23514" });
    await expect(registrarPreco(alerta, ws, -5, "2030-09-02")).rejects.toMatchObject({ code: "23514" });
    await expect(registrarPreco(alerta, ws, 10_000_001, "2030-09-03")).rejects.toMatchObject({ code: "23514" });
    await db.query("insert into public.alertas_preco_historico (alerta_id, workspace_id, preco) values ($1, $2, 10000000)", [alerta, ws]);
    const { rows } = await db.query<{ ok: boolean }>(
      "select dia = (now() at time zone 'America/Sao_Paulo')::date as ok from public.alertas_preco_historico where alerta_id = $1",
      [alerta]
    );
    expect(rows[0].ok).toBe(true);
  });

  it("apagar o alerta apaga o histórico", async () => {
    const { dono, ws } = await casal("HistCascata");
    const alerta = await novoAlerta(dono, ws);
    await registrarPreco(alerta, ws, 1000);
    await comoPessoa(db, dono, (tx) => tx.query("delete from public.alertas_preco where id = $1", [alerta]));
    const { rows } = await db.query("select 1 from public.alertas_preco_historico where alerta_id = $1", [alerta]);
    expect(rows).toHaveLength(0);
  });
});
