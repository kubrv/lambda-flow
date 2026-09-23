/** Injetado no build a partir do git (commit/push). */
export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0+dev";

export const APP_COMMIT =
  typeof __APP_COMMIT__ !== "undefined" ? __APP_COMMIT__ : "dev";

export const APP_COMMIT_FULL =
  typeof __APP_COMMIT_FULL__ !== "undefined" ? __APP_COMMIT_FULL__ : "dev";

export const APP_BUILD_TIME =
  typeof __APP_BUILD_TIME__ !== "undefined"
    ? __APP_BUILD_TIME__
    : new Date().toISOString();

export const LEGAL_NOTICE =
  "Lambda-Flow é uma ferramenta de apoio à logística. Km, rotas e valores são estimativas e podem divergir da realidade. O uso implica ciência das regras de privacidade e responsabilidade pelo tratamento de dados de endereços e colaboradores. © Lambda-Flow — todos os direitos reservados.";
