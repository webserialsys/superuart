variable "yc_token" {
  description = "OAuth token or IAM token for Yandex Cloud provider authentication."
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

variable "ssh_keys" {
  description = "List of SSH public keys. Each item is rendered as user:key in instance metadata."
  type = list(object({
    user = string
    key  = string
  }))
  default = []
}
