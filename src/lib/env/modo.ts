/**
 * Build de produção? `NODE_ENV` é substituído pelo valor literal no build,
 * então isto é seguro no navegador.
 *
 * Módulo separado e mínimo de propósito: componentes que vão em todas as
 * rotas (registro do Service Worker, error boundaries) só precisam disto, e
 * importar `./publico` traria junto os validadores das chaves.
 */
export const emProducao = process.env.NODE_ENV === "production";
