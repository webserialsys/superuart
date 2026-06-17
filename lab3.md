# Лабораторная работа 3: Kubernetes, масштабирование, мониторинг и Docker Registry

## Коротко, что мы сделали

В этой лабораторной мы взяли приложение SuperUART, которое уже было упаковано в Docker-образы, и запустили его не просто через `docker compose`, а внутри Kubernetes-кластера.

Локально для этого использовался Minikube. Minikube - это маленький Kubernetes-кластер на компьютере, удобный для учебных работ.

В Kubernetes были развернуты:

- `backend` - FastAPI API приложения;
- `frontend` - Next.js интерфейс;
- `worker` - фоновый обработчик задач;
- `db` - PostgreSQL;
- `redis` - Redis для кеша, очередей и lock-механики;
- `prometheus` - сборщик метрик;
- `kube-state-metrics` - источник метрик о Kubernetes-объектах;
- `grafana` - интерфейс с графиками;
- `yandex-tank-load` - нагрузочный тест как Kubernetes Job.

Главная идея: Kubernetes сам запускает контейнеры, следит за ними, дает им сетевые адреса, умеет увеличивать количество backend-подов при нагрузке и позволяет собирать метрики.

## Базовые понятия простыми словами

`Pod` - минимальная единица запуска в Kubernetes. Обычно внутри pod работает один контейнер. Например, один pod backend - это один запущенный экземпляр backend-приложения.

`Deployment` - объект, который говорит Kubernetes: "запусти вот такое приложение в таком количестве копий и следи, чтобы оно работало". Если pod упадет, Deployment создаст новый.

`Service` - постоянный внутренний адрес для группы pod. Pod могут пересоздаваться и менять IP, а Service остается стабильным. Например, нагрузочный тест обращается к backend просто по имени `backend:8000`.

`Ingress` - входная точка снаружи к сервисам внутри Kubernetes. У нас через Ingress идут пути `/api`, `/docs`, `/grafana` и `/`.

`HPA` - Horizontal Pod Autoscaler. Он автоматически меняет количество pod в Deployment в зависимости от нагрузки.

`Job` - одноразовая задача. В нашей работе Yandex.Tank запускается как Job: отработал нагрузочный тест и завершился.

## Запуск Minikube

Кластер создавался командами из `MINIKUBE.md`:

```bash
minikube delete
minikube start --driver=kvm2 --cpus=6 --memory=8192 --disk-size=15g
minikube addons enable ingress --images='ingress-nginx/controller:v1.14.3'
minikube addons enable metrics-server
```

Зачем это нужно:

- `minikube start` запускает локальный Kubernetes;
- `ingress` нужен, чтобы открыть приложение через HTTP-маршруты;
- `metrics-server` нужен для HPA, потому что HPA должен видеть загрузку CPU pod.

## Docker-образы и приватный реестр

Приложение запускается из Docker-образов, которые лежат в GitHub Container Registry, то есть в облачном Docker Registry:

```text
ghcr.io/webserialsys/superuart/backend:latest
ghcr.io/webserialsys/superuart/frontend:latest
```

Эти образы используются в `k8s/deployment.yaml`.

Так как GHCR может быть приватным, в Kubernetes создается secret `ghcr-secret`. Он хранит логин и токен, чтобы Minikube мог скачать образы:

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USERNAME" \
  --docker-password="$GHCR_TOKEN"
```

В манифестах это подключено через:

```yaml
imagePullSecrets:
  - name: ghcr-secret
