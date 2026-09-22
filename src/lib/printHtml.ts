function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDocumentHtml(
  title: string,
  bodyHtml: string,
  styles: string,
): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
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
    ${styles}
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" class="print-btn" onclick="window.print()">
      Imprimir / Salvar PDF
    </button>
    <p class="hint">Os botões Maps e Waze são clicáveis aqui e também no PDF salvo.</p>
  </div>
  ${bodyHtml}
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
): void {
  const html = buildDocumentHtml(title, bodyHtml, styles);

  const win = window.open("", "_blank", "noopener,noreferrer");
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    return;
  }

  // Fallback sem pop-up: iframe + diálogo de impressão
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", title);
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

  const runPrint = () => {
    try {
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
