import time
import threading
from typing import Optional
import redis
from app.core.config import settings
from app.core.logging import logger


class CacheManager:
    def __init__(self):
        self._redis_client: Optional[redis.Redis] = None
        self._memory_cache = {}
        self._lock = threading.Lock()
        self._connect_redis()

    def _connect_redis(self):
        try:
            r = redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=1)
            r.ping()
            self._redis_client = r
            logger.info("Connected to Redis cache at %s", settings.REDIS_URL)
        except Exception:
            self._redis_client = None
            logger.info("Redis not available. Using thread-safe in-memory cache for debouncing.")

    def set_if_not_exists(self, key: str, value: str, ttl_seconds: int) -> bool:
        """
        Attempts to set key only if it doesn't exist (NX) with TTL.
        Returns True if key was set (i.e. fresh event, not duplicate).
        Returns False if key already existed (i.e. debounced / duplicate).
        """
        if self._redis_client:
            try:
                res = self._redis_client.set(key, value, ex=ttl_seconds, nx=True)
                return bool(res)
            except Exception as e:
                logger.warning("Redis operation failed, falling back to memory: %s", e)

        # In-memory fallback
        with self._lock:
            now = time.time()
            # Clean expired keys
            expired = [k for k, (exp, _) in self._memory_cache.items() if exp < now]
            for k in expired:
                del self._memory_cache[k]

            if key in self._memory_cache:
                exp, _ = self._memory_cache[key]
                if exp > now:
                    return False  # Debounce active

            self._memory_cache[key] = (now + ttl_seconds, value)
            return True

    def get(self, key: str) -> Optional[str]:
        if self._redis_client:
            try:
                val = self._redis_client.get(key)
                return val.decode("utf-8") if val else None
            except Exception:
                pass
        with self._lock:
            if key in self._memory_cache:
                exp, val = self._memory_cache[key]
                if exp > time.time():
                    return val
                del self._memory_cache[key]
        return None

    def delete(self, key: str) -> bool:
        if self._redis_client:
            try:
                self._redis_client.delete(key)
            except Exception:
                pass
        with self._lock:
            if key in self._memory_cache:
                del self._memory_cache[key]
                return True
        return False


cache_manager = CacheManager()