```

Простыми словами: Kubernetes получает пароль от Docker Registry и может скачать наши backend/frontend образы.

## Развертывание приложения в Kubernetes

Все Kubernetes-манифесты лежат в папке `k8s/`.

Приложение разворачивается одной командой:

```bash
kubectl apply -f k8s/
```

Основные файлы:

| Файл | Что делает |
|---|---|
| `k8s/config.yaml` | Создает ConfigMap и Secret с настройками приложения |
| `k8s/database.yaml` | Запускает PostgreSQL и Redis |
| `k8s/deployment.yaml` | Запускает backend, frontend и worker |
| `k8s/service.yaml` | Создает внутренние адреса `backend` и `frontend` |
| `k8s/ingress.yaml` | Настраивает входные HTTP-маршруты |
| `k8s/migrate.yaml` | Запускает миграции базы данных |
| `k8s/hpa.yaml` | Настраивает автомасштабирование backend |
| `k8s/monitoring.yaml` | Запускает Prometheus, Grafana и kube-state-metrics |

Backend запускается как Deployment `backend`. Внутри используется образ:

```text
ghcr.io/webserialsys/superuart/backend:latest
```

Frontend запускается как Deployment `frontend` из образа:

```text
ghcr.io/webserialsys/superuart/frontend:latest
```

Worker запускается из backend-образа, но с другой командой: он не принимает HTTP-запросы, а обрабатывает фоновые задачи через ARQ/Redis.

## Сетевые маршруты

В `k8s/ingress.yaml` настроено, куда отправлять HTTP-запросы:

| Путь | Куда идет |
|---|---|
| `/api` | backend |
| `/docs` | backend Swagger |
| `/redoc` | backend ReDoc |
| `/openapi.json` | backend OpenAPI |
| `/grafana` | Grafana |
| `/` | frontend |

То есть пользователь открывает приложение через Ingress, а Kubernetes сам направляет запрос в нужный Service.

## Горизонтальное масштабирование backend

Горизонтальное масштабирование настроено в `k8s/hpa.yaml`.

Там указан объект `HorizontalPodAutoscaler` для Deployment `backend`:

```yaml
minReplicas: 1
maxReplicas: 6
averageUtilization: 15
```

Это значит:

- минимум всегда работает 1 backend pod;
- максимум Kubernetes может поднять 6 backend pod;
- если средняя загрузка CPU становится выше 15%, HPA начинает добавлять pod.

Почему это называется горизонтальным масштабированием: мы не делаем один контейнер мощнее, а создаем больше одинаковых экземпляров backend.

Проверка:

```bash
kubectl get hpa backend
kubectl describe hpa backend
kubectl get pods -l app=backend -w
```

Если нагрузка растет, можно увидеть, что pod backend становится больше: сначала 1, потом 2, 3 и так далее.

## Нагрузочное тестирование через Yandex.Tank

Чтобы проверить HPA, нужна нагрузка. Для этого используется Yandex.Tank.

Он описан в файле:

```text
load/yandex-tank/k8s-job.yaml
```

Yandex.Tank запускается как Kubernetes Job:

```bash
kubectl delete job yandex-tank-load --ignore-not-found
kubectl apply -f load/yandex-tank/k8s-job.yaml
kubectl logs -f job/yandex-tank-load
```

В конфигурации Tank указано:

```yaml
address: backend
port: "8000"
uris:
  - /api/v1/health
