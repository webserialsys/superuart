variable "yc_token" {
  description = "IAM token or OAuth token for Yandex Cloud."
  type        = string
  sensitive   = true
}

variable "yc_cloud_id" {
  description = "Yandex Cloud cloud ID."
  type        = string
}

variable "yc_folder_id" {
  description = "Yandex Cloud folder ID."
  type        = string
}

variable "yc_zone" {
  description = "Availability zone for the VM."
  type        = string
  default     = "ru-central1-a"
}

variable "network_name" {
  description = "Virtual network name."
  type        = string
  default     = "superuart-network"
}

variable "subnet_name" {
  description = "Subnet name."
  type        = string
  default     = "superuart-subnet"
}

variable "subnet_cidr_blocks" {
  description = "CIDR blocks for the subnet."
  type        = list(string)
  default     = ["10.10.0.0/24"]
}

variable "vm_name" {
  description = "VM instance name."
  type        = string
  default     = "superuart-vm"
}

variable "vm_hostname" {
  description = "Hostname inside the VM."
  type        = string
  default     = "superuart"
}

variable "vm_platform_id" {
  description = "Yandex Cloud compute platform."
  type        = string
  default     = "standard-v3"
}

variable "vm_cores" {
  description = "Number of vCPU cores."
  type        = number
  default     = 2
}

variable "vm_memory" {
  description = "RAM in GB."
  type        = number
  default     = 2
}

variable "vm_core_fraction" {
  description = "Guaranteed CPU fraction."
  type        = number
  default     = 20
}

variable "boot_disk_size_gb" {
  description = "Boot disk size in GB."
  type        = number
  default     = 20
}

variable "boot_disk_type" {
  description = "Boot disk type."
  type        = string
  default     = "network-hdd"
}

variable "image_family" {
  description = "Image family for boot disk."
  type        = string
  default     = "ubuntu-2204-lts"
}

variable "ssh_user" {
  description = "Linux user for SSH."
  type        = string
  default     = "ubuntu"
}

variable "ssh_public_key_path" {
  description = "Path to the local SSH public key."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "enable_nat" {
  description = "Attach a public IP to the VM."
  type        = bool
  default     = true
}
