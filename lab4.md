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

1. Создать проект `superuart`.
2. Создать token для GitHub Actions.
3. Добавить в GitHub Secrets:
   - `SONAR_TOKEN`;
   - `SONAR_HOST_URL`, например `http://<vm-ip>:9000`.

Конфигурация анализа лежит в `sonar-project.properties`.

## Quality Gate

В SonarQube нужно создать Quality Gate для проекта `superuart`.

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
| `Backend build` | Собирает backend package |
| `Frontend test` | Запускает Vitest и создает `lcov.info` |
| `Frontend build` | Собирает Next.js frontend |
| `SonarQube` | Отправляет анализ в SonarQube и проверяет Quality Gate |
| `Telegram notification` | Отправляет статус workflow в Telegram |

Роль CI: проверить backend/frontend, собрать приложение и подтвердить качество кода через SonarQube. CI не разворачивает приложение в Kubernetes.

## Docker Registry и GitOps release

Публикация Docker-образов выполняется в workflow:

```text
.github/workflows/ci.yml
```

После успешных проверок `CI` на ветке `main` или при ручном запуске `workflow_dispatch` из ветки вычисляется общий тег релиза `sha-<short commit SHA>`.
С этим тегом workflow собирает и отправляет в GHCR два образа:

```text
ghcr.io/webserialsys/superuart/backend:sha-<short-sha>
ghcr.io/webserialsys/superuart/frontend:sha-<short-sha>
```

После публикации образов `CI` обновляет image tags в `k8s/deployment.yaml` и `k8s/migrate.yaml`, коммитит эти изменения обратно в Git и пушит в целевую ветку.
Workflow не применяет Kubernetes-манифесты и не обращается к кластеру.

## Argo CD

Argo CD устанавливается в Kubernetes-кластер:

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl rollout status deployment/argocd-server -n argocd
```

Открыть UI локально:

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Адрес:

```text
https://127.0.0.1:8080
```

Получить стартовый пароль:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
```

GitOps-конфигурация Argo CD разнесена на несколько файлов:

```text
argocd/project.yaml
argocd/application-superuart.yaml
argocd/root-application.yaml
```

Назначение файлов:

| Файл | Назначение |
|---|---|
| `argocd/project.yaml` | `AppProject`, который явно разрешает репозиторий `https://github.com/webserialsys/superuart.git`, namespace `default` и нужные Kubernetes ресурсы |
| `argocd/application-superuart.yaml` | `Application`, который следит за папкой `k8s/` и синхронизирует приложение в кластер |
| `argocd/root-application.yaml` | Root application для app-of-apps подхода: следит за папкой `argocd/` и применяет Argo CD объекты из Git |

Минимальный вариант применения:

```bash
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application-superuart.yaml
```

Вариант app-of-apps:

```bash
kubectl apply -f argocd/root-application.yaml
```

После применения root application Argo CD следит за папкой `argocd/`, создает проект и дочернее приложение `superuart`.
Дочернее приложение `superuart` следит за папкой `k8s/` в Git-репозитории и синхронизирует Kubernetes-манифесты в namespace `default`.

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
| CI | Проверяет код, запускает тесты, формирует coverage-отчеты и проверяет Quality Gate в SonarQube |
| CI release jobs | Собирают и публикуют backend/frontend образы в GHCR, затем обновляют image tags в `k8s/` и коммитят изменения |
| Argo CD | Следит за Git-репозиторием и применяет Kubernetes-манифесты из `k8s/` в кластер |

Ключевая идея GitOps: кластер приводится к состоянию, описанному в Git. Для изменения деплоя нужно изменить манифесты в репозитории, после чего Argo CD увидит расхождение и синхронизирует кластер.

Argo CD Image Updater в работе не используется.

## Image tags

В `k8s/deployment.yaml` и `k8s/migrate.yaml` используются явные SHA-теги:

```text
ghcr.io/webserialsys/superuart/backend:sha-<short-sha>
ghcr.io/webserialsys/superuart/frontend:sha-<short-sha>
```

Один тег используется для backend и frontend, потому что оба образа собираются из одного commit и образуют один релиз.
Это делает Git источником истины: новая версия попадает в кластер только после того, как workflow закоммитил новый тег в Kubernetes-манифесты.

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

1. Открыть GitHub Actions и показать jobs `Backend test`, `Frontend test`, `SonarQube`.
2. Открыть SonarQube и показать проект `superuart`.
3. Показать Quality Gate с coverage `>= 80%`.
4. Показать, что при провале Quality Gate CI завершается ошибкой.
5. Открыть release jobs внутри workflow `CI` и показать публикацию образов в GHCR.
6. Открыть Argo CD и показать Application `superuart-root`.
7. Открыть Argo CD и показать Application `superuart`.
8. В `superuart` показать source path `k8s/`, auto sync, prune и self-heal.
9. Показать, что ручное изменение ресурса в кластере Argo CD возвращает к состоянию из Git.
10. Показать сообщение Telegram bot со статусом workflow.
