const { RedChat } = require('../')
const util = require('util')

const rc = new RedChat({
  client: new URL('redis://localhost:6379/0'),
  prefix: 'rc'
})
const sleep = util.promisify(setTimeout)
;(async () => {
  const a = await rc.createAgent('00001', 'one')
  const room = await a.join("lobby", async (msg) => {
    console.log(msg)
    if (msg.type === 'message') {
      const [_, id] = msg.data.split(': ')
      await sleep(100)
      a.sendMessage(room.name, `msg-one: ${parseInt(id) + 1}`)
    }
  })
})()