import { createRemoteJWKSet, jwtVerify } from 'jose';
import { dashboard } from './dashboard.js';
import { trackerScript } from './homepage-tracker.js';
export const campaigns = Object.freeze({
  homepage: { prefix: 'home', label: 'Homepage ohne QR/Partnerlinks', path: null, metadata: 'homepage_started_at' },
  tsv: { prefix: 'qr', label: 'TV Kemnat Bande/Eisspray', path: '/qrcode_tsv', metadata: 'events_started_at' },
  vivavoce: { prefix: 'qr_vivavoce', label: 'VivaVoce QR-Code', path: '/qr_vivavoce', metadata: 'vivavoce_events_started_at' },
  vivavoce_web: { prefix: 'click_vivavoce', label: 'VivaVoce Homepage', path: '/klick_vivavoce', metadata: 'vivavoce_web_events_started_at', source: 'vivavoce', medium: 'referral' }
});
export function campaignConfig(name) {
  if (!Object.hasOwn(campaigns, name)) throw Error('Unbekannter QR-Code');
  return campaigns[name];
}
const target = campaign => {
  const {source='qr_code',medium='offline'}=campaignConfig(campaign);
  return 'https://svb-brueckers.de/?'+new URLSearchParams({utm_source:source,utm_medium:medium,utm_campaign:campaign});
};
const berlinDay = now => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const keys = new Map();
const headers = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
const reply = (body,status=200,type='text/plain; charset=utf-8') => new Response(body,{status,headers:{...headers,'Content-Type':type}});
export async function authorized(request, env) {
  if (env.PUBLIC_STATISTICS === 'true') return true;
  if (!env.ACCESS_ISSUER || !env.ACCESS_AUD || !env.ALLOWED_EMAILS) return false;
  try {
    const issuer = env.ACCESS_ISSUER;
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) return false;
    if (!keys.has(issuer)) keys.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs')));
    const {payload} = await jwtVerify(request.headers.get('Cf-Access-Jwt-Assertion') || '',keys.get(issuer),{issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email']});
    return env.ALLOWED_EMAILS.split(',').map(s=>s.trim().toLowerCase()).includes(String(payload.email).toLowerCase());
  } catch { return false; }
}
export function range(url) {
  const from=url.searchParams.get('from') || '2020-01-01';
  const to=url.searchParams.get('to') || berlinDay(new Date());
  for(const day of [from,to]) if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day) throw Error('Ungültiges Datum');
  if(from>to) throw Error('Startdatum liegt nach Enddatum');
  return {from,to};
}
export async function count(db, now=new Date(), campaign='tsv') {
  const {prefix,path} = campaignConfig(campaign);
  if(!path)throw Error('Homepage muss über countHomepage gezählt werden');
  const stamp=now.toISOString(), day=berlinDay(now);
  // D1 batch is transactional: all three counters commit or none do.
  return db.batch([
    db.prepare(`INSERT INTO ${prefix}_events(id,scanned_at,day) VALUES (?,?,?)`).bind(crypto.randomUUID(),stamp,day),
    db.prepare(`INSERT INTO ${prefix}_daily(day,count) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1`).bind(day),
    db.prepare(`INSERT INTO ${prefix}_total(id,count,last_scan) VALUES (1,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1,last_scan=excluded.last_scan`).bind(stamp)
  ]);
}
export function homepageRequestAllowed(request) {
  if (request.headers.get('Origin') !== 'https://svb-brueckers.de' || request.headers.get('Sec-Fetch-Site') !== 'same-origin') return false;
  try {
    const ref = new URL(request.headers.get('Referer') || '');
    if (ref.origin !== 'https://svb-brueckers.de' || !['/', '/index.html'].includes(ref.pathname)) return false;
    if (['qr_code','vivavoce'].includes((ref.searchParams.get('utm_source') || '').toLowerCase())) return false;
    if (['tsv','vivavoce','vivavoce_web'].includes((ref.searchParams.get('utm_campaign') || '').toLowerCase())) return false;
    return true;
  } catch { return false; }
}
export async function countHomepage(db, source, now = new Date()) {
  if (!['direct','google','other'].includes(source)) throw Error('Ungültige Quelle');
  const stamp=now.toISOString(), day=berlinDay(now);
  return db.batch([
    db.prepare('INSERT INTO home_daily(day,count) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1').bind(day),
    db.prepare('INSERT INTO home_total(id,count,last_scan) VALUES (1,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1,last_scan=excluded.last_scan').bind(stamp),
    db.prepare('INSERT INTO home_sources(day,source,count) VALUES (?,?,1) ON CONFLICT(day,source) DO UPDATE SET count=count+1').bind(day,source)
  ]);
}
export async function statistics(db, {from,to}, before='9999', campaign='tsv') {
  const {prefix,metadata,label}=campaignConfig(campaign);
  const result=await db.batch([
    db.prepare(`SELECT count,last_scan FROM ${prefix}_total WHERE id=1`),
    db.prepare(`SELECT COALESCE(SUM(count),0) AS count FROM ${prefix}_daily`),
    db.prepare(`SELECT day,count FROM ${prefix}_daily WHERE day BETWEEN ? AND ? ORDER BY day`).bind(from,to),
    campaign==='homepage' ? db.prepare('SELECT NULL AS id,NULL AS scanned_at WHERE 0') : db.prepare(`SELECT id,scanned_at FROM ${prefix}_events WHERE day BETWEEN ? AND ? AND (scanned_at < ? OR (scanned_at = ? AND id < ?)) ORDER BY scanned_at DESC,id DESC LIMIT 101`).bind(from,to,before.split('|')[0],before.split('|')[0],before.split('|')[1]||''),
    db.prepare("SELECT value FROM qr_metadata WHERE key=?").bind(metadata),
    campaign==='homepage' ? db.prepare('SELECT source,SUM(count) AS count FROM home_sources WHERE day BETWEEN ? AND ? GROUP BY source').bind(from,to) : db.prepare('SELECT NULL AS source,0 AS count WHERE 0')
  ]);
  const events=result[3].results;
  const sources=campaign==='homepage' ? result[5].results : null;
  const next=events.length>100 ? events[99].scanned_at+'|'+events[99].id : null;
  return {campaign,label,sources,total:result[0].results[0]||{count:0,last_scan:null},dailySum:result[1].results[0].count,daily:result[2].results,events:events.slice(0,100),next,eventsStartedAt:result[4].results[0]?.value,from,to};
}
export default {
  async fetch(request, env) {
    const url=new URL(request.url), path=url.pathname;
    if(url.hostname!=='svb-brueckers.de' && url.hostname!=='localhost' && url.hostname!=='127.0.0.1') return reply('Nicht gefunden',404);
    const campaign=Object.keys(campaigns).find(key=>{const base=campaigns[key].path;if(!base)return false;return [base,base+'/',base+'/index.html'].includes(path)});
    if(campaign) {
      if(!['GET','HEAD'].includes(request.method)) return reply('Methode nicht erlaubt',405);
      if(request.method==='GET') try { await count(env.DB,new Date(),campaign); } catch { console.error('qr_count_failed',campaign); }
      return new Response(null,{status:302,headers:{Location:target(campaign),'Cache-Control':'no-store, no-cache, must-revalidate','Referrer-Policy':'no-referrer','X-TSV-Handler':'qrcode-tsv-redirect','X-QR-Campaign':campaign}});
    }
    if(path==='/statistik/homepage-counter.js' && request.method==='GET') return reply(trackerScript,200,'text/javascript; charset=utf-8');
    if(path==='/statistik/visit') {
      if(request.method!=='POST') return reply('Methode nicht erlaubt',405);
      if(!homepageRequestAllowed(request)) return reply('Nicht erlaubt',403);
      if(!request.headers.get('Content-Type')?.startsWith('application/json')) return reply('Ungültiges Format',415);
      if(Number(request.headers.get('Content-Length')||0)>256) return reply('Zu groß',413);
      let source;
      try { const body=await request.text(); if(body.length>256)return reply('Zu groß',413); source=JSON.parse(body).source; if(!['direct','google','other'].includes(source))throw Error(); }
      catch { return reply('Ungültige Quelle',400); }
      try { await countHomepage(env.DB,source); return reply(null,204); }
      catch { console.error('homepage_count_failed'); return reply('Vorübergehend nicht verfügbar',503); }
    }
    if(!path.startsWith('/statistik')) return reply('Nicht gefunden',404);
    if(!await authorized(request,env)) return reply('Anmeldung über Cloudflare Access erforderlich.',403);
    if(request.method!=='GET') return reply('Methode nicht erlaubt',405);
    if(path==='/statistik'||path==='/statistik/') return reply(dashboard.html,200,'text/html; charset=utf-8');
    if(path==='/statistik/app.js') return reply(dashboard.js,200,'text/javascript; charset=utf-8');
    if(path==='/statistik/style.css') return reply(dashboard.css,200,'text/css; charset=utf-8');
    if(path==='/statistik/api') {
      const selectedCampaign=url.searchParams.get('campaign')||'tsv';
      let dates; try { campaignConfig(selectedCampaign); dates=range(url); } catch(e) { return reply(e.message,400); }
      try { return reply(JSON.stringify(await statistics(env.DB,dates,url.searchParams.get('before')||undefined,selectedCampaign)),200,'application/json'); }
      catch { return reply('Statistik vorübergehend nicht verfügbar.',503); }
    }
    return reply('Nicht gefunden',404);
  },
  async scheduled(event,env) {
    // Exact timestamps retained 90 days; aggregate counters remain unchanged.
    const cutoff=new Date(Date.now()-90*86400000).toISOString();
    await env.DB.batch(Object.values(campaigns).filter(c=>c.path).map(({prefix})=>env.DB.prepare(`DELETE FROM ${prefix}_events WHERE scanned_at < ?`).bind(cutoff)));
  }
};
