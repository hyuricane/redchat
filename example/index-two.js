const { RedChat } = require('../')
const util = require('util')

const rc = new RedChat({
  client: new URL('redis://localhost:6379/0'),
  prefix: 'rc'
})
const sleep = util.promisify(setTimeout)

;(async () => {
  const a = await rc.createAgent('00002', 'two')
  const room = await a.join("lobby", async (msg) => {
    console.log(msg)
    if (msg.type === 'message') {
      const [_, id] = msg.data.split(': ')
      await sleep(100)
      a.sendMessage(room.name, `msg-two: ${parseInt(id) + 1}`)
    }
  })
  
  await sleep(1000)
  a.sendMessage(room.name, 'msg-two: 0')
})()

