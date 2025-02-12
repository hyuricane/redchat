# RedChat

RedChat is a chat module that uses Redis for managing chat rooms and agents.

## Installation

To install the dependencies, run:
```bash
npm install
```

## Usage

### Initialization

To initialize the RedChat module, create an instance of `RedChat` with the required options.

```typescript
import { RedChat } from './src/index';
import { createClient } from '@redis/client';

const client = createClient({ url: 'redis://localhost:6379' });
const redChat = new RedChat({ client, prefix: 'chat' });
```

### Join a Room

To join a room, use the `join` method with the room name, user name, and password.

```typescript
const room = await redChat.join({ room: 'room1', user: 'user1', password: 'password' });
console.log(room);
```

### Create an Agent

To create an agent, use the `createAgent` method with the agent ID and name.

```typescript
const agent = await redChat.createAgent('agent1', 'Agent One');
console.log(agent);
```

### Agent Join a Room

An agent can join a room using the `join` method.

```typescript
const agentRoom = await agent.join('room1', 'password');
console.log(agentRoom);
```

## Types

### RedChatOpts

```typescript
type RedChatOpts = {
  client: RedisClientType | URL;
  prefix: string;
};
```

### JoinOpts

```typescript
type JoinOpts = {
  room: string;
  user: string;
  password: string;
};
```

### Room

```typescript
type Room = {
  id: string;
  name: string;
  users: string[];
  password: string;
};
```

### AgentOpts

```typescript
type AgentOpts = {
  id: string;
  name: string;
  redChat: RedChat;
};
```
