import asyncio
import contextlib
import random
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/ws", tags=["ws-mock"])


@router.websocket("/uart/{device_uuid}")
async def mock_uart(websocket: WebSocket, device_uuid: str) -> None:
    await websocket.accept()
    await websocket.send_text(f"Connected to mock UART: {device_uuid}\r\n")
    await websocket.send_text("Mock stream started. Type in terminal to test echo.\r\n")

    async def producer() -> None:
        counter = 0
        while True:
            counter += 1
            voltage = 3.20 + random.random() * 0.15
            temperature = 24.0 + random.random() * 3.0
            timestamp = datetime.now().strftime("%H:%M:%S")
            await websocket.send_text(
                f"[{timestamp}] seq={counter} V={voltage:.2f}V T={temperature:.1f}C\r\n",
            )
            await asyncio.sleep(1)

    producer_task = asyncio.create_task(producer())

    try:
        while True:
            payload = await websocket.receive_text()
            await websocket.send_text(f"echo> {payload}\r\n")
    except WebSocketDisconnect:
        pass
    finally:
        producer_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await producer_task
