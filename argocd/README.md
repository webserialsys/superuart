# Argo CD GitOps

Эта папка описывает GitOps-слой SuperUART.

## Файлы

| Файл | Назначение |
|---|---|
| `cmd-params.yaml` | Настраивает `argocd-server` на insecure mode и работу под префиксом `/argocd` |
| `ingress.yaml` | Публикует Argo CD UI через `Ingress` по пути `/argocd` |
| `project.yaml` | Ограничивает Argo CD проектом `superuart`: разрешенный Git-репозиторий, namespace `default` и нужные Kubernetes kind'ы |
| `application-superuart.yaml` | Основное приложение Argo CD, которое синхронизирует папку `k8s/` в кластер |
| `root-application.yaml` | Root application для app-of-apps подхода: синхронизирует саму папку `argocd/` |

## Применение

Минимальный вариант для демонстрации:

```bash
kubectl apply -f argocd/cmd-params.yaml
kubectl apply -f argocd/ingress.yaml
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application-superuart.yaml
kubectl rollout restart deployment/argocd-server -n argocd
```

App-of-apps вариант:

```bash
kubectl apply -f argocd/root-application.yaml
```

После применения root application Argo CD сам подтянет `cmd-params.yaml`, `ingress.yaml`, `project.yaml` и `application-superuart.yaml` из Git.
После первой синхронизации root application один раз перезапустите `argocd-server`, чтобы он подхватил `cmd-params.yaml`:

```bash
kubectl rollout restart deployment/argocd-server -n argocd
kubectl rollout status deployment/argocd-server -n argocd
```

UI будет доступен через ingress:

```text
http://$(minikube ip)/argocd
```

## Release flow

Git является source of truth: Argo CD применяет только то состояние, которое записано в Git-манифестах.

Поток проверки и публикации:

1. `backend-test` запускает backend tests и формирует `backend/coverage.xml`.
2. `sonar-backend` отправляет backend-анализ в SonarQube и проверяет Quality Gate.
3. `backend-build` собирает backend package.
4. `frontend-test` запускает frontend tests и формирует `frontend/coverage/lcov.info`.
5. `sonar-frontend` отправляет frontend-анализ в SonarQube и проверяет Quality Gate.
6. `frontend-build` собирает frontend.
7. При push тега `docker-build-backend` публикует backend image в GHCR.
8. При push тега `docker-build-frontend` публикует frontend image в GHCR.
9. `notify` отправляет общий статус workflow.

Docker images публикуются только на tag push. Тег Docker image совпадает с Git tag:

```text
ghcr.io/webserialsys/superuart/backend:<git-tag>
ghcr.io/webserialsys/superuart/frontend:<git-tag>
```

Argo CD не следит за registry. Чтобы новая версия стала desired state, image tag должен быть записан в `k8s/deployment.yaml` и `k8s/migrate.yaml` и закоммичен в Git.

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
- Docker images публикуются только при push Git tag.
- Argo CD Image Updater не используется, поэтому registry сам не меняет Kubernetes-манифесты.
