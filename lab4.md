# Лабораторная работа 4: SonarQube, Quality Gate, Argo CD и Telegram

## Что добавлено

В четвертой лабораторной к уже готовому приложению SuperUART добавлены:

- статический анализ кода через SonarQube;
- проверка Quality Gate в CI;
- требование к покрытию тестами не ниже 80%;
- непрерывная доставка Kubernetes-манифестов через Argo CD;
- уведомления о статусе CI/CD jobs в Telegram.

Логика coverage в этой лабораторной не дорабатывалась: CI только генерирует отчеты и передает их в SonarQube, а порог `80%` задается в Quality Gate.

## SonarQube

SonarQube можно поднять на той же виртуальной машине, где выполнялись инфраструктурные лабораторные:

```bash
cd sonarqube
docker compose up -d
```

После запуска веб-интерфейс доступен на порту:

```text
http://<vm-ip>:9000
```

Первый вход:

```text
admin / admin
```

После входа нужно:

1. Создать проекты `superuart-backend` и `superuart-frontend` либо выдать token с правом создавать проекты при первом сканировании.
2. Создать token для GitHub Actions.
3. Добавить в GitHub Secrets:
   - `SONAR_TOKEN`;
   - `SONAR_HOST_URL`, например `http://<vm-ip>:9000`.

Конфигурация анализа лежит в `sonar-project.properties`.

## Quality Gate

В SonarQube нужно создать Quality Gate для проектов `superuart-backend` и `superuart-frontend`.

Минимальные правила:

| Условие | Значение |
|---|---|
| Coverage | `>= 80%` |
| Bugs | `0` |
| Vulnerabilities | `0` |
| Security Hotspots Reviewed | `100%` |

Если Quality Gate не пройден, job `SonarQube` в GitHub Actions завершается ошибкой, а весь CI считается неуспешным.

## Coverage

Backend генерирует отчет:

```text
backend/coverage.xml
```

Frontend генерирует отчет:

```text
frontend/coverage/lcov.info
```

Эти файлы передаются в SonarQube из workflow `.github/workflows/ci.yml`.

## CI

Workflow `CI` теперь состоит из отдельных jobs:

| Job | Что делает |
|---|---|
| `Backend test` | Запускает backend unit tests и создает `coverage.xml` |
| `SonarQube backend` | Отправляет backend-анализ в SonarQube и проверяет Quality Gate |
| `Backend build` | Собирает backend package |
| `Frontend test` | Запускает Vitest и создает `lcov.info` |
| `SonarQube frontend` | Отправляет frontend-анализ в SonarQube и проверяет Quality Gate |
| `Frontend build` | Собирает Next.js frontend |
| `Docker build backend` | На push тега собирает и публикует backend image в GHCR |
| `Docker build frontend` | На push тега собирает и публикует frontend image в GHCR |
| `Telegram notification` | Отправляет статус workflow в Telegram |

Роль CI: проверить backend/frontend, собрать приложение и подтвердить качество кода через SonarQube. CI не разворачивает приложение в Kubernetes.

Порядок jobs:

```text
backend-test
  -> sonar-backend
    -> backend-build
      -> frontend-test
        -> sonar-frontend
          -> frontend-build

backend-build -> docker-build-backend   # only tag push
frontend-build -> docker-build-frontend # only tag push

all jobs -> notify
```

## Docker Registry

Публикация Docker-образов выполняется в workflow:

```text
.github/workflows/ci.yml
```

Docker jobs запускаются только на push Git tag. Тег Docker image совпадает с Git tag:

```text
ghcr.io/webserialsys/superuart/backend:<git-tag>
ghcr.io/webserialsys/superuart/frontend:<git-tag>
```

Workflow не применяет Kubernetes-манифесты и не обращается к кластеру.

## Argo CD

Краткая последовательность команд для запуска в Minikube:

### 1. Поднять Minikube

```bash
minikube delete
minikube start --driver=kvm2 --cpus=6 --memory=8192 --disk-size=15g
minikube addons enable ingress
minikube addons enable metrics-server
```

### 2. Создать secret для приватных образов GHCR

```bash
export GHCR_USERNAME="<github-username>"
export GHCR_TOKEN="<github-token-with-read-packages>"
```

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USERNAME" \
  --docker-password="$GHCR_TOKEN"
```

### 3. Установить Argo CD в кластер

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl rollout status deployment/argocd-server -n argocd
kubectl rollout status deployment/argocd-repo-server -n argocd
kubectl rollout status deployment/argocd-application-controller -n argocd
kubectl rollout status deployment/argocd-applicationset-controller -n argocd
```

### 4. Подключить GitOps-манифесты проекта

Для app-of-apps варианта:

```bash
kubectl apply -f argocd/root-application.yaml
```

Минимальный вариант без root application:

```bash
kubectl apply -f argocd/cmd-params.yaml
kubectl apply -f argocd/ingress.yaml
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application-superuart.yaml
kubectl rollout restart deployment/argocd-server -n argocd
kubectl rollout status deployment/argocd-server -n argocd
```

После этого `kubectl apply -f k8s/` делать не нужно: Argo CD сам подтянет папку `k8s/` из Git.
Для варианта с `root-application.yaml` перезапуск `argocd-server` нужно делать после того, как root application применит `cmd-params.yaml`.

### 5. Проверить, что Argo CD поднялся и синхронизировал приложение

```bash
kubectl get pods -n argocd
kubectl get applications.argoproj.io -n argocd
kubectl describe application superuart-root -n argocd
kubectl describe application superuart -n argocd
kubectl get pods -n default
kubectl get svc -n default
```

