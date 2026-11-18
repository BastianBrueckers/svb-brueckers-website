# TSV-Statistik – Cloudflare-Integration

Ziel: https://svb-brueckers.de/statistik/; der bestehende Worker qrcode-tsv-redirect übernimmt geschützte HTML-, CSS-, JS- und API-Antworten. Keine Statistikdatei im öffentlichen Homepage-Verzeichnis. D1 ausschließlich über DB, keine öffentliche Datenbank-API.

## Vor Veröffentlichung zwingend im Cloudflare-Konto prüfen

1. Bestehenden Worker inklusive Code, Einstellungen, Routen und D1-Bindungen exportieren. Dieser Code ist ein vorbereiteter Ersatz, kein geprüfter Patch des noch unbekannten Live-Codes. Insbesondere weitere bestehende QR-Pfade übernehmen.
2. DNS der Domain muss proxied sein; GitHub Pages als Origin beibehalten. Route svb-brueckers.de/qrcode_tsv* muss tatsächlich qrcode-tsv-redirect zugeordnet sein. Öffentliche HEAD-Prüfung am 18.11.2026: /qrcode_tsv und /qrcode_tsv/ liefern 302 direkt zum bisherigen UTM-Ziel, no-store; Homepage liefert GitHub-Header hinter Cloudflare. Worker-Identität, Route und D1-Bindung sind damit noch nicht bewiesen. Kein GET-Test auf Produktiv-QR, um Zähler nicht absichtlich zu verändern; ob Live-HEAD zählt, ist ohne Code unklar.
3. Bestehende D1-ID für qrcode-tsv-counter und Binding DB übernehmen; Schema/Unique-Constraints von qr_daily(day) und qr_total(id) kontrollieren. Datenbank sichern, Zählerstände und Differenz notieren.
4. Cloudflare Access: Self-hosted Anwendung für svb-brueckers.de/statistik und /statistik/* (auch nackten Pfad schützen). Allow ausschließlich gewünschte E-Mail-Adressen, keine Bypass-Regel. Anmeldung etwa über E-Mail-Einmalcode. QR-Pfad NICHT schützen. Team-Issuer, Access-AUD und erlaubte E-Mails in Worker setzen; JWT-Signatur, Aussteller, Audience, Ablauf und E-Mail werden zusätzlich im Worker geprüft. Unkonfiguriert bleibt alles gesperrt. workers.dev und Preview-URLs deaktivieren; andere vorhandene Custom Domains ebenfalls prüfen.
5. Neue Route svb-brueckers.de/statistik* ergänzen. Beispielkonfiguration erst nach Abgleich als wrangler.jsonc kopieren. Keine neue Datenbank erstellen.

## Freigabegrenze

Erst nach ausdrücklicher Nutzerbestätigung Access, Routen, Migration, Cron und Worker-Veröffentlichung ausführen. Nutzerfreigabe zur Veröffentlichung am 18.11.2026 liegt vor. Nutzer hat Access Free selbst aktiviert. Freigeschaltete Adresse: mail@svb-brueckers.de. Keine weiteren kostenpflichtigen Dienste aktiviert.

## Lokale Prüfung / spätere Veröffentlichung

Im Verzeichnis: npm ci; npm test. Mit korrekt ausgefüllter wrangler.jsonc: npm run check. Migration zunächst ausschließlich lokal testen: npx wrangler d1 migrations apply qrcode-tsv-counter --local. Kein Produktions-Deploy über GitHub Pages nötig.
Nach Freigabe und Sicherung: npx wrangler d1 migrations apply qrcode-tsv-counter --remote; danach npx wrangler deploy. Access vorher aktivieren. Worker-Version für Rollback festhalten; bei Rollback die additive Ereignistabelle behalten.

## Zählweise und Datenqualität

GET auf /qrcode_tsv, /qrcode_tsv/ und /qrcode_tsv/index.html zählt einmal je HTTP-Anfrage (auch Bots, kein Unique-Visitor-Zähler). HEAD zählt nicht. Die Weiterleitung bleibt 302 zum vorhandenen UTM-Ziel, ohne Cache. Tagesgrenzen Europe/Berlin, wie im aktiven Worker am 18.11.2026 geprüft. UI-Uhrzeiten Europe/Berlin, Wochen Montag–Sonntag.

Ereignis, Tageswert und Gesamtwert werden in EINER D1-Transaktion vor der Weiterleitung gespeichert. Bei Datenbankausfall bleibt die Weiterleitung erreichbar, Fehler wird als tsv_count_failed ohne Besucherdaten protokolliert. In diesem Fall ist der Aufruf nicht gespeichert; garantierte verlustfreie Zählung bei Ausfall erfordert zusätzlich eine dauerhafte Queue und Idempotenz und ist hier nicht behauptet. Cloudflare-Alarm auf diesen Fehler vor Aktivierung einrichten. Keine automatischen Schreib-Retries, die doppelt zählen könnten.

Die frühere Chat-Auswertung behauptete qr_total=33, Tageswerte=32. Nachgerechnet ergeben die 14 tatsächlich geposteten Tageswerte jedoch 33 (August 5, September 14, Oktober 5, November 9). Live-D1-Abgleich am 18.11.2026 bestätigt 33 im Gesamtzähler und 33 als Tageswertsumme. Keine automatische Reparatur oder erfundene Zuordnung. UI zeigt beide Summen und berechnet eine tatsächliche Differenz aus aktuellen Daten.

Neue Zeitpunkte werden erst ab Migration erfasst, nur UUID + UTC-Zeitpunkt + Berlin-Tag. Keine IPs, Cookies oder User-Agents. Nach 90 Tagen löscht täglicher Cron nur Ereignisse, Aggregate bleiben. Cloudflare-Access- und Infrastrukturprotokolle sind separat im Konto zu prüfen. Ereignisliste zeigt jeweils 100 Datensätze mit Cursor; Filter gelten auch dort. Wochen/Monate sind am Filterrand Teilzeiträume.

## Abnahme nach Freigabe

Ohne Anmeldung /statistik, /statistik/, Assets und API gesperrt; gefälschte/abgelaufene/falsche AUD-JWTs und fremde E-Mails abweisen, auch auf Alternativhosts. Mit erlaubter Anmeldung Ansicht und API erfolgreich. Einen gekennzeichneten realen QR-Test ausführen und DB vorher/nachher vergleichen: Gesamt +1, Tageswert +1, Ereignis +1, historische Differenz unverändert. HEAD +0. Produktionsprüfung nicht durch Testdaten-Backfill verfälschen. Handy und Desktop inklusive Filter, Tabellen, leere Zeiträume und Ereignis-Paginierung abnehmen.

## Produktivstand 18.11.2026

- Worker über bestehenden Cloudflare-Dashboardzugang veröffentlicht; aktive Codeversion 4b37adec. Vorherige Codeversion de1f8aff, anschließend reine Variablenänderung f5fc7b5e. Bestehende Bindung und das Kompatibilitätsdatum 2026-08-30 übernommen.
- Access-App becb21ce-98ad-4f24-847c-979fcc90d1be schützt /statistik und /statistik/*; Allow-Richtlinie 3bb85cf6-aed7-4bdc-8a7f-dc126204e03f ausschließlich mail@svb-brueckers.de. E-Mail-Einmalcode eingerichtet. Zusätzliche JWT-Prüfung im Worker.
- QR-Route unverändert; Statistikroute svb-brueckers.de/statistik* ergänzt, fail closed. workers.dev und Vorschau-URLs deaktiviert.
- Additive Migration einzeln in D1 ausgeführt und Erfolg geprüft. Time-Travel-Ausgangspunkt: 00000023-00000000-00005127-ffb9a3f56f17abeeead4c6ef6d8650c6. Kein automatisches Restore durchführen, da dies spätere echte Aufrufe entfernen würde.
- Täglicher Cron 17 3 * * * aktiv. Bereinigt ausschließlich Ereignisse älter als 90 Tage.
- Genau ein kontrollierter GET-Test am 18.11.2026 um 18:59:34 MEZ: 302 zum unveränderten UTM-Ziel, Gesamt 33→34, Tageswerte 33→34, Ereignisse 0→1. Testaufruf bleibt enthalten. HEAD-Tests erhöhen nicht. Homepage HTTP 200. Statistik-API ohne Anmeldung leitet zu Access weiter.
- Acht lokale Tests bestanden, inklusive echter SQLite-Transaktion mit Rollback und Cursor-Paginierung bei gleichen Zeitstempeln. Worker-Bundle erfolgreich gebaut.
- Abschließender angemeldeter Mobil-/Desktoptest wartet auf erste E-Mail-Anmeldung des Nutzers.

Die Konfiguration wrangler.production.jsonc enthält nur Bindungskennungen und öffentliche Anmeldeparameter, keine Zugangstoken oder Passwörter. Künftige CLI-Befehle explizit mit --config wrangler.production.jsonc ausführen und vor Änderungen den aktuellen Cloudflare-Stand abgleichen.
