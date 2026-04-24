import os
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    __package__ = "src.app"

from .api import router
from .core.config import settings
from .core.setup import create_application, lifespan_factory


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Custom lifespan that includes admin initialization."""
    # Get the default lifespan
    default_lifespan = lifespan_factory(settings, create_tables_on_start=False)

    # Run the default lifespan initialization and our admin initialization
    async with default_lifespan(app):
        yield


app = create_application(router=router, settings=settings, lifespan=lifespan)
