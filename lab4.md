# Лабораторная работа 4: SonarQube, Quality Gate, Argo CD и Telegram

## Что добавлено

В четвертой лабораторной к уже готовому приложению SuperUART добавлены:

- статический анализ кода через SonarQube;
- проверка Quality Gate в CI;
- требование к покрытию тестами не ниже 80%;
- непрерывная доставка Kubernetes-манифестов через Argo CD;
- уведомления о статусе CI/CD jobs в Telegram.

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

Приложение Argo CD описано в:

```text
argocd/application.yaml
```

Применить его:

```bash
kubectl apply -f argocd/application.yaml
```

После этого Argo CD следит за папкой `k8s/` в репозитории и синхронизирует Kubernetes-манифесты в кластер.

## Docker Registry

Публикация Docker-образов уже вынесена в отдельный workflow:

```text
.github/workflows/cr.yml
```

Он собирает и отправляет в GHCR два образа:

```text
ghcr.io/webserialsys/superuart/backend
ghcr.io/webserialsys/superuart/frontend
```

Kubernetes использует эти образы в `k8s/deployment.yaml`, а Argo CD применяет актуальные манифесты из Git.

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
5. Открыть Argo CD и показать Application `superuart`.
6. Показать синхронизацию папки `k8s/`.
7. Показать сообщение Telegram bot со статусом workflow.
