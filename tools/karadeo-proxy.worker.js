// Karadeo CORS proxy (Cloudflare Workers) — SADECE tarayıcı Karadeo'ya doğrudan bağlanamıyorsa gerekir.
//
// Ne yapar: Siteden gelen isteği olduğu gibi https://karadeo.com/api/transcribe adresine iletir
// ve yanıta CORS izin başlıkları ekler. API anahtarını SAKLAMAZ; tarayıcının gönderdiği
// "Authorization" başlığını aynen iletir. Yani anahtar yine sadece sende (localStorage) durur.
//
// Kurulum (ücretsiz, ~2 dk):
//  1) dash.cloudflare.com -> Workers & Pages -> Create -> "Hello World" Worker oluştur
//  2) Edit code -> bu dosyanın içeriğini yapıştır -> Deploy
//  3) Settings -> Variables -> ALLOWED_ORIGIN = https://KULLANICI.github.io  (sitenin adresi, sonda / olmadan)
//  4) Worker adresini (https://....workers.dev) Çınla > Ayarlar > Karadeo > Proxy adresi alanına yaz
//
// ALLOWED_ORIGIN'i mutlaka ayarla; yoksa herkes senin worker'ını kullanabilir (anahtarı olanlar için sorun değil
// ama gereksiz trafik çeker).

const UPSTREAM = "https://karadeo.com/api/transcribe";

export default {
  async fetch(request, env) {
    const allowed = (env && env.ALLOWED_ORIGIN) || "*";
    const cors = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return new Response("Sadece POST", { status: 405, headers: cors });

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": request.headers.get("Authorization") || "",
      },
      body: request.body,
    });

    const headers = new Headers(upstream.headers);
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
