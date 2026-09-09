import type { ConsumeMessage } from 'amqplib';
import { connectRabbitMQ, shouldRequeue } from '@khoaluantn/eventbus';
import { env } from '../lib/env.js';
import type { FinanceUiInvalidatedPayload } from './financeInvalidation.js';
import type { FinanceRealtimeHub } from './financeRealtimeHub.js';

const eventType = 'FinanceUiInvalidated';

function isPayload(value: unknown): value is FinanceUiInvalidatedPayload {
  return Boolean(value) && typeof value === 'object'
    && typeof (value as FinanceUiInvalidatedPayload).sellerUserId === 'string'
    && Array.isArray((value as FinanceUiInvalidatedPayload).scopes);
}

export async function bootstrapFinanceRealtimeConsumer(hub: FinanceRealtimeHub): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(env.rabbitmqUrl);
  const queue = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  await channel.bindQueue(queue.queue, 'domain-events', eventType);
  const { consumerTag } = await channel.consume(queue.queue, (message: ConsumeMessage | null) => {
    if (!message) return;
    try {
      const envelope = JSON.parse(message.content.toString()) as { payload?: unknown; occurredAt?: unknown };
      if (!isPayload(envelope.payload) || typeof envelope.occurredAt !== 'string') throw new SyntaxError('Invalid finance realtime event');
      hub.publish(message.properties.messageId ?? `${message.fields.deliveryTag}`, envelope.payload, envelope.occurredAt);
      channel.ack(message);
    } catch (error) {
      channel.nack(message, false, shouldRequeue(error, message));
    }
  });
  return async () => {
    await channel.cancel(consumerTag);
    await channel.close();
    await connection.close();
  };
}
