import type { RedisClientType } from "@redis/client"
import { v4 as uuidv4 } from 'uuid';
import {createClient} from "@redis/client"


export type ChatMessage = {
  user: User
  type: string
  data: string
}

export type RedChatOpts = {
  client: RedisClientType | URL
  prefix: string
  historyLimit?: number
}

export type JoinOpts = {
  room: string
  user: User
  password: string,
  listener: (msg: ChatMessage) => void
}

export type Room = {
  name: string
  members: string[]
  expireEmptyDelays: number
}

export class RedChat {
  client: RedisClientType
  prefix: string
  pub: RedisClientType
  sub: RedisClientType

  historyLimit: number = 1000


  constructor(opts: RedChatOpts) {
    const { client, prefix } = opts
    if (client instanceof URL) {
      this.client = createClient({ url: client.toString() })
    } else {
      this.client = client
    }
    this.prefix = prefix
    this.historyLimit = opts.historyLimit || this.historyLimit
    
    this.pub = this.client.duplicate()
    this.sub = this.client.duplicate()
    if (!this.client.isOpen) {
      this.client.connect().then(()=>{
        console.log('[INFO] RedChat redis client connected')
      }).catch((err) => {
        console.error('[ERROR] RedChat redis client connection failed', err)
      })
    }
    if (!this.pub.isOpen) {
      this.pub.connect().then(()=>{
        console.log('[INFO] RedChat redis publisher client connected')})
      .catch((err) => {
        console.error('[ERROR] RedChat redis publisher client connection failed', err)
      })
    }
    if (!this.sub.isOpen) {
      this.sub.connect().then(()=>{
        console.log('[INFO] RedChat redis subscriber client connected')})
      .catch((err) => {
        console.error('[ERROR] RedChat redis subscriber client connection failed', err)
      })
    }
  }

  async join (name: string, user: User, listener: (msg: ChatMessage) => void, password?: string, expireEmptyDelays?: number): Promise<Room> {
    
    if (typeof password === 'number') {
      expireEmptyDelays = password
      password = undefined
    }
    let room: Room = {
      name,
      members: [],
      expireEmptyDelays: expireEmptyDelays || 0,
    }
    if (!password) {
      password = ""
    }
    let roomjson = await this.client.get(`${this.prefix}:${room.name}`)
    let roompass = ""
    if (!roomjson) {
      this.client.set(`${this.prefix}:${room.name}`, JSON.stringify({pass: password, expireEmptyDelays: room.expireEmptyDelays}))
    } else {
      const roomObj = JSON.parse(roomjson)
      roompass = roomObj.pass
      room.expireEmptyDelays = roomObj.expireEmptyDelays
      if (roompass && roompass !== password) {
        throw new Error("Invalid password")
      }
    }
    room.members = await this.client.lRange(`${this.prefix}:${room.name}:members`, 0, -1)
    if (room.members.indexOf(user.id) === -1) {
      await this.client.lPush(`${this.prefix}:${room.name}:members`, user.id)
      room.members.push(user.id)
    }
    if (typeof listener === 'function') {
      const subfn = (data: string) => {
        const msg: ChatMessage = JSON.parse(data)
        if (msg.user.id == user.id) {
          return
        }
        listener(msg)
      }
      const unsubfn = (id: string) => {
        if (id !== user.id) {
          return
        }
        this.sub.unsubscribe(`${this.prefix}:${room.name}:chan`, subfn)
        this.sub.unsubscribe(`${this.prefix}:${room.name}:leavechan`, unsubfn)

        // if members count is 0, initiate expiring
        this.client.exists(`${this.prefix}:${room.name}:members`).then((exists) => {
          if (exists) {
            return
          }
          if (room.expireEmptyDelays > -1) { // else the room is permanent
            this.client.expire(`${this.prefix}:${room.name}`, room.expireEmptyDelays)
            this.client.expire(`${this.prefix}:${room.name}:messages`, room.expireEmptyDelays)
          }
        })
      }
      this.sub.subscribe(`${this.prefix}:${room.name}:chan`, subfn)
      this.sub.subscribe(`${this.prefix}:${room.name}:leavechan`, unsubfn)
    }
    // remove TTLs
    this.client.multi()
      .persist(`${this.prefix}:${room.name}`)
      .persist(`${this.prefix}:${room.name}:messages`)
      .persist(`${this.prefix}:${room.name}:members`)
      .exec()
    return room
  }

  async leave(name: string, user: User) {
    let roomjson = await this.client.get(`${this.prefix}:${name}`)
    if (!roomjson) {
      throw new Error("Room not found")
    }
    const room = JSON.parse(roomjson)
    await this.client.lRem(`${this.prefix}:${name}:members`, 0, user.id)
    await this.pub.publish(`${this.prefix}:${name}:leavechan`, user.id)
    return true
  }

  async sendMessage(name: string, user: User, message: string, password?: string): Promise<boolean> {
    const roomjson = await this.client.get(`${this.prefix}:${name}`)
    if (!roomjson) {
      throw new Error("Room not found")
    }
    const room = JSON.parse(roomjson)
    if (room.password && room.password !== password) {
      throw new Error("Invalid password")
    }
    // must be members
    const members = await this.client.lRange(`${this.prefix}:${name}:members`, 0, -1)
    if (members.indexOf(user.id) === -1) {
      throw new Error("User not in room")
    }
    const msg: ChatMessage = {
      user,
      type: "message",
      data: message,
    }
    await this.pub.publish(`${this.prefix}:${name}:chan`, JSON.stringify(msg))

    // store to message history, limit to historyLimit
    await this.client.multi()
      .lPush(`${this.prefix}:${name}:messages`, JSON.stringify(msg))
      .lTrim(`${this.prefix}:${name}:messages`, 0, this.historyLimit -1)
      .exec()

    return true
  }

  async getMessages(name: string, limit: number = 100): Promise<ChatMessage[]> {
    const messages = await this.client.lRange(`${this.prefix}:${name}:messages`, 0, limit -1)
    return messages.map((msg: string): ChatMessage => JSON.parse(msg)).reverse()
  }

  async createAgent(id: string, name: string): Promise<Agent> {
    if (!id) {
      id = uuidv4()
    }
    if (!name) {
      name = "Agent-" + id
    }
    this.client.set(`${this.prefix}:agent:${id}:name`, name)
    return new Agent(this, { id, name })
  }
}
export type User = {
  id: string
  name: string
}
class Agent {
  user: User
  _redChat: RedChat
  constructor(redchat: RedChat, user: User) {
    this._redChat = redchat
    this.user = user
  }
  get name() {
    return this.user.name
  }

  async join(room: string, listener: (msg: ChatMessage) => void, password?: string, expireEmptyDelays?: number) {
    if (typeof password === 'number') {
      expireEmptyDelays = password
      password = undefined
    }
    if (!password) {
      password = ""
    }
    return this._redChat.join(room, this.user, listener, password, expireEmptyDelays)
  }

  async leave(room: string) {
    return this._redChat.leave(room, this.user)
  }

  async sendMessage(room: string, message: string, password?: string): Promise<boolean> {
    return this._redChat.sendMessage(room, this.user, message, password)
  }

  async getMessages(room: string, limit: number = 100): Promise<ChatMessage[]> {
    return this._redChat.getMessages(room, limit)
  }
}