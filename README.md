# TurtlePay® RabbitMQ Helper Library

![Prerequisite](https://img.shields.io/badge/node-%3E%3D12-blue.svg) [![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg)](https://github.com/TurtlePay/rabbitmq#readme) [![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/TurtlePay/rabbitmq/graphs/commit-activity) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/TurtlePay/rabbitmq/blob/master/LICENSE) [![Twitter: TurtlePay](https://img.shields.io/twitter/follow/TurtlePay.svg?style=social)](https://twitter.com/TurtlePay)

[![NPM](https://nodeico.herokuapp.com/@turtlepay/rabbitmq.svg)](https://npmjs.com/package/@turtlepay/rabbitmq)

#### Master Build Status
[![Build Status](https://github.com/turtlepay/rabbitmq/workflows/CI%20Build%20Tests/badge.svg?branch=master)](https://github.com/turtlepay/rabbitmq/actions)

#### Development Build Status
[![Build Status](https://github.com/turtlepay/rabbitmq/workflows/CI%20Build%20Tests/badge.svg?branch=development)](https://github.com/turtlepay/rabbitmq/actions)

## Overview

Provides a mechanism and interface for storing the TurtleCoin® blockchain in a relational database.

## Prerequisites

- node >= 12
- rabbitMQ >= 3

## Documentation

Full library documentation is available at [https://rabbitmq.turtlepay.dev](https://rabbitmq.turtlepay.dev)

## Install

```sh
yarn add @turtlepay/rabbitmq
```

## Usage

```typescript
import { RabbitMQ } from '@turtlepay/rabbitmq';

const rabbit = new RabbitMQ('localhost', 'peter', 'rabbit');

interface Job {
    job: number;
    action: string;
    where: string;
}

(async() => {
    await rabbit.connect();

    await rabbit.createQueue('worktasts');

    rabbit.on<Job>('message', (queue, message, payload) => {
        // do something
    })

    await rabbit.sendToQueue<Job>({job: 123245, action: 'hop', where: 'bunnytrail'});
})();
```

## Run tests

```sh
yarn test
```

## Author

👤 **TurtlePay® Development Team**

* Twitter: [@TurtlePay](https://twitter.com/TurtlePay)
* Github: [@TurtlePay](https://github.com/TurtlePay)

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

Feel free to check [issues page](https://github.com/TurtlePay/rabbitmq/issues).

## Show your support

Give a ⭐️ if this project helped you!


## 📝 License

Copyright © 2018-2020 [TurtlePay® Development Team](https://github.com/TurtlePay).

This project is [AGPL-3.0](https://github.com/TurtlePay/rabbitmq/blob/master/LICENSE) licensed.
