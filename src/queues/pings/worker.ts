import { Worker } from "bullmq";
import { PING_QUEUE_NAME } from "./queue";
import { processPing } from "./processor";
import { redisConnection } from "../connection";

export function startPingWorker() {
    return new Worker(PING_QUEUE_NAME, processPing, {
        connection: redisConnection
    })
}