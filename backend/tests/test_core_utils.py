import json
from unittest.mock import AsyncMock, Mock

import pytest

from src.app.core import health as health_module
from src.app.core.exceptions.cache_exceptions import (
    CacheIdentificationInferenceError,
    InvalidRequestError,
    MissingClientError,
)
from src.app.core.utils import cache as cache_module


@pytest.mark.asyncio
async def test_check_database_health_success(mock_db):
    mock_db.execute = AsyncMock(return_value=object())

    assert await health_module.check_database_health(mock_db) is True


@pytest.mark.asyncio
async def test_check_database_health_failure(mock_db):
    mock_db.execute = AsyncMock(side_effect=RuntimeError("db down"))

    assert await health_module.check_database_health(mock_db) is False


@pytest.mark.asyncio
async def test_check_redis_health_success(mock_redis):
    mock_redis.ping = AsyncMock(return_value=True)

    assert await health_module.check_redis_health(mock_redis) is True


@pytest.mark.asyncio
async def test_check_redis_health_failure(mock_redis):
    mock_redis.ping = AsyncMock(side_effect=RuntimeError("redis down"))

    assert await health_module.check_redis_health(mock_redis) is False


def test_infer_resource_id_for_int():
    result = cache_module._infer_resource_id({"user_id": 10, "slug": "abc"}, int)

    assert result == 10


def test_infer_resource_id_for_str():
    result = cache_module._infer_resource_id({"slug": "abc", "count": 2}, str)

    assert result == "abc"


def test_infer_resource_id_raises_for_missing_value():
    with pytest.raises(CacheIdentificationInferenceError):
        cache_module._infer_resource_id({"user": 10}, int)


def test_extract_data_inside_brackets():
    assert cache_module._extract_data_inside_brackets("users/{user_id}/items/{item_id}") == ["user_id", "item_id"]


def test_construct_data_dict():
    result = cache_module._construct_data_dict(["user_id", "item_id"], {"user_id": 7, "item_id": 11, "x": 1})

    assert result == {"user_id": 7, "item_id": 11}


def test_format_prefix_and_extra_data():
    prefix = cache_module._format_prefix("users_{user_id}_items", {"user_id": 5})
    extra = cache_module._format_extra_data({"users_{user_id}": "{item_id}"}, {"user_id": 5, "item_id": 9})

    assert prefix == "users_5_items"
    assert extra == {"users_5": 9}


@pytest.mark.asyncio
async def test_delete_keys_by_pattern_without_client(monkeypatch):
    monkeypatch.setattr(cache_module, "client", None)

    await cache_module._delete_keys_by_pattern("users:*")


@pytest.mark.asyncio
async def test_delete_keys_by_pattern_scans_and_deletes(monkeypatch):
    redis = Mock()
    redis.scan = AsyncMock(side_effect=[(1, [b"users:1", b"users:2"]), (0, [])])
    redis.delete = AsyncMock()
    monkeypatch.setattr(cache_module, "client", redis)

    await cache_module._delete_keys_by_pattern("users:*")

    assert redis.scan.await_count == 2
    redis.delete.assert_awaited_once_with(b"users:1", b"users:2")


@pytest.mark.asyncio
async def test_cache_decorator_raises_when_client_missing(monkeypatch):
    monkeypatch.setattr(cache_module, "client", None)

    @cache_module.cache("items")
    async def endpoint(request, **kwargs):
        return kwargs

    with pytest.raises(MissingClientError):
        await endpoint(Mock(method="GET"), id=1)


@pytest.mark.asyncio
async def test_cache_decorator_rejects_get_with_invalidation_options(monkeypatch):
    redis = Mock()
    redis.get = AsyncMock()
    monkeypatch.setattr(cache_module, "client", redis)

    @cache_module.cache("items", to_invalidate_extra={"users_{user_id}": "{item_id}"})
    async def endpoint(request, **kwargs):
        return kwargs

    with pytest.raises(InvalidRequestError):
        await endpoint(Mock(method="GET"), id=1, user_id=2, item_id=3)


@pytest.mark.asyncio
async def test_cache_decorator_returns_cached_data(monkeypatch):
    redis = Mock()
    redis.get = AsyncMock(return_value=b'{"cached": true}')
    redis.set = AsyncMock()
    redis.expire = AsyncMock()
    monkeypatch.setattr(cache_module, "client", redis)

    @cache_module.cache("items")
    async def endpoint(request, **kwargs):
        return {"fresh": False}

    result = await endpoint(Mock(method="GET"), id=3)

    assert result == {"cached": True}
    redis.set.assert_not_awaited()
    redis.expire.assert_not_awaited()


@pytest.mark.asyncio
async def test_cache_decorator_sets_cache_on_get_miss(monkeypatch):
    redis = Mock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock()
    redis.expire = AsyncMock()
    monkeypatch.setattr(cache_module, "client", redis)

    @cache_module.cache("items", expiration=120)
    async def endpoint(request, **kwargs):
        return {"value": kwargs["id"]}

    result = await endpoint(Mock(method="GET"), id=8)

    assert result == {"value": 8}
    redis.set.assert_awaited_once_with("items:8", json.dumps({"value": 8}))
    redis.expire.assert_awaited_once_with("items:8", 120)


@pytest.mark.asyncio
async def test_cache_decorator_invalidates_main_extra_and_pattern_keys(monkeypatch):
    redis = Mock()
    redis.delete = AsyncMock()
    monkeypatch.setattr(cache_module, "client", redis)
    delete_by_pattern = AsyncMock()
    monkeypatch.setattr(cache_module, "_delete_keys_by_pattern", delete_by_pattern)

    @cache_module.cache(
        "items_{user_id}",
        resource_id_name="item_id",
        to_invalidate_extra={"users_{user_id}": "{item_id}"},
        pattern_to_invalidate_extra=["devices_{user_id}_"],
    )
    async def endpoint(request, **kwargs):
        return {"updated": kwargs["item_id"]}

    result = await endpoint(Mock(method="PUT"), user_id=4, item_id=9)

    assert result == {"updated": 9}
    assert redis.delete.await_args_list[0].args == ("items_4:9",)
    assert redis.delete.await_args_list[1].args == ("users_4:9",)
    delete_by_pattern.assert_awaited_once_with("devices_4_*")


@pytest.mark.asyncio
async def test_async_get_redis_yields_client_and_closes_it(monkeypatch):
    redis = Mock()
    redis.aclose = AsyncMock()
    redis_factory = Mock(return_value=redis)
    monkeypatch.setattr(cache_module, "pool", object())
    monkeypatch.setattr(cache_module, "Redis", redis_factory)

    generator = cache_module.async_get_redis()
    yielded = await generator.__anext__()
    await generator.aclose()

    assert yielded is redis
    redis_factory.assert_called_once()
    redis.aclose.assert_awaited_once()
