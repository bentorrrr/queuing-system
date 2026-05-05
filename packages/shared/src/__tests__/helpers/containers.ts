import { RabbitMQContainer } from '@testcontainers/rabbitmq';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Start a real RabbitMQ container for integration tests.
 * Returns the started container (call .stop() in afterAll) and the AMQP connection URL.
 */
export async function startRabbitMQ() {
  const container = await new RabbitMQContainer('rabbitmq:3-management').start();
  return {
    container,
    url: container.getAmqpUrl(),
  };
}

/**
 * Start a real PostgreSQL container for integration tests.
 * Returns the started container (call .stop() in afterAll) and the connection URI.
 *
 * @param dbName - Database name to create inside the container.
 */
export async function startPostgres(dbName: string) {
  const container = await new PostgreSqlContainer('postgres:16')
    .withDatabase(dbName)
    .start();
  return {
    container,
    url: container.getConnectionUri(),
  };
}
