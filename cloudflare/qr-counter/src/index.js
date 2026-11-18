import { DurableObject } from "cloudflare:workers";

const DESTINATION = "https://svb-brueckers.de/?utm_source=qr_code&utm_medium=offline&utm_campaign=tsv";
const HEADERS = { "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };
const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|curl|wget|headless|monitor|uptime|googleinspectiontool/i;

export class QrCounter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, scans INTEGER NOT NULL DEFAULT 0)");
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/increment") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      this.ctx.storage.sql.exec("INSERT INTO daily(day, scans) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET scans = scans + 1", day);
      return new Response("ok");
    }
    if (url.pathname === "/read") {
      const days = [...this.ctx.storage.sql.exec("SELECT day, scans FROM daily ORDER BY day ASC")].map(x => ({ date: x.day, scans: x.scans }));
      return Response.json({ days });
    }
    return new Response("Not found", { status: 404 });
  }
}

function page() {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>TSV QR-Statistik – Ingenieurbüro Brückers</title>
<style>body{font:16px system-ui,sans-serif;background:#f3f7fc;color:#132c49;margin:0;padding:24px}.wrap{max-width:900px;margin:auto}h1{font-size:clamp(24px,5vw,38px)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.card{background:white;border-radius:14px;padding:20px;box-shadow:0 2px 12px #152c4510}.number{font-size:32px;font-weight:750;margin-top:8px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px;text-align:left;border-bottom:1px solid #ddd}th{background:#e9f1fb}.chart{display:flex;align-items:end;gap:3px;height:160px;background:white;padding:14px;overflow:hidden}.bar{flex:1;min-width:3px;background:#1765aa;border-radius:3px 3px 0 0}button{padding:10px 15px;background:#125a9c;color:white;border:0;border-radius:8px;cursor:pointer}small{color:#566}</style></head><body><main class="wrap"><h1>TSV Heumaden – QR-Code-Statistik</h1><p>Aufrufe des QR-Codes auf der Werbebande. Zeitangaben: Europe/Berlin.</p><section class="cards"><div class="card">Gesamt<div class="number" id="total">–</div></div><div class="card">Heute<div class="number" id="today">–</div></div><div class="card">Letzte 7 Tage<div class="number" id="week">–</div></div><div class="card">Dieser Monat<div class="number" id="month">–</div></div></section><h2>Letzte 30 Tage</h2><div class="chart" id="chart" aria-label="Balkendiagramm der letzten 30 Tage"></div><h2>Tageswerte</h2><button id="download">CSV herunterladen</button><p id="status">Lade Statistik …</p><table><thead><tr><th>Datum</th><th>Aufrufe</th></tr></thead><tbody id="rows"></tbody></table><p><small>Gezählt werden Aufrufe der Weiterleitungsadresse, keine nachgewiesenen individuellen Personen. Bots und Vorschauabrufe werden nach Möglichkeit ausgeschlossen. Die Statistik beginnt mit der Aktivierung.</small></p></main><script>
(async()=>{try{const response=await fetch('/qr-statistik/data.json',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();const entries=new Map(data.days.map(x=>[x.date,x.scans]));const dateKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);const now=new Date();const today=dateKey(now);const todayStart=new Date(today+'T12:00:00Z');const last30=Array.from({length:30},(_,i)=>{const d=new Date(todayStart);d.setUTCDate(d.getUTCDate()-29+i);const key=dateKey(d);return {date:key,scans:entries.get(key)||0}});const last7=last30.slice(-7);const sum=a=>a.reduce((n,x)=>n+x.scans,0);document.getElementById('total').textContent=sum(data.days);document.getElementById('today').textContent=entries.get(today)||0;document.getElementById('week').textContent=sum(last7);document.getElementById('month').textContent=sum(data.days.filter(x=>x.date.slice(0,7)===today.slice(0,7)));const max=Math.max(1,...last30.map(x=>x.scans));document.getElementById('chart').innerHTML=last30.map(x=>'<div class="bar" title="'+x.date+': '+x.scans+'" style="height:'+Math.max(2,x.scans/max*100)+'%"></div>').join('');document.getElementById('rows').innerHTML=[...data.days].reverse().map(x=>'<tr><td>'+x.date+'</td><td>'+x.scans+'</td></tr>').join('');document.getElementById('status').textContent='Stand: '+new Date().toLocaleString('de-DE');document.getElementById('download').onclick=()=>{const csv='Datum;Aufrufe\\n'+data.days.map(x=>x.date+';'+x.scans).join('\\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='tsv-qr-statistik.csv';a.click();URL.revokeObjectURL(a.href)};}catch(e){document.getElementById('status').textContent='Statistik derzeit nicht verfügbar: '+e.message}})();
</script></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const counter = env.QR_COUNTER.getByName("tsv-heumaden");
    if (path === "/qrcode_tsv") {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      const ua = request.headers.get("user-agent") || "";
      const prefetch = (request.headers.get("purpose") || "") + " " + (request.headers.get("sec-purpose") || "");
      if (request.method === "GET" && !BOT.test(ua) && !/prefetch|prerender/i.test(prefetch)) {
        try { await counter.fetch("https://counter.internal/increment", { method: "POST" }); }
        catch (e) { console.error("Counter write failed", e); }
      }
      return Response.redirect(DESTINATION, 302);
    }
    if (path === "/qr-statistik/data.json") {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      const result = await counter.fetch("https://counter.internal/read");
      return new Response(result.body, { headers: { ...HEADERS, "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
    }
    if (path === "/qr-statistik") {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      return new Response(page(), { headers: { ...HEADERS, "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  }
};
