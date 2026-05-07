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

## 1. Запустить Minikube

```bash
minikube delete
minikube start --driver=kvm2 --cpus=4 --memory=6144 --disk-size=10g
minikube addons enable ingress
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

## 4. Открыть приложение

```bash
kubectl get ingress superuart
```
