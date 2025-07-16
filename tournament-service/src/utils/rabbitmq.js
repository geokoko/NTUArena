const amqp = require('amqplib');

class RabbitMQClient {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.isConnecting = false;
        this.maxRetries = parseInt(process.env.RABBITMQ_MAX_RETRIES) || 10;
        this.retryDelay = parseInt(process.env.RABBITMQ_RETRY_DELAY) || 1000; // Initial delay in ms
        this.maxRetryDelay = parseInt(process.env.RABBITMQ_MAX_RETRY_DELAY) || 30000; // Max delay in ms
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    calculateRetryDelay(attempt) {
        // Exponential backoff with jitter
        const exponentialDelay = Math.min(
            this.retryDelay * Math.pow(2, attempt),
            this.maxRetryDelay
        );
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.1 * exponentialDelay;
        return Math.floor(exponentialDelay + jitter);
    }

    async connectWithRetry() {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const serviceName = process.env.SERVICE_NAME || 'tournament-service';
                const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
                
                console.log(`[${serviceName}] Attempting to connect to RabbitMQ (attempt ${attempt + 1}/${this.maxRetries})...`);
                
                this.connection = await amqp.connect(rabbitmqUrl);
                
                // Set up connection event handlers
                this.connection.on('close', () => {
                    console.warn(`[${serviceName}] RabbitMQ connection closed. Will attempt to reconnect...`);
                    this.connection = null;
                    this.channel = null;
                    this.isConnecting = false;
                    // Auto-reconnect after a delay
                    setTimeout(() => this.connect(), this.retryDelay);
                });
                
                this.connection.on('error', (err) => {
                    console.error(`[${serviceName}] RabbitMQ connection error:`, err.message);
                    this.connection = null;
                    this.channel = null;
                    this.isConnecting = false;
                });
                
                this.channel = await this.connection.createChannel();
                
                // Set up channel event handlers
                this.channel.on('error', (err) => {
                    console.error(`[${serviceName}] RabbitMQ channel error:`, err.message);
                });
                
                this.channel.on('close', () => {
                    console.warn(`[${serviceName}] RabbitMQ channel closed.`);
                    this.channel = null;
                });
                
                // Create exchanges
                await this.channel.assertExchange('auth_events', 'topic', { durable: true });
                await this.channel.assertExchange('user_events', 'topic', { durable: true });
                await this.channel.assertExchange('tournament_events', 'topic', { durable: true });
                await this.channel.assertExchange('game_events', 'topic', { durable: true });
                await this.channel.assertExchange('player_events', 'topic', { durable: true });
                await this.channel.assertExchange('pairing_events', 'topic', { durable: true });
                
                console.log(`[${serviceName}] Successfully connected to RabbitMQ`);
                return;
                
            } catch (error) {
                const serviceName = process.env.SERVICE_NAME || 'tournament-service';
                console.error(`[${serviceName}] Failed to connect to RabbitMQ (attempt ${attempt + 1}/${this.maxRetries}):`, error.message);
                
                if (attempt === this.maxRetries - 1) {
                    console.error(`[${serviceName}] Max retry attempts reached. Unable to connect to RabbitMQ.`);
                    throw new Error(`Failed to connect to RabbitMQ after ${this.maxRetries} attempts: ${error.message}`);
                }
                
                const delay = this.calculateRetryDelay(attempt);
                console.log(`[${serviceName}] Retrying in ${delay}ms...`);
                await this.sleep(delay);
            }
        }
    }

    async connect() {
        // Prevent multiple concurrent connection attempts
        if (this.isConnecting) {
            console.log('Connection attempt already in progress, waiting...');
            while (this.isConnecting) {
                await this.sleep(100);
            }
            return;
        }
        
        // Return early if already connected
        if (this.connection && this.channel) {
            return;
        }
        
        this.isConnecting = true;
        
        try {
            await this.connectWithRetry();
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
                service: process.env.SERVICE_NAME || 'tournament-service'
            };
            
            return this.channel.publish(
                exchange,
                routingKey,
                Buffer.from(JSON.stringify(message)),
                { persistent: true }
            );
        } catch (error) {
            console.error('Failed to publish event:', error);
            // Try to reconnect and retry once
            try {
                await this.connect();
                const message = {
                    timestamp: new Date().toISOString(),
                    data: data,
                    service: process.env.SERVICE_NAME || 'tournament-service'
                };
                
                return this.channel.publish(
                    exchange,
                    routingKey,
                    Buffer.from(JSON.stringify(message)),
                    { persistent: true }
                );
            } catch (retryError) {
                console.error('Failed to publish event after retry:', retryError);
                throw retryError;
            }
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
            if (this.channel) {
                await this.channel.close();
            }
            if (this.connection) {
                await this.connection.close();
            }
        } catch (error) {
            console.error('Error closing RabbitMQ connection:', error);
        }
    }
}

module.exports = new RabbitMQClient(); 