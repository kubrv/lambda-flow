function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PrintHtmlOptions = {
  /** Nome sugerido ao salvar PDF (vira o <title> — ex.: Rota-dia-22-09-2026). */
  fileName?: string;
  /** Se true, escala o conteúdo para tentar caber em 1 página. */
  fitOnePage?: boolean;
};

function buildDocumentHtml(
  title: string,
  bodyHtml: string,
  styles: string,
  options: PrintHtmlOptions = {},
): string {
  const fileTitle = (options.fileName || title)
    .replace(/\.pdf$/i, "")
    .trim();
  const fit = Boolean(options.fitOnePage);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(fileTitle)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      color: #122028;
      font-size: 11pt;
      line-height: 1.35;
      margin: 0;
      padding: 12px;
      max-width: 820px;
    }
    .toolbar {
      position: sticky; top: 0; z-index: 5;
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      margin: -12px -12px 14px; padding: 12px;
      background: #0b1c24; color: #e8fbff;
      border-bottom: 1px solid rgba(56, 232, 255, 0.25);
    }
    .toolbar .print-btn {
      appearance: none; border: 0; cursor: pointer;
      background: linear-gradient(135deg, #38e8ff, #00c2d8);
      color: #031018; font-weight: 800; font-size: 12pt;
      padding: 12px 16px; border-radius: 10px;
    }
    .toolbar .hint {
      font-size: 9.5pt; color: #9ecad6; margin: 0;
    }
    .sheet { width: 100%; transform-origin: top left; }
    ${styles}
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <script>document.title = ${JSON.stringify(fileTitle)};</script>
  <div class="toolbar no-print">
    <button type="button" class="print-btn" id="printBtn">
      Imprimir / Salvar PDF
    </button>
    <p class="hint">Ao salvar, use o nome sugerido: <strong>${esc(fileTitle)}.pdf</strong></p>
  </div>
  <div class="sheet" id="sheet">
  ${bodyHtml}
  </div>
  <script>
(function () {
  var FILE = ${JSON.stringify(fileTitle)};
  document.title = FILE;
  function ensureTitle() { document.title = FILE; }
  window.addEventListener("beforeprint", ensureTitle);
  document.getElementById("printBtn")?.addEventListener("click", function () {
    ensureTitle();
    window.print();
  });
  ${
    fit
      ? `
  function fit() {
    var sheet = document.getElementById("sheet");
    if (!sheet) return;
    sheet.style.transform = "none";
    sheet.style.width = "100%";
    var maxH = 700;
    var h = sheet.scrollHeight;
    var scale = Math.min(1, maxH / Math.max(h, 1));
    if (scale < 0.98) {
      sheet.style.transform = "scale(" + scale.toFixed(4) + ")";
      sheet.style.width = (100 / scale).toFixed(2) + "%";
    }
  }
  window.addEventListener("beforeprint", fit);
  setTimeout(fit, 80);
  `
      : ""
  }
})();
  </script>
</body>
</html>`;
}

/**
 * Abre documento imprimível em janela (botões clicáveis).
 * Fallback: iframe oculto se o pop-up for bloqueado.
 */
export function printHtmlDocument(
  title: string,
  bodyHtml: string,
  styles: string,
  options: PrintHtmlOptions = {},
): void {
  const fileTitle = (options.fileName || title).replace(/\.pdf$/i, "").trim();
  const html = buildDocumentHtml(title, bodyHtml, styles, {
    ...options,
    fileName: fileTitle,
  });

  const win = window.open("", "_blank");
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    try {
      win.document.title = fileTitle;
    } catch {
      // ignore
    }
    // Reforça o título após o parse (Chrome usa isso no "Salvar como PDF")
    window.setTimeout(() => {
      try {
        win.document.title = fileTitle;
      } catch {
        // ignore
      }
    }, 50);
    win.focus();
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", fileTitle);
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error("Não foi possível abrir a impressão do PDF.");
  }

  doc.open();
  doc.write(html);
  doc.close();
  try {
    doc.title = fileTitle;
  } catch {
    // ignore
  }

  const runPrint = () => {
    try {
      if (iframe.contentDocument) {
        iframe.contentDocument.title = fileTitle;
      }
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }
  };

  window.setTimeout(runPrint, 400);
}

export { esc };
