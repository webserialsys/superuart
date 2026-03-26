output "instance_id" {
  description = "Yandex Compute instance ID."
  value       = yandex_compute_instance.vm.id
}

output "instance_name" {
  description = "Virtual machine name."
  value       = yandex_compute_instance.vm.name
}

output "internal_ip_address" {
  description = "Private IPv4 address."
  value       = yandex_compute_instance.vm.network_interface[0].ip_address
}

output "external_ip_address" {
  description = "Public IPv4 address."
  value       = yandex_compute_instance.vm.network_interface[0].nat_ip_address
}

output "ssh_keys_metadata" {
  description = "Rendered ssh-keys metadata string."
  value = join("\n", [
    for item in var.ssh_keys : "${item.user}:${trimspace(item.key)}"
  ])
  sensitive   = true
}
