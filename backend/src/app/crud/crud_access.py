from fastcrud import FastCRUD

from ..models.access import Access
from ..schemas.access import AccessCreateInternal, AccessRead, AccessUpdate, AccessUpdateInternal

CRUDAccess = FastCRUD[
    Access, AccessCreateInternal, AccessUpdate, AccessUpdateInternal, AccessUpdateInternal, AccessRead
]
crud_access = CRUDAccess(Access)
