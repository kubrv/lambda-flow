import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const DATA_DIR = path.join(ROOT, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const PORT = Number(process.env.PORT || 8787);

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

function emptyRoute(day) {
  return {
    day,
    startAddress: "",
    startLat: null,
    startLng: null,
    motoboyId: null,
    stops: [],
    totalKm: 0,
    optimizedAt: null,
  };
}

function defaultData() {
  return {
    motoboys: [
      { id: crypto.randomUUID(), name: "Motoboy 1" },
      { id: crypto.randomUUID(), name: "Motoboy 2" },
    ],
    routes: Object.fromEntries(WEEKDAYS.map((d) => [d, emptyRoute(d)])),
    coordCache: {},
  };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(defaultData(), null, 2), "utf8");
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const data = JSON.parse(raw);
    for (const d of WEEKDAYS) {
      if (!data.routes?.[d]) data.routes = { ...data.routes, [d]: emptyRoute(d) };
    }
    if (!Array.isArray(data.motoboys)) data.motoboys = [];
    if (!data.coordCache || typeof data.coordCache !== "object") data.coordCache = {};
    return data;
  } catch {
    const fresh = defaultData();
    fs.writeFileSync(STORE_PATH, JSON.stringify(fresh, null, 2), "utf8");
    return fresh;
  }
}

function writeStore(data) {
  ensureStore();
  const tmp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, STORE_PATH);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  };
  return map[ext] || "application/octet-stream";
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeJoin(base, requestPath) {
  const cleaned = decodeURIComponent(requestPath.split("?")[0]);
  const relative = cleaned === "/" ? "/index.html" : cleaned;
  const resolved = path.normalize(path.join(base, relative));
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, mode: "local", store: STORE_PATH });
  }

  if (url.pathname === "/api/data") {
    if (req.method === "GET") {
      return sendJson(res, 200, readStore());
    }
    if (req.method === "PUT" || req.method === "POST") {
      try {
        const raw = await readBody(req);
        const data = JSON.parse(raw);
        writeStore(data);
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 400, {
          ok: false,
          error: err instanceof Error ? err.message : "JSON inválido",
        });
      }
    }
    res.writeHead(405);
    return res.end();
  }

  if (!fs.existsSync(DIST)) {
    return sendJson(res, 503, {
      ok: false,
      error: "Pasta dist não encontrada. Rode npm run build ou use INICIAR.bat",
    });
  }

  let filePath = safeJoin(DIST, url.pathname);
  if (!filePath) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, "index.html");
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(buf);
  });
});

ensureStore();
server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("  Lambda-Flow (somente local)");
  console.log(`  Abra: http://127.0.0.1:${PORT}`);
  console.log(`  Dados: ${STORE_PATH}`);
  console.log("  Ctrl+C para encerrar");
  console.log("");
});
