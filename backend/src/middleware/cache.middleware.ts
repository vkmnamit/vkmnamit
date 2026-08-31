import { Request, Response, NextFunction } from 'express';

interface CacheItem {
  data: any;
  expiry: number;
}

// Native in-memory cache
const cacheStore = new Map<string, CacheItem>();

/**
 * Express middleware to cache GET requests in-memory.
 * @param durationInSeconds How long to keep the response in cache
 */
export const cacheGet = (durationInSeconds: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Include school_id and role in the cache key to prevent cross-tenant data leakage
    const schoolId = (req as any).user?.school_id || 'no-school';
    const role = (req as any).user?.role || 'no-role';
    const key = `cache:${schoolId}:${role}:${req.originalUrl}`;

    const cachedResponse = cacheStore.get(key);
    const now = Date.now();

    // Cache Hit
    if (cachedResponse && cachedResponse.expiry > now) {
      return res.json(cachedResponse.data);
    }

    // Cache Miss - override res.json to capture the response payload
    const originalJson = res.json.bind(res);

    res.json = ((body: any): any => {
      // Only cache successful responses (HTTP 200-299)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheStore.set(key, {
          data: body,
          expiry: now + (durationInSeconds * 1000)
        });
      }
      return originalJson(body);
    }) as any;

    next();
  };
};

/**
 * Utility to clear the entire cache or specific school's cache.
 * Call this when modifying data (POST/PUT/DELETE)
 */
export const clearCache = (schoolId?: string) => {
  if (!schoolId) {
    cacheStore.clear();
    return;
  }
  
  // Clear only keys for this school
  const prefix = `cache:${schoolId}:`;
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
};
