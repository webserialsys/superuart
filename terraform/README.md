# Terraform template for Yandex Cloud

This directory contains a minimal Terraform template for creating a VM in Yandex Cloud.

## What is included

- Yandex provider configuration
- VPC network and subnet
- Single VM with configurable resources
- Support for multiple SSH public keys via `metadata.ssh-keys`
- Outputs for instance ID and IP addresses

The template intentionally keeps only the required input variables:

- `yc_token`
- `yc_cloud_id`
- `yc_folder_id`
- `vm_image_id`
- `ssh_keys`

## Local usage

1. Copy `terraform.tfvars.example` to `terraform.tfvars`.
2. Fill in `yc_token`, `yc_cloud_id`, `yc_folder_id`, and `vm_image_id`.
3. Update `ssh_keys` with one or more public keys.
4. Run:

```bash
terraform init
terraform plan
terraform apply
```

## GitHub Actions usage

Recommended split:

- GitHub Secrets:
  - `YC_TOKEN`
- GitHub Variables:
  - `YC_CLOUD_ID`
  - `YC_FOLDER_ID`
  - `YC_VM_IMAGE_ID`
  - `TF_SSH_KEYS`

`TF_SSH_KEYS` should be stored as JSON:

```json
[
  {
    "user": "ubuntu",
    "key": "ssh-ed25519 AAAAC3Nza... user1@laptop"
  },
  {
    "user": "ubuntu",
    "key": "ssh-ed25519 AAAAC3Nza... user2@work"
  }
]
```

In GitHub Actions this value is mapped to `TF_VAR_ssh_keys`, and Terraform will deserialize the JSON automatically.
