const amqp = require('amqplib');
const RetryUtil = require('./retry');

class RabbitMQClient {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.isConnecting = false;
        this.serviceName = process.env.SERVICE_NAME || 'auth-service';
    }

    async connect() {
        if (this.isConnecting) {
            while (this.isConnecting) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }
        
        if (this.connection && this.channel) {
            return;
        }
        
        this.isConnecting = true;
        
        try {
            await RetryUtil.retry(async () => {
                console.log(`[${this.serviceName}] Connecting to RabbitMQ...`);
                
                this.connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
                
                this.connection.on('close', () => {
                    console.warn(`[${this.serviceName}] Connection closed, will reconnect...`);
                    this.connection = null;
                    this.channel = null;
                    this.isConnecting = false;
                    setTimeout(() => this.connect(), 1000);
                });
                
                this.connection.on('error', (err) => {
                    console.error(`[${this.serviceName}] Connection error:`, err.message);
                    this.connection = null;
                    this.channel = null;
                    this.isConnecting = false;
                });
                
                this.channel = await this.connection.createChannel();
                
                this.channel.on('error', (err) => {
                    console.error(`[${this.serviceName}] Channel error:`, err.message);
                });
                
                this.channel.on('close', () => {
                    console.warn(`[${this.serviceName}] Channel closed.`);
                    this.channel = null;
                });
                
                // Create exchanges
                const exchanges = ['auth_events', 'user_events', 'tournament_events', 'game_events', 'player_events', 'pairing_events'];
                for (const exchange of exchanges) {
                    await this.channel.assertExchange(exchange, 'topic', { durable: true });
                }
                
                console.log(`[${this.serviceName}] Successfully connected to RabbitMQ`);
            }, {
                maxAttempts: parseInt(process.env.RABBITMQ_MAX_RETRIES) || 10,
                initialDelay: parseInt(process.env.RABBITMQ_RETRY_DELAY) || 1000,
                maxDelay: parseInt(process.env.RABBITMQ_MAX_RETRY_DELAY) || 30000,
                serviceName: this.serviceName
            });
        } finally {
            this.isConnecting = false;
        }
    }

    async publishEvent(exchange, routingKey, data) {
        try {
            if (!this.channel) {
                await this.connect();
            }
            
            const message = {
                timestamp: new Date().toISOString(),
                data: data,
                service: this.serviceName
            };
            
            return this.channel.publish(
                exchange,
                routingKey,
                Buffer.from(JSON.stringify(message)),
                { persistent: true }
            );
        } catch (error) {
            console.error('Failed to publish event:', error);
            // Single retry attempt
            await this.connect();
            const message = {
                timestamp: new Date().toISOString(),
                data: data,
                service: this.serviceName
            };
            
            return this.channel.publish(
                exchange,
                routingKey,
                Buffer.from(JSON.stringify(message)),
                { persistent: true }
            );
        }
    }

    async consumeEvents(exchange, routingKey, handler) {
        try {
            if (!this.channel) {
                await this.connect();
            }
            
            const queue = await this.channel.assertQueue('', { exclusive: true });
            await this.channel.bindQueue(queue.queue, exchange, routingKey);
            
            await this.channel.consume(queue.queue, async (msg) => {
                if (msg) {
                    try {
                        const data = JSON.parse(msg.content.toString());
                        await handler(data);
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error('Error processing message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });
        } catch (error) {
            console.error('Failed to consume events:', error);
            throw error;
        }
    }

    async requestResponse(queue, data, timeout = 30000) {
        try {
            if (!this.channel) {
                await this.connect();
            }
            
            const correlationId = Math.random().toString(36).substring(2, 15);
            const replyQueue = await this.channel.assertQueue('', { exclusive: true });
            
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error('Request timeout'));
                }, timeout);
                
                this.channel.consume(replyQueue.queue, (msg) => {
                    if (msg && msg.properties.correlationId === correlationId) {
                        clearTimeout(timer);
                        resolve(JSON.parse(msg.content.toString()));
                        this.channel.ack(msg);
                    }
                });
                
                this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), {
                    correlationId: correlationId,
                    replyTo: replyQueue.queue
                });
            });
        } catch (error) {
            console.error('Failed to send request:', error);
            throw error;
        }
    }

    async close() {
        try {
            if (this.channel) await this.channel.close();
            if (this.connection) await this.connection.close();
        } catch (error) {
            console.error('Error closing RabbitMQ connection:', error);
        }
    }
}

module.exports = new RabbitMQClient(); 