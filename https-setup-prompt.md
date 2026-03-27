# HTTPS Setup Prompt

Paste this entire file as a prompt to Claude Code running on the Debian server (192.168.68.67) as the david user.

---

You are setting up HTTPS for a Node.js app (receipt-tracker) running on a Debian home server at 192.168.68.67 on port 3000. The server is LAN-only — it has no public domain name and no public internet access, so Let's Encrypt is not an option.

The plan:
1. Install mkcert to create a local certificate authority (CA)
2. Generate a TLS certificate for 192.168.68.67
3. Install Nginx as a reverse proxy that terminates TLS on port 443 and forwards to localhost:3000
4. Add an HTTP→HTTPS redirect on port 80
5. Update the app's .env to enable secure cookies
6. Print instructions for trusting the CA on phones/computers

Work through each step in order. Run commands with the Bash tool. Read files before editing them.

---

## Step 1 — Install mkcert

```bash
sudo apt-get update
sudo apt-get install -y libnss3-tools wget
```

Download the latest mkcert binary for linux/amd64:

```bash
MKCERT_VERSION=$(curl -s https://api.github.com/repos/FiloSottile/mkcert/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
wget -O /usr/local/bin/mkcert "https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-amd64"
chmod +x /usr/local/bin/mkcert
mkcert --version
```

Install the local CA:

```bash
mkcert -install
```

---

## Step 2 — Generate certificate for the LAN IP

Create a directory for certs and generate a certificate that covers both the IP address and localhost:

```bash
sudo mkdir -p /etc/ssl/receipt-tracker
cd /etc/ssl/receipt-tracker
mkcert -cert-file cert.pem -key-file key.pem 192.168.68.67 localhost 127.0.0.1
sudo chmod 640 key.pem
```

---

## Step 3 — Install and configure Nginx

```bash
sudo apt-get install -y nginx
```

Write the Nginx site config. The file to create is `/etc/nginx/sites-available/receipt-tracker`:

```nginx
server {
    listen 80;
    server_name 192.168.68.67;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name 192.168.68.67;

    ssl_certificate     /etc/ssl/receipt-tracker/cert.pem;
    ssl_certificate_key /etc/ssl/receipt-tracker/key.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Forward all traffic to the Node app
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Allow large uploads (receipt images up to 10 MB)
        client_max_body_size 11M;

        # Upload + LLM processing can take several minutes in local mode
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Enable the site and disable the default:

```bash
sudo ln -sf /etc/nginx/sites-available/receipt-tracker /etc/nginx/sites-enabled/receipt-tracker
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

---

## Step 4 — Update the app's .env

Read /home/david/receipt-tracker/.env, then add or update these lines:

```
COOKIE_SECURE=true
```

The app already reads `COOKIE_SECURE` and sets `secure: true` on the session cookie when it is `"true"`.

After editing, restart the app:

```bash
# If running under systemd:
sudo systemctl restart receipt-tracker

# If running manually, just restart the node process.
```

---

## Step 5 — Print CA trust instructions

After completing the above steps, print the following instructions for the user:

---

**Trusting the certificate on your devices**

The certificate was signed by a local CA that only your devices know about. Until you install the CA root certificate, browsers will show a security warning.

**Find the CA certificate:**
```bash
mkcert -CAROOT
# This prints a directory path. The file you need is rootCA.pem inside it.
```

**Android:**
1. Copy `rootCA.pem` to your phone (AirDrop, USB, or serve it temporarily with `python3 -m http.server 8888`)
2. Open Settings → Security → Install a certificate → CA certificate
3. Select the file

**iOS / iPadOS:**
1. AirDrop or email yourself `rootCA.pem` (rename it to `rootCA.crt` first)
2. Open it → Settings → Profile Downloaded → Install
3. Go to Settings → General → About → Certificate Trust Settings → enable the mkcert CA

**macOS:**
```bash
# Run this on your Mac (copy rootCA.pem there first)
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain rootCA.pem
```

**Windows:**
Double-click `rootCA.pem` → Install Certificate → Local Machine → Place in "Trusted Root Certification Authorities"

After installing the CA, navigate to `https://192.168.68.67` — you should see a green padlock.

---

Once all steps are complete, verify HTTPS is working:

```bash
curl -k https://192.168.68.67/api/health
# Should return: {"status":"ok"}

# Without -k (using the trusted CA) should also work from the server itself:
curl --cacert "$(mkcert -CAROOT)/rootCA.pem" https://192.168.68.67/api/health
```
