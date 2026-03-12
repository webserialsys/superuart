output "instance_name" {
  description = "Created VM name."
  value       = yandex_compute_instance.vm.name
}

output "instance_internal_ip" {
  description = "Internal IP address of the VM."
  value       = yandex_compute_instance.vm.network_interface[0].ip_address
}

output "instance_external_ip" {
  description = "Public IP address of the VM."
  value       = try(yandex_compute_instance.vm.network_interface[0].nat_ip_address, null)
}

output "ssh_command" {
  description = "SSH command for connecting to the VM."
  value       = try("ssh ${var.ssh_user}@${yandex_compute_instance.vm.network_interface[0].nat_ip_address}", null)
}
