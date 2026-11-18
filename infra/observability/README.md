# CyberSarah Unified Observability

This opt-in stack consolidates Grafana dashboards, Prometheus metrics, Loki logs, Tempo traces and Alloy Docker-log collection. It is designed to complement the existing CyberSarah billing, funnel, conversion and Agentforge telemetry tables rather than creating a second revenue database.

## Start

```bash
cd infra/observability
export GRAFANA_ADMIN_PASSWORD="$(openssl rand -hex 24)"
docker compose up -d
```

All host-published ports bind to loopback: Grafana `http://127.0.0.1:3000`, Prometheus `http://127.0.0.1:9090`, Loki `http://127.0.0.1:3100`, Tempo `http://127.0.0.1:3200`. Put Grafana behind the existing authenticated application proxy before remote access.

## Application integration

The API module exposes:
- `GET /api/observability/summary` — existing revenue_daily_stats, funnel_campaigns and conversion_events, with no customer email or raw webhook payload.
- `GET /api/observability/metrics` — Prometheus text exposition for the same aggregate metrics.

Both endpoints require `Authorization: Bearer $METRICS_TOKEN`. Do not put this token into a public browser bundle or commit it. Configure Prometheus authorization through a secret-mounted file or scrape through a protected private proxy; the example scrape config is a target template and must not be considered authenticated until configured.

## Logs, RUM, APK and Kubernetes

- Alloy discovers Docker containers and ships container logs to Loki.
- Send OpenTelemetry traces to the Alloy OTLP receiver on port 4317/4318 (the receiver is internal to the Compose network by default; publish it only on a private interface if remote agents need it).
- Web RUM: instrument the web client with Grafana Faro Web SDK and forward to a separately authenticated Faro receiver/Alloy pipeline. Do not send session tokens, form values, email addresses or payment data.
- Android/APK: instrument app lifecycle, handled exceptions and performance spans with an OpenTelemetry-compatible React Native exporter; use release/version/build identifiers and scrub PII before export. Native crash symbolication is a separate release-pipeline task.
- Kubernetes: deploy Alloy as a DaemonSet for pod logs and OTLP, and scrape kube-state-metrics plus node-exporter. Keep cluster credentials read-only and namespace-scoped. Docker Compose remains supported for non-Kubernetes deployments.
- Umami can be connected as an additional first-party analytics source after its own database and privacy/consent configuration are provisioned; it is not silently enabled by this stack.

## Synthetic checks

```bash
k6 run infra/observability/synthetics/checkout-smoke.js
```

The initial synthetic is deliberately read-only and checks application health. It does not create Stripe payments, send emails, publish content or modify customer data. Add authenticated checkout test-mode flows only with dedicated Stripe test credentials.

## Revenue semantics

Revenue panels use recorded values from the existing database. They do not infer MRR from one-off sales, and they do not label gross volume as net revenue. Stripe and Digistore24 figures must be reconciled by currency, refunds, fees and event type before profitability/ROI is shown.

## Acceptance boundary

This is an opt-in implementation scaffold. Runtime startup, authenticated Prometheus scraping, web RUM SDK integration, Android release instrumentation, Kubernetes manifests, Umami provisioning and real checkout synthetic tests require deployment-specific configuration and verification. No production state is changed by adding these files.