```

То есть нагрузочный тест находится внутри Kubernetes и обращается к backend по внутреннему имени Service `backend`.

Профиль нагрузки:

```yaml
schedule: line(50, 800, 5m) const(800, 5m)
```

Простыми словами:

- сначала нагрузка плавно растет с 50 до 800 запросов в секунду за 5 минут;
- потом держится на уровне 800 запросов в секунду еще 5 минут.

Во время этого CPU backend растет, HPA видит превышение порога 15% и создает новые backend pod.

## Метрики приложения

Backend отдает метрики Prometheus по адресу:

```text
/metrics
```

Это подключено в коде backend:

- `backend/src/app/core/setup.py` добавляет route `/metrics`;
- `backend/src/app/middleware/metrics_middleware.py` считает HTTP-метрики.

Основные метрики приложения:

| Метрика | Что показывает |
|---|---|
| `superuart_http_requests_total` | Сколько HTTP-запросов пришло |
| `superuart_http_request_duration_seconds_bucket` | Сколько времени занимали запросы |
| `superuart_http_requests_in_progress` | Сколько запросов обрабатывается прямо сейчас |
| `superuart_app_info` | Информация о версии, окружении и pod |

У метрик есть labels, например:

- `pod` - какой pod обработал запрос;
- `method` - GET, POST и т.д.;
- `route` - какой endpoint был вызван;
- `status_code` - HTTP-статус ответа.

Именно поэтому в Grafana можно явно показать, какие запросы идут по pod.

## Prometheus

Prometheus развернут в Kubernetes из `k8s/monitoring.yaml`.

Он собирает метрики из нескольких мест:

- с самого Prometheus;
- с `kube-state-metrics`;
- с backend через `/metrics`;
- с cAdvisor для CPU и памяти контейнеров.

Чтобы Prometheus понял, что backend нужно опрашивать, в `k8s/service.yaml` у Service `backend` добавлены annotations:

```yaml
prometheus.io/scrape: "true"
prometheus.io/path: /metrics
prometheus.io/port: "8000"
```

Простыми словами: Service сам помечен как "с меня надо собирать метрики".

Проверка targets Prometheus:

```bash
kubectl port-forward svc/prometheus 9090:9090
```

Потом открыть:

```text
http://127.0.0.1:9090/targets
```

Если target зеленый, значит Prometheus успешно собирает метрики.

## kube-state-metrics

`kube-state-metrics` - это отдельный компонент мониторинга.

Он не смотрит внутрь приложения. Он показывает состояние Kubernetes-объектов:

- сколько pod запущено;
- какие pod готовы;
- сколько было рестартов;
- сколько реплик у Deployment;
- что происходит с HPA.

Эти данные нужны для инфраструктурного dashboard в Grafana.

## Grafana

Grafana тоже развернута из `k8s/monitoring.yaml`.

Она доступна через Ingress:

```text
/grafana
```

Логин и пароль для учебного стенда:

```text
admin / admin
```

Grafana автоматически получает datasource Prometheus:

```text
http://prometheus:9090
```

То есть Grafana не собирает метрики сама. Она спрашивает их у Prometheus и рисует графики.

## Dashboard приложения

В Grafana подготовлен dashboard:

```text
SuperUART / Application
```

Он показывает:

- requests by pod - сколько запросов обрабатывает каждый backend pod;
- HTTP status by pod - какие статусы ответов идут по pod;
- P95 latency by pod and route - задержка запросов;
- 5xx errors by pod - ошибки backend;
- Routes by pod - таблица запросов по маршрутам;
- In-progress requests by pod - сколько запросов сейчас в обработке.

Этот dashboard закрывает требование "показать явно по подам какие запросы идут и что с метриками приложения".

## Dashboard инфраструктуры

Второй dashboard:

```text
SuperUART / Infrastructure
```

Он показывает состояние Kubernetes:

- сколько pod готовы;
- сколько было рестартов;
- сколько доступных backend replicas;
- живы ли Prometheus targets;
- CPU по pod;
- память по pod;
- текущее и максимальное количество HPA replicas;
- готовность pod.

Это нужно, чтобы видеть не только приложение, но и инфраструктуру вокруг него.

## CI/CD и сохранение Docker-образов в облачный реестр

Обычный CI описан в:

```text
.github/workflows/ci.yml
```

Он запускает проверки и сборку frontend/backend.

Для публикации Docker-образов добавлен отдельный workflow:

```text
.github/workflows/cr.yml
```

В нем есть job:

```text
build-and-push
```

Он запускается:

- вручную через `workflow_dispatch`;
- автоматически после успешного workflow `CI` на ветке `main`.

Внутри используется matrix-сборка для двух образов:

| Образ | Dockerfile | Registry |
|---|---|---|
| frontend | `frontend/Dockerfile` | GHCR |
| backend | `backend/Dockerfile` | GHCR |

Workflow логинится в GitHub Container Registry:

```yaml
registry: ghcr.io
```

Потом собирает и отправляет образы с тегами:

- `latest`;
- `sha`.

Итог: после успешного CI свежие Docker-образы сохраняются в облачный реестр GHCR, а Kubernetes потом может скачать их и запустить.

## Как это все связано вместе

Общая цепочка такая:

1. Разработчик пушит код в GitHub.
2. CI проверяет и собирает проект.
3. Workflow `CR` собирает Docker-образы backend/frontend и пушит их в GHCR.
4. В Minikube применяется команда `kubectl apply -f k8s/`.
5. Kubernetes скачивает Docker-образы из GHCR.
6. Deployment запускает backend, frontend и worker.
7. Service дает стабильные внутренние адреса.
8. Ingress открывает приложение, API и Grafana.
9. Prometheus собирает метрики с backend и Kubernetes.
10. Grafana показывает графики.
11. Yandex.Tank создает нагрузку.
12. HPA видит CPU выше 15% и добавляет backend pod.

## Что можно сказать на защите

Мы развернули приложение SuperUART в Kubernetes-кластере Minikube. Приложение состоит из frontend, backend, worker, PostgreSQL и Redis. Для каждого компонента описаны Kubernetes-манифесты: Deployment запускает контейнеры, Service дает им сетевые имена, а Ingress открывает приложение наружу.

Backend запускается из Docker-образа `ghcr.io/webserialsys/superuart/backend:latest`, frontend - из `ghcr.io/webserialsys/superuart/frontend:latest`. Образы хранятся в GitHub Container Registry, а для доступа к ним в Kubernetes создан secret `ghcr-secret`.

Для backend настроен Horizontal Pod Autoscaler. Минимум работает 1 pod, максимум может быть 6 pod. Целевой порог CPU равен 15%. Когда Yandex.Tank создает нагрузку на endpoint `/api/v1/health`, CPU растет, HPA замечает это и создает дополнительные backend pod.

Для мониторинга развернуты Prometheus, kube-state-metrics и Grafana. Backend отдает метрики на `/metrics`, Prometheus их собирает, а Grafana показывает dashboard приложения и dashboard инфраструктуры. В dashboard приложения видно количество запросов, статусы, задержки и активные запросы по каждому pod.

В CI/CD добавлен отдельный workflow для публикации Docker-образов в облачный реестр GHCR. После успешного CI workflow собирает backend и frontend Docker-образы и отправляет их в registry с тегами `latest` и `sha`.

## Команды для демонстрации

Проверить pod:

```bash
kubectl get pods
```

Проверить Service:

```bash
kubectl get svc
```

Проверить Ingress:

```bash
kubectl get ingress superuart
```

Проверить HPA:

```bash
kubectl get hpa backend
kubectl describe hpa backend
```

Смотреть, как появляются новые backend pod:

```bash
kubectl get pods -l app=backend -w
```

Запустить нагрузку:

```bash
kubectl delete job yandex-tank-load --ignore-not-found
kubectl apply -f load/yandex-tank/k8s-job.yaml
kubectl logs -f job/yandex-tank-load
```

Проверить Prometheus:

```bash
kubectl port-forward svc/prometheus 9090:9090
```

Открыть:

```text
http://127.0.0.1:9090/targets
```

Открыть Grafana:

```text
/grafana
```

## Самая простая формулировка

Kubernetes в этой лабораторной - это система, которая запускает наши Docker-контейнеры и управляет ими.

Мы описали приложение в yaml-файлах, применили их через `kubectl apply`, получили запущенные pod, настроили автоматическое увеличение числа backend pod при CPU выше 15%, добавили нагрузочный тест через Yandex.Tank и сделали мониторинг через Prometheus и Grafana.

Отдельно настроили публикацию Docker-образов в GHCR, чтобы Kubernetes мог брать готовые образы из облачного реестра.
