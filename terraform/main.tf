provider "yandex" {
  token     = var.yc_token
  cloud_id  = var.yc_cloud_id
  folder_id = var.yc_folder_id
  zone      = "ru-central1-d"
}

resource "yandex_vpc_network" "main" {
  name = "superuart-network"
}

resource "yandex_vpc_subnet" "main" {
  name           = "superuart-subnet"
  zone           = "ru-central1-d"
  network_id     = yandex_vpc_network.main.id
  v4_cidr_blocks = ["192.168.10.0/24"]
}

resource "yandex_compute_instance" "vm" {
  service_account_id        = "ajef6r4clgqrjv36s9pf"

  name                      = "superuart-vm"
  hostname                  = "superuart-vm"
  zone                      = "ru-central1-d"
  platform_id               = "standard-v3"
  allow_stopping_for_update = true

  resources {
    cores  = 2
    memory = 2
  }

  boot_disk {
    initialize_params {
      image_id = "fd8jjccig145ofgp5b9u"
      size     = 20
      type     = "network-ssd"
    }
  }

  network_interface {
    subnet_id = yandex_vpc_subnet.main.id
    nat       = true
  }

  scheduling_policy {
    preemptible = false
  }

  metadata = merge(
    {
      "serial-port-enable" = "1"
    },
    length(var.ssh_keys) == 0 ? {} : {
      "ssh-keys" = join("\n", [
        for item in var.ssh_keys : "${item.user}:${trimspace(item.key)}"
      ])
    }
  )
}
