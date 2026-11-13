import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoComMigrations, criarPessoa } from "./supabase-stub";

/**
 * Migration 20261112140000_indices_performance: os índices existem, são
 * válidos e o planejador do Postgres os usa nas consultas reais do app.
 *
 * Volume sintético (milhares de linhas, vários espaços) e `analyze`, para o
 * planejador ter estatísticas de verdade; `enable_seqscan = off` só na hora
 * do EXPLAIN, para a escolha do índice não depender do tamanho da tabela.
 */

let db: PGlite;

const NOVOS = [
  "despesas_viagem_ws_escopo_data_idx",
  "despesas_viagem_user_escopo_data_idx",
  "workspace_members_user_recentes_idx",
  "alertas_preco_fila_idx",
  "perfis_resumo_fila_idx",
  "workspaces_owner_idx",
  "documentos_viagem_user_atualizado_idx",
  "documentos_viagem_ws_escopo_atualizado_idx",
];

const pessoas: string[] = [];
const espacos: string[] = [];

beforeAll(async () => {
  db = await bancoComMigrations();
  // 40 pessoas, 20 espaços (casais), 4.000 gastos, 400 alertas, 400 documentos.
  for (let i = 0; i < 40; i++) pessoas.push((await criarPessoa(db, `Idx${i}`)).id);
  for (let c = 0; c < 20; c++) {
    const { rows } = await db.query<{ id: string }>("insert into public.workspaces (nome, owner_id) values ($1, $2) returning id", [
      `Casal ${c}`,
      pessoas[c * 2],
    ]);
    espacos.push(rows[0].id);
    await db.query("insert into public.workspace_members (workspace_id, user_id, papel) values ($1, $2, 'parceiro') on conflict do nothing", [
      rows[0].id,
      pessoas[c * 2 + 1],
    ]);
  }
  await db.exec(`
    insert into public.despesas_viagem (user_id, workspace_id, descricao, valor, data, categoria, escopo, origem, tipo)
    select p.id, w.id, 'Gasto ' || g, 10 + (g % 90),
           date '2026-01-01' + (g % 300),
           'Alimentação & Gastronomia',
           case when g % 2 = 0 then 'viagem_compartilhado' else 'pessoal_privado' end,
           'manual', 'gasto'
      from generate_series(1, 4000) g
      join lateral (select id from public.workspaces order by id offset (g % 20) limit 1) w on true
      join lateral (select user_id as id from public.workspace_members where workspace_id = w.id order by user_id limit 1) p on true;
    insert into public.alertas_preco (user_id, workspace_id, tipo, destino, ida, volta, ativo, ultima_verificacao_em)
    select m.user_id, m.workspace_id, 'voo', 'Lisboa', current_date + (g % 200), current_date + (g % 200) + 7, g % 5 <> 0,
           case when g % 7 = 0 then null else now() - (g % 30) * interval '1 day' end
      from generate_series(1, 400) g
      join lateral (select user_id, workspace_id from public.workspace_members order by user_id offset (g % 40) limit 1) m on true;
    insert into public.documentos_viagem (user_id, workspace_id, tipo, titular, escopo)
    select m.user_id, m.workspace_id, 'Passaporte', 'Titular ' || g,
           case when g % 3 = 0 then 'viagem_compartilhado' else 'pessoal_privado' end
      from generate_series(1, 400) g
      join lateral (select user_id, workspace_id from public.workspace_members order by user_id offset (g % 40) limit 1) m on true;
    analyze;
  `);
}, 180_000);

afterAll(async () => {
  await db?.close();
});

/** Plano (texto) da consulta, com varredura sequencial desligada só nesta transação. */
async function plano(sql: string): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.exec("set local enable_seqscan = off");
    const { rows } = await tx.query<{ "QUERY PLAN": string }>(`explain ${sql}`);
    return rows.map((r) => r["QUERY PLAN"]).join("\n");
  });
}

const lista = (ids: string[]) => ids.map((id) => `'${id}'`).join(", ");

describe("índices de desempenho", () => {
  it("todos existem e estão válidos (prontos para uso)", async () => {
    const { rows } = await db.query<{ nome: string; valido: boolean }>(
      `select c.relname as nome, i.indisvalid as valido
         from pg_index i join pg_class c on c.oid = i.indexrelid
        where c.relname = any($1::text[])`,
      [NOVOS]
    );
    expect(rows.map((r) => r.nome).sort()).toEqual([...NOVOS].sort());
    expect(rows.every((r) => r.valido)).toBe(true);
  });

  it("fila do monitor de alertas: lida em ordem pelo índice parcial, sem ordenar a tabela", async () => {
    const p = await plano(`
      select id from public.alertas_preco
       where ativo and ida >= current_date
       order by ultima_verificacao_em asc nulls first
       limit 60`);
    expect(p).toContain("alertas_preco_fila_idx");
    expect(p).not.toMatch(/\bSort\b/);
  });

  it("fila do resumo semanal: idem, pelo índice parcial de perfis", async () => {
    const p = await plano(`
      select user_id from public.perfis
       where email_resumo_semanal
       order by resumo_semanal_enviado_em asc nulls first
       limit 1000`);
    expect(p).toContain("perfis_resumo_fila_idx");
    expect(p).not.toMatch(/\bSort\b/);
  });

  it("meus espaços do mais recente (getWorkspaceAtual): ordem vinda do índice", async () => {
    const p = await plano(`
      select papel, created_at, workspace_id from public.workspace_members
       where user_id = '${pessoas[5]}'
       order by created_at desc
       limit 20`);
    expect(p).toContain("workspace_members_user_recentes_idx");
    expect(p).not.toMatch(/\bSort\b/);
  });

  it("resumo semanal, compartilhados de vários espaços: espaço E escopo no índice", async () => {
    const p = await plano(`
      select id from public.despesas_viagem
       where workspace_id in (${lista(espacos.slice(0, 5))}) and escopo = 'viagem_compartilhado'`);
    expect(p).toContain("despesas_viagem_ws_escopo_data_idx");
    expect(p).toMatch(/Index Cond: [\s\S]*escopo/);
  });

  it("resumo semanal, privados da pessoa no período: pessoa, escopo e data no índice", async () => {
    const p = await plano(`
      select id from public.despesas_viagem
       where user_id in (${lista(pessoas.slice(0, 6))}) and escopo = 'pessoal_privado'
         and data >= date '2026-03-02' and data <= date '2026-03-08'`);
    expect(p).toContain("despesas_viagem_user_escopo_data_idx");
    expect(p).toMatch(/Index Cond: [\s\S]*data/);
  });

  it("cofre de documentos: os do dono pelo índice novo", async () => {
    // Com ~10 documentos por pessoa o banco prefere ordenar os poucos que
    // achou (custo desprezível); o índice entra na busca de qualquer jeito.
    const p = await plano(`
      select id from public.documentos_viagem
       where user_id = '${pessoas[3]}'
       order by atualizado_em desc
       limit 200`);
    expect(p).toContain("documentos_viagem_user_atualizado_idx");
    expect(p).toMatch(/Index Cond: \(user_id = /);
  });

  it("dono do espaço (RLS de workspaces e mescla ao aceitar convite)", async () => {
    const p = await plano(`select id from public.workspaces where owner_id = '${pessoas[0]}'`);
    expect(p).toContain("workspaces_owner_idx");
  });
});
