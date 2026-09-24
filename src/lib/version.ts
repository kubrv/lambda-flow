/** Injetado no build a partir do git (commit/push). */
import { BUILD_INFO } from "../generated/build-info";

export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__
    ? __APP_VERSION__
    : BUILD_INFO.version;

export const APP_DISPLAY =
  typeof __APP_DISPLAY__ !== "undefined" && __APP_DISPLAY__
    ? __APP_DISPLAY__
    : BUILD_INFO.display;

export const APP_COMMIT =
  typeof __APP_COMMIT__ !== "undefined" && __APP_COMMIT__
    ? __APP_COMMIT__
    : BUILD_INFO.commit;

export const APP_COMMIT_FULL =
  typeof __APP_COMMIT_FULL__ !== "undefined" && __APP_COMMIT_FULL__
    ? __APP_COMMIT_FULL__
    : BUILD_INFO.commitFull;

export const APP_BUILD_TIME =
  typeof __APP_BUILD_TIME__ !== "undefined" && __APP_BUILD_TIME__
    ? __APP_BUILD_TIME__
    : BUILD_INFO.builtAt;

export const LEGAL_NOTICE =
  "Lambda-Flow é uma ferramenta de apoio à logística. Km, rotas e valores são estimativas e podem divergir da realidade. O uso implica ciência das regras de privacidade e responsabilidade pelo tratamento de dados de endereços e colaboradores. © Lambda-Flow — todos os direitos reservados.";
