from fastapi import APIRouter

from .access import router as access_router
from .devices import router as devices_router
from .health import router as health_router
from .hosts import router as hosts_router
from .login import router as login_router
from .logout import router as logout_router
from .sessions import router as sessions_router
from .tasks import router as tasks_router
from .users import router as users_router
from .ws_uart_mock import router as ws_uart_mock_router

router = APIRouter(prefix="/v1")
router.include_router(health_router)
router.include_router(login_router)
router.include_router(logout_router)
router.include_router(users_router)
router.include_router(tasks_router)
router.include_router(devices_router)
router.include_router(hosts_router)
router.include_router(sessions_router)
router.include_router(access_router)
router.include_router(ws_uart_mock_router)
