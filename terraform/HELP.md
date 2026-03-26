# Terraform Help

## Go to directory

```bash
cd terraform
```

## Check formatting

```bash
terraform fmt -check
```

## Format files

```bash
terraform fmt
```

## Initialize provider and modules

```bash
terraform init
```

## Validate configuration

```bash
terraform validate
```

## Show execution plan

```bash
terraform plan
```

## Apply changes

```bash
terraform apply
```

## Show outputs

```bash
terraform output
```

## Show static public IP only

```bash
terraform output external_ip_address
```

## Destroy infrastructure

```bash
terraform destroy
```

## If you use local tfvars

```bash
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

## If you use environment variables

```bash
export TF_VAR_yc_token="..."
export TF_VAR_yc_cloud_id="..."
export TF_VAR_yc_folder_id="..."
export TF_VAR_ssh_keys='[{"user":"ubuntu","key":"ssh-ed25519 AAAA... user@host"}]'
terraform plan
```

## Run from GitHub Actions

- Workflow file: `.github/workflows/tf.yml`
- Open `Actions -> Terraform YC`
- Choose `plan` or `apply`

## Useful files

- `main.tf` - VM, subnet, network, static IP
- `outputs.tf` - instance and IP outputs
- `variables.tf` - input variables
- `terraform.tfvars` - local values, do not commit
