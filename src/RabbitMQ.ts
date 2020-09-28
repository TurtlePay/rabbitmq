// Copyright (c) 2018-2020, TurtlePay Developers
//
// Please see the included LICENSE file for more information.

import * as amqplib from 'amqplib';
import { EventEmitter } from 'events';
import { v4 as UUID } from 'uuid';
import AbortController from 'abort-controller';

/** @ignore */
require('dotenv').config();

/**
 * An easy to use Typescript based interface for interacting with
 * RabbitMQ
 */
export class RabbitMQ extends EventEmitter {
    private readonly m_connectionString: string;
    private readonly m_replyQueue: string;
    private m_channel?: amqplib.Channel;

    /**
     * Creates a new instance of the RabbitMQ interface
     * @param host the hostname of the RabbitMQ server
     * @param username the username for the RabbitMQ server
     * @param password the password for the RabbitMQ server
     * @param autoReconnect whether we should automatically reconnect when disconnected
     * @param port the port number the RabbitMQ server is listening on
     */
    constructor (
        host: string,
        username: string,
        password: string,
        autoReconnect: boolean = true,
        port: number = 5672
    ) {
        super();

        this.m_connectionString = buildConnectionString(host, port, username, password);

        this.m_replyQueue = UUID()
            .toString()
            .replace(/-/g, '');

        if (autoReconnect) {
            this.on('disconnect', error => {
                this.emit('log', new Error('Error: ' + error.toString()));
                this.emit('log', 'Reconnecting to server...');

                this.connect()
                    .catch(error => {
                        this.emit('log', 'Could not reconnect to server: ' + error.toString());
                    });
            });
        }
    }

    /**
     * Returns the randomly generated reply queue information for this instance
     */
    public get replyQueue (): string {
        return this.m_replyQueue;
    }

    public on(event: 'disconnect', listener: (error: Error) => void): this;

    public on(event: 'connect', listener: () => void): this;

    public on(event: 'log', listener: (entry: Error | string) => void): this;

    public on<T>(event: 'message', listener: (queue: string, message: amqplib.Message, payload: T) => void): this;

