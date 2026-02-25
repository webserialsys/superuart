from fastcrud import FastCRUD

from ..models.host import Host
from ..schemas.host import HostCreateInternal, HostDelete, HostRead, HostUpdate, HostUpdateInternal

CRUDHost = FastCRUD[Host, HostCreateInternal, HostUpdate, HostUpdateInternal, HostDelete, HostRead]
crud_hosts = CRUDHost(Host)
