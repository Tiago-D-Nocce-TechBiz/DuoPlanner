import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * Postgres real (PGlite, WASM) com o mínimo do Supabase que as migrations
 * usam: papéis anon/authenticated/service_role, `auth.users`, `auth.uid()` e
 * `auth.jwt()` lidos da sessão (como o PostgREST faz), privilégios padrão do
 * schema public e a publicação do Realtime. Nada de binário local nem rede.
 */

const BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create publication supabase_realtime;
`;

export const PASTA_MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/**
 * Ordem de aplicação: pela versão (dígitos do início do nome), como o
 * Supabase CLI. "20261104_x" vale 20261104000000 e vem antes de
 * "20261104120000_y" (em ordem alfabética pura viria depois).
 */
export function migrationsEmOrdem(): string[] {
  const versao = (nome: string) => (nome.match(/^\d+/)?.[0] ?? "").padEnd(14, "0");
  return readdirSync(PASTA_MIGRATIONS)
    .filter((n) => n.endsWith(".sql"))
    .sort((a, b) => versao(a).localeCompare(versao(b)) || a.localeCompare(b));
}

export async function aplicarMigrations(db: PGlite): Promise<string[]> {
  const aplicadas: string[] = [];
  for (const nome of migrationsEmOrdem()) {
    try {
      await db.exec(readFileSync(join(PASTA_MIGRATIONS, nome), "utf8"));
    } catch (erro) {
      throw new Error(`Migration ${nome} falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
    aplicadas.push(nome);
  }
  return aplicadas;
}

export async function bancoComMigrations(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;
  await db.exec(BOOTSTRAP);
  await aplicarMigrations(db);
  return db;
}

export interface Pessoa {
  id: string;
  email: string;
}

export async function criarPessoa(db: PGlite, nome: string): Promise<Pessoa> {
  const email = `${nome.toLowerCase()}@teste.dev`;
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('nome', $2::text)) returning id",
    [email, nome]
  );
  return { id: rows[0].id, email };
}

/** Executa como a pessoa logada (papel authenticated + claims do JWT), numa transação. */
export function comoPessoa<T>(db: PGlite, pessoa: Pessoa, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [
      pessoa.id,
      JSON.stringify({ sub: pessoa.id, email: pessoa.email, role: "authenticated" }),
    ]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}
