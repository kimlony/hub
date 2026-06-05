export function getWorkerSlot(): string {
  return process.env.NODE_APP_INSTANCE
    ?? process.env.pm_id
    ?? process.env.HOSTNAME
    ?? String(process.pid);
}

export function getWorkerId(role = process.env.WORKER_ROLE ?? "worker"): string {
  return `${role}:${getWorkerSlot()}`;
}

export function getKafkaClientId(): string {
  const baseClientId = process.env.KAFKA_CLIENT_ID ?? "hub-worker";
  const role = process.env.WORKER_ROLE ?? "worker";
  return `${baseClientId}-${role}-${getWorkerSlot()}`;
}
