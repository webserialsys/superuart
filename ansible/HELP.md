# Ansible Help

## Go to directory

```bash
cd ansible
```

## Check SSH access

```bash
ansible -i inventory.ini myhosts -m ping
```

`inventory.ini` already contains `StrictHostKeyChecking=accept-new`, so the first connection will add the host key automatically.

You can use `inventory.yml` as well:

```bash
ansible -i inventory.yml myhosts -m ping
```

You can also target the host directly:

```bash
ansible -i inventory.yml vm-1 -m ping
```

## Check SSH access with key

```bash
ansible -i inventory.ini myhosts -m ping --private-key ~/.ssh/id_ed25519
```

## Install Docker on VM

```bash
ansible-playbook -i inventory.ini docker-playbook.yml
```

Or with YAML inventory:

```bash
ansible-playbook -i inventory.yml docker-playbook.yml
```

## Install Docker on VM with SSH key

```bash
ansible-playbook -i inventory.ini docker-playbook.yml --private-key ~/.ssh/id_ed25519
```

## Run with explicit remote user

```bash
ansible-playbook -i inventory.ini docker-playbook.yml -u ubuntu
```

## Check Docker after install

```bash
ansible -i inventory.ini myhosts -a "docker --version"
ansible -i inventory.ini myhosts -a "docker compose version"
ansible -i inventory.ini myhosts -a "sudo systemctl status docker --no-pager"
```

## Inventory

- `inventory.ini` is an INI inventory for quick CLI usage
- `inventory.yml` is a valid YAML inventory with the same host settings

## Playbooks

- `docker-playbook.yml` installs Docker Engine and Docker Compose plugin
