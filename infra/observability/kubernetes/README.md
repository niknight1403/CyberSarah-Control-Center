# Kubernetes onboarding

This is an Alloy Helm values example for collecting pod logs and Kubernetes events into the same Loki backend used by the CyberSarah observability hub.

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
# Replace LOKI_PRIVATE_ENDPOINT in alloy-values.yaml first.
helm upgrade --install cybersarah-alloy grafana/alloy \
  --namespace observability --create-namespace \
  --values infra/observability/kubernetes/alloy-values.yaml
```

Install kube-state-metrics and node-exporter from the Prometheus Community Helm repository if cluster resource metrics are required. They expose workload and node metrics; configure a private scrape/remote-write path to the central Prometheus instance. Do not publish the Kubernetes API, Prometheus, Loki or Alloy debug UI to the public internet.

The Alloy chart provisions its service account and required Kubernetes permissions according to chart defaults. Review the rendered manifests with `helm template` and scope permissions to the namespaces that CyberSarah needs to observe before production rollout.

The central Compose Prometheus currently scrapes the CyberSarah application endpoint. It does not automatically discover remote Kubernetes services; connect the cluster metrics through a private scrape target or an authenticated remote-write bridge before treating Kubernetes metrics as live.
