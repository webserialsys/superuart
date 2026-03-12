data "yandex_compute_image" "ubuntu" {
  family = var.image_family
}

resource "yandex_vpc_network" "main" {
  name = var.network_name
}

resource "yandex_vpc_subnet" "main" {
  name           = var.subnet_name
  zone           = var.yc_zone
  network_id     = yandex_vpc_network.main.id
  v4_cidr_blocks = var.subnet_cidr_blocks
}

resource "yandex_compute_instance" "vm" {
  name        = var.vm_name
  hostname    = var.vm_hostname
  platform_id = var.vm_platform_id

  resources {
    cores         = var.vm_cores
    memory        = var.vm_memory
    core_fraction = var.vm_core_fraction
  }

  boot_disk {
    initialize_params {
      image_id = data.yandex_compute_image.ubuntu.id
      size     = var.boot_disk_size_gb
      type     = var.boot_disk_type
    }
  }

  network_interface {
    subnet_id = yandex_vpc_subnet.main.id
    nat       = var.enable_nat
  }

  metadata = {
    ssh-keys = "${var.ssh_user}:${file(pathexpand(var.ssh_public_key_path))}"
  }
}