Если использовался `argocd/root-application.yaml`, после первой синхронизации перезапустите `argocd-server`:

```bash
kubectl rollout restart deployment/argocd-server -n argocd
kubectl rollout status deployment/argocd-server -n argocd
```

### 6. Открыть UI через Ingress

```bash
kubectl get ingress -n argocd argocd-server
```

Адрес:

```text
http://$(minikube ip)/argocd
```

Получить стартовый пароль:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
```

Если приложение не появилось сразу, обычно достаточно подождать несколько секунд и повторить:

```bash
kubectl get applications.argoproj.io -n argocd
kubectl get pods -n argocd
```

GitOps-конфигурация Argo CD разнесена на несколько файлов:

```text
argocd/cmd-params.yaml
argocd/ingress.yaml
argocd/project.yaml
argocd/application-superuart.yaml
argocd/root-application.yaml
```

Назначение файлов:

| Файл | Назначение |
|---|---|
| `argocd/cmd-params.yaml` | Переводит `argocd-server` в insecure mode и настраивает работу UI под префиксом `/argocd` |
| `argocd/ingress.yaml` | Отдельный `Ingress` в namespace `argocd`, который публикует Argo CD UI по пути `/argocd` |
| `argocd/project.yaml` | `AppProject`, который явно разрешает репозиторий `https://github.com/webserialsys/superuart.git`, namespace `default` и нужные Kubernetes ресурсы |
| `argocd/application-superuart.yaml` | `Application`, который следит за папкой `k8s/` и синхронизирует приложение в кластер |
| `argocd/root-application.yaml` | Root application для app-of-apps подхода: следит за папкой `argocd/` и применяет Argo CD объекты из Git |

Минимальный вариант применения:

```bash
kubectl apply -f argocd/cmd-params.yaml
kubectl apply -f argocd/ingress.yaml
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application-superuart.yaml
kubectl rollout restart deployment/argocd-server -n argocd
```

Вариант app-of-apps:

```bash
kubectl apply -f argocd/root-application.yaml
```

После применения root application Argo CD следит за папкой `argocd/`, создает ingress и дочернее приложение `superuart`.
Дочернее приложение `superuart` следит за папкой `k8s/` в Git-репозитории и синхронизирует Kubernetes-манифесты в namespace `default`.
После первой синхронизации root application нужно один раз перезапустить `argocd-server`, чтобы он подхватил `cmd-params.yaml`.

В `application-superuart.yaml` включена автоматическая синхронизация:

```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=true
    - ApplyOutOfSyncOnly=true
```

- `selfHeal: true` возвращает ресурсы к состоянию из Git, если их поменяли руками в кластере.
- `prune: true` удаляет из кластера ресурсы, которые были удалены из Git.
- `CreateNamespace=true` оставлен как безопасная опция для создания namespace назначения, если он отсутствует.

Проверить синхронизацию:

```bash
kubectl get app -n argocd
kubectl describe app superuart -n argocd
kubectl get pods -n default
kubectl get svc -n default
```

Через Argo CD CLI:

```bash
argocd app get superuart
argocd app sync superuart
```

Ожидаемое состояние в UI Argo CD:

```text
superuart: Synced / Healthy
superuart-root: Synced / Healthy
```

## GitOps-модель деплоя

В этой схеме роли разделены:

| Компонент | Роль |
|---|---|
| CI | Последовательно проверяет backend/frontend, запускает SonarQube jobs и собирает приложение |
| Docker jobs | На push Git tag собирают и публикуют backend/frontend образы в GHCR |
| Argo CD | Следит за Git-репозиторием и применяет Kubernetes-манифесты из `k8s/` в кластер |

Ключевая идея GitOps: кластер приводится к состоянию, описанному в Git. Для изменения деплоя нужно изменить манифесты в репозитории, после чего Argo CD увидит расхождение и синхронизирует кластер.

Argo CD Image Updater в работе не используется.

## Image tags

В `k8s/deployment.yaml` и `k8s/migrate.yaml` используются явные теги образов:

```text
ghcr.io/webserialsys/superuart/backend:<tag>
ghcr.io/webserialsys/superuart/frontend:<tag>
```

Docker jobs публикуют образы с Git tag. Чтобы новая версия стала desired state для Argo CD, такой тег должен быть записан в Kubernetes-манифесты и закоммичен в Git.

Если образ опубликован в GHCR, но `k8s/` не изменился, Argo CD не считает это новым desired state.

## Telegram

Нужно создать бота через BotFather и добавить в GitHub Secrets:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

После этого workflow отправляет сообщение со статусом:

- branch;
- commit;
- success/failure/cancelled;
- ссылка на GitHub Actions run.

## Что показать на защите

1. Открыть GitHub Actions и показать цепочку jobs `Backend test`, `SonarQube backend`, `Backend build`, `Frontend test`, `SonarQube frontend`, `Frontend build`.
2. Открыть SonarQube и показать проект `superuart`.
3. Показать Quality Gate с coverage `>= 80%`.
4. Показать, что при провале Quality Gate CI завершается ошибкой.
5. Сделать push Git tag и показать jobs `Docker build backend` и `Docker build frontend`.
6. Открыть Argo CD и показать Application `superuart-root`.
7. Открыть Argo CD и показать Application `superuart`.
8. В `superuart` показать source path `k8s/`, auto sync, prune и self-heal.
9. Показать, что ручное изменение ресурса в кластере Argo CD возвращает к состоянию из Git.
10. Показать сообщение Telegram bot со статусом workflow.
