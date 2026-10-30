# Kamatera HTTPS for Blastridge

The public entry point is `https://79.108.166.122/`. nginx listens on ports 80 and 443 and proxies all game traffic, including Socket.IO WebSockets, to PM2's `arena` process on port 3000. Port 80 redirects to HTTPS except for the ACME challenge path.

The first certificate was issued with Certbot 5.9 using the Let's Encrypt `shortlived` profile and `--ip-address 79.108.166.122`. IP certificates last 160 hours. The snap timer `snap.certbot.renew.timer` automatically checks renewals; `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` tests and reloads nginx after a successful renewal. The challenge webroot is `/var/www/blastridge-acme`.

The repository files mirror the server configuration:

- `nginx-blastridge-bootstrap.conf`: HTTP proxy and ACME path used for first issuance.
- `nginx-blastridge.conf`: active HTTPS proxy and HTTP redirect.
- `reload-nginx-after-cert-renewal.sh`: Certbot deploy hook.

Checks:

```sh
nginx -t
systemctl is-active nginx snap.certbot.renew.timer
pm2 show arena
curl -fsS http://127.0.0.1:3000/api/build
curl -I https://79.108.166.122/
curl -I http://79.108.166.122/
certbot renew --dry-run --cert-name 79.108.166.122 --no-random-sleep-on-renew --run-deploy-hooks
```

For an application rollback, keep nginx running and start the old release with `PORT=3000`. For a proxy rollback, restore the PM2 process on port 80 only after stopping nginx; `/root/.pm2/dump-before-https-20261030.pm2` is the saved pre-HTTPS process list.
