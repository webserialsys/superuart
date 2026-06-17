# Argo CD GitOps

Эта папка описывает GitOps-слой SuperUART.

## Файлы

| Файл | Назначение |
|---|---|
| `project.yaml` | Ограничивает Argo CD проектом `superuart`: разрешенный Git-репозиторий, namespace `default` и нужные Kubernetes kind'ы |
| `application-superuart.yaml` | Основное приложение Argo CD, которое синхронизирует папку `k8s/` в кластер |
| `root-application.yaml` | Root application для app-of-apps подхода: синхронизирует саму папку `argocd/` |

## Применение

Минимальный вариант для демонстрации:

```bash
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application-superuart.yaml
```

App-of-apps вариант:

```bash
kubectl apply -f argocd/root-application.yaml
```

После применения root application Argo CD сам подтянет `project.yaml` и `application-superuart.yaml` из Git.

## Release flow

Git является source of truth: Argo CD применяет только то состояние, которое записано в Git-манифестах.

Поток релиза:

1. Workflow `CI` проверяет backend/frontend и SonarQube Quality Gate.
2. После успешных проверок `CI` публикует backend/frontend образы в GHCR. Автоматически это происходит на `main`; ручной запуск ожидает branch-ref.
3. Для обоих образов используется общий тег `sha-<short commit SHA>`.
4. `CI` обновляет этот тег в `k8s/deployment.yaml` и `k8s/migrate.yaml`.
5. `CI` коммитит изменение Kubernetes-манифестов обратно в целевую ветку.
6. Argo CD видит новый commit в Git и синхронизирует приложение.

Обновляемые образы:

```text
ghcr.io/webserialsys/superuart/backend:sha-<short-sha>
ghcr.io/webserialsys/superuart/frontend:sha-<short-sha>
```

Один и тот же тег используется для backend и frontend, потому что они собираются как единый релиз из одного commit.

## Проверка

```bash
kubectl get app -n argocd
kubectl describe app superuart -n argocd
kubectl get pods -n default
```

В UI Argo CD приложение `superuart` должно быть `Synced` и `Healthy`.

## Ограничения

- Argo CD Image Updater не используется.
- Новая публикация образа в GHCR без commit в `k8s/` не меняет desired state.
- Auto-commit из GitHub Actions требует `contents: write` для `GITHUB_TOKEN`.
- Ручной release-запуск нужно делать из ветки, потому что workflow коммитит обновленные манифесты обратно в эту же ветку.
- Если целевая ветка защищена и запрещает push от `github-actions[bot]`, коммит манифестов нужно разрешить правилами branch protection или выполнять через отдельный token.
