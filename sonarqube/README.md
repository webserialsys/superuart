# Локальная проверка SonarQube

Для повторения анализа нужны Docker Compose с поддержкой `!override` и Node.js 22.12+.
Версия сервера закреплена в `docker-compose.yml`: SonarQube Community 10.7.

Из корня репозитория:

```bash
docker compose -p superuart-sonar-local \
  -f sonarqube/docker-compose.yml \
  -f sonarqube/docker-compose.local.yml up -d
```

Интерфейс: <http://127.0.0.1:9000>. Отдельный Compose project сохраняет данные локального анализа в собственных Docker volumes; порт доступен только на этом компьютере.

При первом запуске войдите как `admin` / `admin`, смените пароль и создайте токен анализа в My Account → Security. Создайте публичный проект с ключом `superuart-frontend` и названием `SuperUART Frontend`.

Затем из папки `frontend`:

```bash
bun install --frozen-lockfile
bun run test:coverage
export SONAR_HOST_URL=http://127.0.0.1:9000
# Задайте SONAR_TOKEN в окружении; не сохраняйте токен в Git.
npx --yes --package=@sonar/scan@5.0.0 sonar-scanner-npm
```

Для тестов используйте Node.js 22, как в Docker-образе frontend. Настройки анализа берутся из `frontend/sonar-project.properties`, покрытие — из `frontend/coverage/lcov.info`.

Отчёт: <http://127.0.0.1:9000/dashboard?id=superuart-frontend>.
Для поиска всех замечаний Reliability учитывайте `impacts.softwareQuality=RELIABILITY`: в этой версии SonarQube часть таких замечаний имеет старый тип `CODE_SMELL`, поэтому фильтр только по `BUG` покажет неполный список.

## Проверка 7 сентября 2026

Анализ выполнен на исходном и исправленном frontend с одним сервером, стандартным профилем правил и отчётами покрытия от Vitest. Правила и исключения анализа для исправления оценки не менялись.

| Метрика | До | После |
|---|---:|---:|
| Замечания с влиянием на Reliability | 10 | 0 |
| Reliability rating | C | A |
| Bugs (старый тип) | 3 | 0 |
| Coverage в SonarQube | 80,4% | 80,5% |
| Duplications | 13,7% | 13,6% |

Исправлены подписи переключателей устройств, семантика выбора роли, явная передача содержимого заголовкам и таблицам, связь Label с полем и обработчики модального окна. Проверены 68 тестов frontend и проверка типов TypeScript.

Стандартный Quality Gate локального сервера пройден. Для требований лабораторной отдельно назначьте проекту Quality Gate с **общим Coverage ≥ 80%**, Bugs = 0 и Vulnerabilities = 0 по инструкции `lab4.md`: стандартный Gate не заменяет эту настройку.

## Остановка

```bash
docker compose -p superuart-sonar-local \
  -f sonarqube/docker-compose.yml \
  -f sonarqube/docker-compose.local.yml stop
```

Volumes и отчёты сохранятся. GitHub Actions должен обращаться к серверу, доступному с runner; адрес `127.0.0.1:9000` относится только к локальному запуску.
