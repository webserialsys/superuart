from fastcrud import FastCRUD

from ..models.device import Device
from ..schemas.device import DeviceCreateInternal, DeviceDelete, DeviceRead, DeviceUpdate, DeviceUpdateInternal

CRUDDevice = FastCRUD[Device, DeviceCreateInternal, DeviceUpdate, DeviceUpdateInternal, DeviceDelete, DeviceRead]
crud_devices = CRUDDevice(Device)
