import { createRemoteJWKSet, jwtVerify } from 'jose';
import { dashboard } from './dashboard.js';
export const campaigns = Object.freeze({
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
  const {prefix} = campaignConfig(campaign);
  const stamp=now.toISOString(), day=berlinDay(now);
  // D1 batch is transactional: all three counters commit or none do.
  return db.batch([
    db.prepare(`INSERT INTO ${prefix}_events(id,scanned_at,day) VALUES (?,?,?)`).bind(crypto.randomUUID(),stamp,day),
    db.prepare(`INSERT INTO ${prefix}_daily(day,count) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1`).bind(day),
    db.prepare(`INSERT INTO ${prefix}_total(id,count,last_scan) VALUES (1,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1,last_scan=excluded.last_scan`).bind(stamp)
  ]);
}
export async function statistics(db, {from,to}, before='9999', campaign='tsv') {
  const {prefix,metadata,label}=campaignConfig(campaign);
  const result=await db.batch([
    db.prepare(`SELECT count,last_scan FROM ${prefix}_total WHERE id=1`),
    db.prepare(`SELECT COALESCE(SUM(count),0) AS count FROM ${prefix}_daily`),
    db.prepare(`SELECT day,count FROM ${prefix}_daily WHERE day BETWEEN ? AND ? ORDER BY day`).bind(from,to),
    db.prepare(`SELECT id,scanned_at FROM ${prefix}_events WHERE day BETWEEN ? AND ? AND (scanned_at < ? OR (scanned_at = ? AND id < ?)) ORDER BY scanned_at DESC,id DESC LIMIT 101`).bind(from,to,before.split('|')[0],before.split('|')[0],before.split('|')[1]||''),
    db.prepare("SELECT value FROM qr_metadata WHERE key=?").bind(metadata)
  ]);
  const events=result[3].results;
  const next=events.length>100 ? events[99].scanned_at+'|'+events[99].id : null;
  return {campaign,label,total:result[0].results[0]||{count:0,last_scan:null},dailySum:result[1].results[0].count,daily:result[2].results,events:events.slice(0,100),next,eventsStartedAt:result[4].results[0]?.value,from,to};
}
export default {
  async fetch(request, env) {
    const url=new URL(request.url), path=url.pathname;
    if(url.hostname!=='svb-brueckers.de' && url.hostname!=='localhost' && url.hostname!=='127.0.0.1') return reply('Nicht gefunden',404);
    const campaign=Object.keys(campaigns).find(key=>{const base=campaigns[key].path;return [base,base+'/',base+'/index.html'].includes(path)});
    if(campaign) {
      if(!['GET','HEAD'].includes(request.method)) return reply('Methode nicht erlaubt',405);
      if(request.method==='GET') try { await count(env.DB,new Date(),campaign); } catch { console.error('qr_count_failed',campaign); }
      return new Response(null,{status:302,headers:{Location:target(campaign),'Cache-Control':'no-store, no-cache, must-revalidate','Referrer-Policy':'no-referrer','X-TSV-Handler':'qrcode-tsv-redirect','X-QR-Campaign':campaign}});
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
    await env.DB.batch(Object.values(campaigns).map(({prefix})=>env.DB.prepare(`DELETE FROM ${prefix}_events WHERE scanned_at < ?`).bind(cutoff)));
  }
};
