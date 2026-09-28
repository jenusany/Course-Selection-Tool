import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as { wcsRedis?: IORedis };

/** Shared connection for all BullMQ Queue/Worker instances — BullMQ requires maxRetriesPerRequest: null. */
export const redisConnection: IORedis =
  globalForRedis.wcsRedis ?? new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.wcsRedis = redisConnection;
}
