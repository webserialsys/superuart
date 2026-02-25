from fastcrud import FastCRUD

from ..models.session import Session
from ..schemas.session import SessionCreateInternal, SessionDelete, SessionRead, SessionUpdate, SessionUpdateInternal

CRUDSession = FastCRUD[Session, SessionCreateInternal, SessionUpdate, SessionUpdateInternal, SessionDelete, SessionRead]
crud_sessions = CRUDSession(Session)
