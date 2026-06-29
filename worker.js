const CACHE_KEY = "leaderboard_v1";
const CACHE_TTL = 300;

export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (request.method === "GET") {
      const url = new URL(request.url);
      const action = url.searchParams.get("action") || "getAll";

      // Para acciones distintas de getAll (ej: guardarScores), reenviar directo a Apps Script
      if (action !== "getAll") {
        try {
          const data = await callAppsScript(env.APPS_SCRIPT_URL + "?" + url.searchParams.toString());
          ctx.waitUntil(refreshCache(env));
          return new Response(data, { headers: { ...cors, "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 502, headers: { ...cors, "Content-Type": "application/json" }
          });
        }
      }

      // getAll: usar caché KV
      const cached = await env.KV.get(CACHE_KEY);
      if (cached) {
        return new Response(cached, {
          headers: { ...cors, "Content-Type": "application/json", "X-Cache": "HIT" }
        });
      }
      try {
        const data = await callAppsScript(env.APPS_SCRIPT_URL + "?action=getAll");
        ctx.waitUntil(env.KV.put(CACHE_KEY, data, { expirationTtl: CACHE_TTL }));
        return new Response(data, {
          headers: { ...cors, "Content-Type": "application/json", "X-Cache": "MISS" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 502, headers: { ...cors, "Content-Type": "application/json" }
        });
      }
    }

    if (request.method === "POST") {
      try {
        const body = await request.text();
        const res = await fetch(env.APPS_SCRIPT_URL, {
          method: "POST", body,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          redirect: "follow",
        });
        const result = await res.text();
        ctx.waitUntil(refreshCache(env));
        return new Response(result, { headers: { ...cors, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 502, headers: { ...cors, "Content-Type": "application/json" }
        });
      }
    }
  }
};

async function callAppsScript(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

async function refreshCache(env) {
  try {
    const data = await callAppsScript(env.APPS_SCRIPT_URL + "?action=getAll");
    await env.KV.put(CACHE_KEY, data, { expirationTtl: CACHE_TTL });
  } catch (e) {
    // ignore cache refresh errors
  }
}
