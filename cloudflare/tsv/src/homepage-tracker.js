export function classifyHomepage(locationHref, referrer, navigationType='navigate', topLevel=true) {
  const url=new URL(locationHref);
  if(!topLevel || url.origin!=='https://svb-brueckers.de' || !['/','/index.html'].includes(url.pathname)) return null;
  if(navigationType!=='navigate') return null;
  if(['qr_code','vivavoce'].includes((url.searchParams.get('utm_source')||'').toLowerCase())) return null;
  if(['tsv','vivavoce','vivavoce_web'].includes((url.searchParams.get('utm_campaign')||'').toLowerCase())) return null;
  if(!referrer) return 'direct';
  try {
    const ref=new URL(referrer);
    if(ref.hostname===url.hostname || ref.hostname==='www.svb-brueckers.de')return null;
    if(ref.hostname==='vivavoce-stuttgart.de'||ref.hostname.endsWith('.vivavoce-stuttgart.de'))return null;
    return /(^|\.)google\.(com|de|at|ch|fr|it|nl|be|es|co\.uk|com\.au|ca|co\.in|co\.jp)$/.test(ref.hostname) ? 'google' : 'other';
  } catch { return 'direct'; }
}
export const trackerScript = `(() => {
  const classify = ${classifyHomepage.toString()};
  const source=classify(location.href,document.referrer,performance.getEntriesByType('navigation')[0]?.type||'navigate',window.top===window.self);
  if(!source)return;
  fetch('/statistik/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source}),credentials:'omit',keepalive:true,cache:'no-store'}).catch(()=>{});
})();`;
