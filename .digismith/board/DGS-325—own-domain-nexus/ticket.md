# DGS-325: Own domain for Nexus (private, tailnet only): design and plan

**Key:** DGS-325
**ClickUp:** 14zcebrvcyp (C.5: Nexus, list 1301150000003521)
**Source text:** .digismith/sessions/dgs-325/brief.md

Jack's own name (proposed nexus.jazurite.com) reaches the Workbox's services from his devices only (tailnet, 100.108.1.19), with a valid HTTPS certificate.
Decided by Jack 2026-10-13: private for now; DNS moves to Cloudflare (Namecheap stays registrar; Google Workspace email must survive); front door is Caddy with DNS-challenge certificate.
This order: design and plan only. Nothing installed, no Cloudflare/Namecheap action, no change to Tailscale Serve, pf or the OpenCode server.
