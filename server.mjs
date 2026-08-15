import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

import { getLunchData } from "./lib/lunch-service.mjs";

const host = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), "public");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/api/lunches") {
      const data = await getLunchData();
      return sendJson(response, 200, data);
    }

    const filePath = resolvePublicPath(url.pathname);
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(body);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      sendJson(response, 404, { error: "Sivua ei löytynyt." });
      return;
    }

    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Tuntematon virhe."
    });
  }
});

server.listen(port, host, () => {
  console.log(`Lunch app running at http://${host}:${port}`);
});

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(data, null, 2));
}

function resolvePublicPath(pathname) {
  const candidate = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, candidate));

  if (!filePath.startsWith(publicDir)) {
    throw Object.assign(new Error("Virheellinen polku."), { code: "ENOENT" });
  }

  return filePath;
}
