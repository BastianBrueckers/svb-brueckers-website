# TSV-Heumaden-QR-Statistik (Cloudflare Worker)

## Status
Prepared code only. **Not deployed**. Existing GitHub Pages QR redirect remains unchanged until the Cloudflare account, domain proxy and routes are configured.

## Functionality
- Existing printed QR URL: https://svb-brueckers.de/qrcode_tsv/
- Public dashboard: https://svb-brueckers.de/qr-statistik/
- Public JSON: https://svb-brueckers.de/qr-statistik/data.json
- Redirect preserves UTM parameters.
- SQLite-backed Durable Object stores daily aggregated counts, in Europe/Berlin time.
- No IP addresses, cookies, user identifiers, or user agents are persisted.
- Basic bot/prefetch filtering; repeat visits count as separate requests.
- The stats page itself is not counted.
- Historical statistics cannot be recovered from this new counter.

## One-time setup (Cloudflare account owner)
1. Create a free Cloudflare account and add the existing domain `svb-brueckers.de`. Review imported DNS records carefully, especially MX, SPF, DKIM, DMARC, TXT, CNAME and existing GitHub Pages A/AAAA records. Do not remove or change email records. Changing authoritative nameservers may require action at Strato; plan and verify DNS before doing so.
2. Enable Cloudflare proxy (orange cloud) for the web DNS records. Ensure HTTPS and GitHub Pages continue working. **Do not deploy routes until the normal website works through Cloudflare.**
3. From this folder run `npx wrangler login`, then `npx wrangler deploy` (Node.js required). Cloudflare account and permissions are required. Review free-tier limits and billing prompts before confirming.
4. In Cloudflare dashboard > Workers & Pages > this Worker > Settings > Domains & Routes, add **Worker Routes**:
   - `svb-brueckers.de/qrcode_tsv*`
   - `svb-brueckers.de/qr-statistik*`
   Add equivalent `www` routes only if `www` is served by Cloudflare and is actually used.
5. Check the homepage, `/qrcode_tsv/` (302 to homepage with UTM), `/qr-statistik/` (dashboard) and `/qr-statistik/data.json` (JSON). **Note:** Each manual test visit to the QR URL increments the counter; subtract test counts when interpreting initial totals.
6. Do not alter the existing GitHub Pages redirect until routing is tested. The Worker intercepts requests on the Cloudflare edge, so the existing static redirect is only a fallback if the Worker route is not active.

## Important limitations
- The Worker route requires the domain to use Cloudflare's proxy. GitHub Pages by itself cannot run server-side counters.
- The dashboard and JSON endpoint are public. Anyone can view aggregate counts.
- The counter records HTTP requests to the QR URL, not provably physical camera scans; repeat opens count again, and filtering may miss some bots.
- An untrusted visitor could artificially increase counts by repeatedly calling the public QR URL. For a marketing directional metric this may be acceptable; stronger anti-abuse protection would require additional design.
- The current implementation intentionally favors preserving the redirect if the counter write fails, so in an outage some visits could be uncounted.
- Daily counts use SQLite Durable Object storage. Test the Workers Free plan's Durable Objects availability/quotas in your account before enabling.
- No analytics provider subscription is required, but Cloudflare account, DNS access and deployment authorization are required.
