# Minikube

Локальный запуск Kubernetes-манифестов для лабораторной работы.

## Полезные команды

### Остановить кластер
minikube stop

### Удалить кластер
minikube delete

### Открыть dashboard
minikube dashboard

### Посмотреть IP minikube
minikube ip

### Список аддонов
minikube addons list

### Логи пода
kubectl logs <pod-name>

### Rollout
kubectl rollout restart deployment/backend -n default
kubectl rollout status deployment/backend -n default


## 1. Запустить Minikube

```bash
minikube delete
minikube start --driver=kvm2 --cpus=6 --memory=8192 --disk-size=15g
minikube addons enable ingress
minikube addons enable metrics-server
```

## 2. Создать secret для приватных GHCR-образов

Токен должен иметь право `read:packages`.
Сначала задайте переменные в текущем терминале:

```bash
export GHCR_USERNAME="<github-username>"
export GHCR_TOKEN="<github-token-with-read-packages>"
```

После этого создайте secret:

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USERNAME" \
  --docker-password="$GHCR_TOKEN"
```

## 3. Развернуть приложение

```bash
kubectl apply -f k8s/
```

## 4. Проверить мониторинг

Prometheus, kube-state-metrics и Grafana разворачиваются локально в Minikube из `k8s/monitoring.yaml`.
Grafana доступна через существующий ingress по пути `/grafana`.

```bash
kubectl rollout status deployment/prometheus
kubectl rollout status deployment/kube-state-metrics
kubectl rollout status deployment/grafana
kubectl get pods -l app=prometheus
kubectl get pods -l app=kube-state-metrics
kubectl get pods -l app=grafana
kubectl get ingress superuart
```

Backend отдает метрики для Prometheus на `/metrics`; service `backend` уже содержит scrape-аннотации.
Prometheus можно проверить локально через port-forward:

```bash
kubectl port-forward svc/prometheus 9090:9090
```

После этого targets доступны по адресу `http://127.0.0.1:9090/targets`.
Подробности: `MONITORING.md`.

## 5. Проверить горизонтальное масштабирование backend

HPA для `deployment/backend` настроен в `k8s/hpa.yaml`: минимум 1 pod, максимум 6 pod, целевая средняя загрузка CPU - 15%.

```bash
kubectl get hpa backend
kubectl describe hpa backend
```

В отдельном терминале удобно наблюдать за HPA и pod:

```bash
kubectl get hpa backend -w
kubectl get pods -l app=backend -w
```

## 6. Запустить нагрузку через Yandex.Tank

Yandex.Tank запускается отдельным Kubernetes Job из `load/yandex-tank/k8s-job.yaml` и нагружает backend service внутри кластера по адресу `backend:8000`.

```bash
kubectl delete job yandex-tank-load --ignore-not-found
kubectl apply -f load/yandex-tank/k8s-job.yaml
kubectl logs -f job/yandex-tank-load
```

После роста CPU выше 15% HPA должен увеличить количество pod для `deployment/backend`.
После проверки нагрузочный Job можно удалить:

```bash
kubectl delete job yandex-tank-load
```

## 7. Открыть приложение

```bash
kubectl get ingress superuart
```
