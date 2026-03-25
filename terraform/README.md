# Terraform for SuperUART

Стартовый конфиг поднимает одну Linux VM в Yandex Cloud:

- VPC network
- subnet
- Ubuntu 22.04 VM
- public IP
- SSH-доступ через локальный публичный ключ

## Файлы

- `versions.tf` - версия Terraform и provider
- `variables.tf` - входные параметры
- `main.tf` - сеть, подсеть, VM
- `outputs.tf` - IP-адреса и SSH-команда
- `terraform.tfvars.example` - пример значений

## Что нужно подготовить

1. Установить Terraform.
2. Создать VM service access в Yandex Cloud и получить:
   - `yc_token`
   - `yc_cloud_id`
   - `yc_folder_id`
3. Убедиться, что у тебя есть SSH-ключ, например `~/.ssh/id_ed25519.pub`.

## Быстрый старт

Скопируй пример переменных:

```powershell
cd terraform
Copy-Item terraform.tfvars.example terraform.tfvars
```

Заполни `terraform.tfvars`, затем выполни:

```powershell
terraform init
terraform plan
terraform apply
```

После успешного применения Terraform выведет:

- имя VM
- внутренний IP
- внешний IP
- готовую SSH-команду

## Удаление ресурсов

```powershell
terraform destroy
```

## Что дальше

Следующий шаг после `terraform apply`:

1. Подключиться по SSH к VM.
2. Добавить `ansible/` и playbook для установки Docker.
3. Затем развернуть приложение через `docker compose`.
