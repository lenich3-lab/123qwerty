"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  GenerationError,
  validateRequest,
  generate,
} = require("./lib/generation.cjs");

function createServer(config = {}) {
  const apiKey = config.apiKey ?? process.env.TUTOR_AI_API_KEY ?? "";
  const accessCode =
    config.accessCode ?? process.env.TUTOR_AI_ACCESS_CODE ?? "";
  const host = config.host ?? process.env.HOST ?? "127.0.0.1";
  const model = config.model ?? process.env.TUTOR_AI_MODEL ?? "gpt-4.1-mini";
  const localOnly =
    ["127.0.0.1", "localhost", "::1"].includes(host) &&
    process.env.NODE_ENV !== "production";
  const configured = Boolean(apiKey && (accessCode.length >= 12 || localOnly));
  const origins = new Set(
    (config.allowedOrigins ?? process.env.TUTOR_AI_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
  const limits = new Map();
  let active = 0;
  function limited(key, max) {
    const now = Date.now();
    for (const [k, item] of limits) if (item.until < now) limits.delete(k);
    if (!limits.has(key)) {
      if (limits.size >= 2000) return true;
      limits.set(key, { count: 0, until: now + 60000 });
    }
    return ++limits.get(key).count > max;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    const json = (status, data) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return json(400, { error: "Некорректный адрес." });
    }
    if (url.pathname.startsWith("/api/")) {
      const origin = req.headers.origin;
      let ownOrigin = false;
      try {
        const u = new URL(origin);
        ownOrigin =
          ["http:", "https:"].includes(u.protocol) &&
          u.host === req.headers.host;
      } catch {}
      if (origin && !ownOrigin && !origins.has(origin))
        return json(403, {
          error: "Этот сайт не подключён к серверу генерации.",
        });
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "600",
        });
        return res.end();
      }
      if (url.pathname === "/api/ai/status" && req.method === "GET")
        return json(200, {
          configured,
          requiresAccessCode: Boolean(accessCode),
          reason: !apiKey
            ? "missing_key"
            : !configured
              ? "missing_access_code"
              : null,
        });
      if (url.pathname !== "/api/ai/generate" || req.method !== "POST")
        return json(404, { error: "Метод не найден." });
      if (!configured)
        return json(503, {
          error: !apiKey
            ? "ИИ пока не подключён: владелец приложения должен добавить серверный ключ."
            : "Для публичного сервера нужно настроить код доступа длиной от 12 символов.",
        });
      const remote = req.socket.remoteAddress || "unknown";
      if (limited(`auth:${remote}`, 30))
        return json(429, {
          error: "Слишком много обращений. Подождите минуту.",
        });
      if (accessCode) {
        const expected = crypto
          .createHash("sha256")
          .update(`Bearer ${accessCode}`)
          .digest();
        const received = crypto
          .createHash("sha256")
          .update(req.headers.authorization || "")
          .digest();
        if (!crypto.timingSafeEqual(expected, received))
          return json(401, { error: "Неверный код доступа к генерации." });
      }
      if (
        req.headers["content-type"]?.split(";")[0].trim() !== "application/json"
      )
        return json(415, { error: "Нужен JSON-запрос." });
      let input;
      try {
        let size = 0;
        const buffers = [];
        for await (const buffer of req) {
          size += buffer.length;
          if (size > 64000)
            throw new GenerationError("Описание слишком большое.", 413);
          buffers.push(buffer);
        }
        try {
          input = JSON.parse(Buffer.concat(buffers).toString("utf8"));
        } catch {
          throw new GenerationError("Некорректный JSON-запрос.");
        }
        input = validateRequest(input);
      } catch (error) {
        return json(error.status || 400, {
          error:
            error instanceof GenerationError
              ? error.message
              : "Не удалось прочитать запрос.",
        });
      }
      if (active >= 2)
        return json(429, {
          error: "Сейчас уже готовятся два материала. Подождите их завершения.",
        });
      if (limited(`generate:${remote}`, 8))
        return json(429, {
          error:
            "Лимит генерации: восемь запросов в минуту. Немного подождите.",
        });
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        config.timeoutMs ?? 90000,
      );
      const onClose = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", onClose);
      active++;
      try {
        json(
          200,
          await generate(input, {
            apiKey,
            model,
            fetchImpl: config.fetchImpl,
            signal: controller.signal,
          }),
        );
      } catch (error) {
        json(error instanceof GenerationError ? error.status : 500, {
          error:
            error instanceof GenerationError
              ? error.message
              : "Не удалось подготовить материал. Попробуйте ещё раз.",
        });
      } finally {
        active--;
        clearTimeout(timer);
        res.off("close", onClose);
      }
      return;
    }
    if (!["GET", "HEAD"].includes(req.method))
      return json(405, { error: "Метод не поддерживается." });
    const files = {
      "/": ["index.html", "text/html"],
      "/index.html": ["index.html", "text/html"],
      "/style.css": ["style.css", "text/css"],
      "/app.js": ["app.js", "text/javascript"],
      "/ai.js": ["ai.js", "text/javascript"],
      "/ai.css": ["ai.css", "text/css"],
    };
    const file = files[url.pathname];
    if (!file) return json(404, { error: "Страница не найдена." });
    try {
      const data = fs.readFileSync(path.join(__dirname, file[0]));
      res.writeHead(200, {
        "Content-Type": `${file[1]}; charset=utf-8`,
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      json(500, { error: "Файл приложения недоступен." });
    }
  });
  server.requestTimeout = 100000;
  server.headersTimeout = 15000;
  return server;
}
if (require.main === module) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8000);
  createServer({ host }).listen(port, host, () =>
    console.log(`Уроко запущено на порту ${port}.`),
  );
}
module.exports = { createServer };
