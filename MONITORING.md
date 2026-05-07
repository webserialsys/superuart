# Monitoring

Grafana, Prometheus, and kube-state-metrics run locally in Minikube from `k8s/monitoring.yaml`.

## Components

| Component | Service | Purpose |
|---|---|---|
| Prometheus | `prometheus:9090` | Scrapes app, Kubernetes service endpoints, kube-state-metrics, and cAdvisor metrics |
| kube-state-metrics | `kube-state-metrics:8080` | Exposes pod, deployment, HPA, and other Kubernetes object metrics |
| Grafana | `grafana:3000` | Dashboards and Prometheus datasource |

Grafana is provisioned with Prometheus datasource URL `http://prometheus:9090`.

## Deploy

```bash
kubectl apply -f k8s/
kubectl rollout status deployment/backend
kubectl rollout status deployment/prometheus
kubectl rollout status deployment/kube-state-metrics
kubectl rollout status deployment/grafana
```

Grafana is exposed by the existing ingress under:

```text
/grafana
```

Prometheus is internal by default. To inspect targets locally:

```bash
kubectl port-forward svc/prometheus 9090:9090
```

Then open:

```text
http://127.0.0.1:9090/targets
```

Default credentials are stored in the `grafana-admin` Secret:

```text
admin / change-me-before-production
```

Change them if you expose Grafana outside your local Minikube network.

## Application metrics

The backend exposes Prometheus metrics at:

```text
/metrics
```

The backend service has scrape annotations:

```yaml
prometheus.io/scrape: "true"
prometheus.io/path: /metrics
prometheus.io/port: "8000"
```

Application metrics added by SuperUART:

| Metric | Purpose |
|---|---|
| `superuart_http_requests_total` | Request rate by `pod`, `method`, `route`, `status_code` |
| `superuart_http_request_duration_seconds_bucket` | Latency histograms by `pod`, `method`, `route`, `status_code` |
| `superuart_http_requests_in_progress` | Requests currently being handled by pod |
| `superuart_app_info` | Application version, environment, and pod |

Standard Python process metrics from `prometheus-client` are also exported.

## Dashboards

Grafana is provisioned with two dashboards:

| Dashboard | Shows |
|---|---|
| `SuperUART / Application` | Requests by pod, status codes by pod, P95 latency by route, 5xx errors, route table, in-progress requests |
| `SuperUART / Infrastructure` | Ready pods, restarts, backend replicas, Prometheus target health, pod CPU and memory, HPA replicas |

The infrastructure dashboard uses Kubernetes/cAdvisor and kube-state-metrics metrics such as:

```text
container_cpu_usage_seconds_total
container_memory_working_set_bytes
kube_pod_info
kube_pod_status_ready
kube_pod_container_status_restarts_total
kube_horizontalpodautoscaler_status_current_replicas
```
