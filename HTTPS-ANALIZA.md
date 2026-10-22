# Domeniu + HTTPS — analiză (fără nicio modificare pe VPS)

Starea de azi: jocul rulează la `http://79.108.166.122` (Node direct pe portul 80, pm2 `arena`), de aceea browserul arată „Not secure”.

## Ce am verificat în cod
- `server.js` ascultă pe `process.env.PORT || 3000` (`server.js:2528`). Nu are `trust proxy`, CORS, `helmet` sau logică pe IP (`req.ip`, `x-forwarded-for`, `handshake.address` nu apar). Deci un reverse proxy nu strică nimic și **nu cere schimbări de cod**.
- Clientul se conectează cu `io(...)` fără URL (same-origin), deci pe pagină HTTPS devine automat `wss://`. Nu există `http://`/`ws://` hardcodate în `game.js`/`index.html` (singurele `http://` sunt namespace-uri SVG).
- `fly.toml`/`Dockerfile` sunt de la Fly.io și nu se folosesc la Kamatera.

## Varianta recomandată: Caddy în fața Node
Caddy ia singur certificatul Let's Encrypt, îl reînnoiește, face redirect 80→443, proxy de WebSocket fără configurare extra și HTTP/2.

```
# /etc/caddy/Caddyfile  (DOMENIU = subdomeniul ales)
DOMENIU {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

### Pași (de făcut abia după ce ai ales domeniul și ai confirmat)
1. **DNS** (la registrar): înregistrare `A` `DOMENIU → 79.108.166.122`. Verifici cu `nslookup DOMENIU` că răspunde IP-ul VPS-ului **înainte** de Caddy (altfel Let's Encrypt eșuează și poate bloca temporar).
2. **Firewall Kamatera/ufw**: deschise 80 și 443 (TCP). Port 443/UDP pentru HTTP/3 e opțional.
3. **Mută Node de pe 80 pe 3000**: `PORT=3000` în mediul pm2 (`pm2 restart arena --update-env` sau în ecosistem). Asta e „setările pm2 de pe VPS” din lista „de nu atins fără să întrebi”, deci se face doar cu confirmarea ta. Caddy nu poate prelua portul 80 cât timp Node îl ține.
4. Instalare Caddy (pachetul oficial apt, repo Cloudsmith), `Caddyfile` ca mai sus, `systemctl reload caddy`.
5. Verificări: `curl -I https://DOMENIU`, `curl -I http://DOMENIU` (301 spre https), pagina de joc, intrare în cameră (WebSocket), `/api/build`.

### Ordine sigură (fereastră de mentenanță scurtă, ~1–2 min)
Fără meci activ (aceeași verificare ca la deploy) → Caddy instalat dar oprit → pm2 pe 3000 → pornit Caddy. **Rollback:** `systemctl stop caddy`, `PORT=80` înapoi în pm2, restart `arena`; IP-ul vechi `http://79.108.166.122` revine imediat.

## Atenție
- **Cu 1 vCPU**, Caddy adaugă un proces; consumul e mic, dar tick-ul serverului a fost sensibil la blocaje. Caddy cu `encode` consumă CPU pentru compresie; fișierele mari (PNG/mp3) sunt oricum necompresibile, iar JS/CSS/JSON se comprimă o dată. După activare merită o măsurătoare `[LAG]` într-un meci real.
- **Fără `encode`** dacă preferi zero risc de CPU: jocul trimite deja WebSocket cu msgpack, iar pagina e încărcată o dată pe sesiune.
- **Cache-busting** (`?v=<build>`) rămâne neschimbat.
- **Sesiuni/tokenuri**: `sessionTokens` e în memorie și nu depinde de origine, dar `localStorage` e pe origine: jucătorii care au sesiune salvată pe `http://IP` o pierd la mutarea pe domeniu (rămân logați cu parola). IP-ul vechi poate rămâne un timp ca alias sau poate redirecționa spre domeniu.
- **Supabase** nu e afectat (serverul vorbește cu el, nu browserul).
- **Alternativă fără VPS**: Cloudflare în față (proxy portocaliu) — mai simplu pentru DDoS, dar WebSocket-ul trece prin ei și adaugă latență; nu o recomand pentru un joc de tick 60/s.

## Ce îmi trebuie de la tine
Doar domeniul/subdomeniul și accesul la DNS-ul lui (sau să adaugi tu înregistrarea `A`). Restul îl pregătesc și îl execut după confirmarea ta, cu pașii de mai sus.