    public on (event: any, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Acknowledges the receipt of a message from the server
     * This should only be called on messages that have successfully processed or
     * that you want to remove from the queue so that it is not retried again
     * @param message the message provided by the server
     */
    public async ack (message: amqplib.Message): Promise<void> {
        if (this.m_channel) {
            return this.m_channel.ack(message);
        }
    }

    /**
     * Connects to the RabbitMQ server
     */
    public async connect (): Promise<void> {
        const connection = await amqplib.connect(this.m_connectionString);

        connection.on('disconnect', error => this.emit('disconnect', error));

        const channel = await connection.createChannel();

        channel.on('disconnect', error => this.emit('disconnect', error));

        this.m_channel = channel;

        await this.createQueue(this.m_replyQueue, false, true);

        this.emit('connect');
    }

    /**
     * Creates a new message queue on the server
     * @param queue the name of the queue to create
     * @param durable whether or not the queue should remain when empty and/or we disconnect
     * @param exclusive whether we need exclusive access to this queue
     */
    public async createQueue (
        queue: string,
        durable = true,
        exclusive = false
    ): Promise<void> {
        if (this.m_channel) {
            await this.m_channel.assertQueue(queue, { durable, exclusive });
        } else {
            throw new Error('No connected channel');
        }
    }

    /**
     * No-Acknowledges the receipt of a message from the server
     * This should only be called on messages that have not successfully processed or
     * that you do not want to remove from the queue so that it is attempted again
     * @param message the message provided by the server
     * @param requeue by default, we requeue the message, if we do not want to requeue, set to false
     */
    public async nack (message: amqplib.Message, requeue = true): Promise<void> {
        if (this.m_channel) {
            return this.m_channel.nack(message, undefined, requeue);
        }
    }

    /**
     * Sets our RabbitMQ channel to prefetch such that it limits how many unacknowledged messages
     * we can hold in our specific RabbitMQ channel
     * @param value the number of unacknowledged messages to permit in the channel
     */
    public async prefetch (value: number): Promise<void> {
        if (this.m_channel) {
            await this.m_channel.prefetch(value);
        } else {
            throw new Error('No connected channel');
        }
    }

    /**
     * Registers us as a consumer of messages on this channel
     * @param queue the name of the queue to accept messages from
     * @param prefetch the number of unacknowledged messages to permit in the channel
     */
    public async registerConsumer<T> (queue: string, prefetch?: number): Promise<void> {
        if (!this.m_channel) {
            throw new Error('No connected channel');
        }

        if (prefetch) {
            await this.prefetch(prefetch);
        }

        await this.m_channel.consume(queue, message => {
            if (message !== null) {
                const payload = JSON.parse(message.content.toString());

                this.emit('message', queue, message, (payload as T));
            }
        });
    }

    /**
     * Replies to the given message with the response payload given
     * @param message the message provided by the server
     * @param payload the payload to reply with
     */
    public async reply<T> (message: amqplib.Message, payload: T): Promise<boolean> {
        return this.sendToQueue<T>(message.properties.replyTo, payload, {
            correlationId: message.properties.correlationId
        });
    }

    /**
     * Sends a message to the given queue requesting that we receive a reply
     * from the worker that handles the message. This method will wait for the
     * worker to complete the request and the reply to be received before the
     * promise will resolve
     * @param queue the name of the queue to send our message to
     * @param payload the payload to be sent with the message
     * @param timeout the amount of time (ms) that we are willing to wait for a reply
     */
    public async requestReply<T, U> (
        queue: string,
        payload: T,
        timeout = 5000
    ): Promise<U> {
        /* eslint-disable-next-line no-async-promise-executor */
        return new Promise(async (resolve, reject) => {
            if (!this.m_channel) {
                throw new Error('No connected channel');
            }

            const requestId = UUID()
                .toString()
                .replace(/-/g, '');

            const controller = new AbortController();

            const listener = () => {
                return reject(new Error('Could not complete the request within the specified timeout period.'));
            };

            controller.signal.addEventListener('abort', listener);

            await this.m_channel.consume(this.m_replyQueue, async (message) => {
                if (message !== null && message.properties.correlationId === requestId) {
                    const response = JSON.parse(message.content.toString());

                    await this.ack(message);

                    if (!controller.signal.aborted) {
                        controller.signal.removeEventListener('abort', listener);

                        return resolve(response);
                    }
                } else if (message !== null) {
                    await this.nack(message);
                }
            });

            if (!await this.sendToQueue<T>(queue, payload, {
                correlationId: requestId,
                replyTo: this.m_replyQueue,
                expiration: timeout
            })) {
                throw new Error('Could not send request to queue');
            }

            setTimeout(() => controller.abort(), timeout + 500);
        });
    }

    /**
     * Sends a payload to the given queue for processing by a consumer
     * @param queue the name of the queue to send our message to
     * @param payload the payload to be sent with the message
     * @param options passthru options sent to the server with the sendToQueue statement
     */
    public async sendToQueue<T> (
        queue: string,
        payload: T | Buffer,
        options?: amqplib.Options.Publish
    ): Promise<boolean> {
        if (!this.m_channel) {
            throw new Error('No connected channel');
        }

        if (!(payload instanceof Buffer)) {
            payload = Buffer.from(JSON.stringify(payload));
        }

        return this.m_channel.sendToQueue(queue, payload, options);
    }
}

/**
 * Retrieves connection parameters from the environment variables or
 * from a .env file to make things easier
 */
export function getConnectionParameters (): { host: string, port: number, user: string, pass: string } {
    const host = process.env.RABBIT_HOST || 'localhost';
    const port = (process.env.RABBIT_PORT) ? parseInt(process.env.RABBIT_PORT, 10) : 5672;
    const user = process.env.RABBIT_USER || undefined;
    const pass = process.env.RABBIT_PASS || undefined;

    if (user === undefined || pass === undefined) {
        throw new Error('!! Missing RabbitMQ connection parameters in environment variables !!');
    }

    return { host, port, user, pass };
}

/** @ignore */
const buildConnectionString = (host: string, port: number, username: string, password: string): string => {
    const result = ['amqp://'];

    if (username.length !== 0) {
        result.push(username);

        if (password.length !== 0) {
            result.push(':' + password);
        }

        result.push('@');
    }

    result.push(host);

    result.push(':' + port.toString());

    return result.join('');
};
