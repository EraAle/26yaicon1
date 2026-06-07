const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'TestBot'
})

bot.once('spawn', () => {
  console.log('Bot spawned!')

  bot.chat('Hello! I am alive.')

  // 앞으로 이동
  bot.setControlState('forward', true)

  setTimeout(() => {
    bot.setControlState('forward', false)

    bot.chat('Movement finished')
  }, 3000)
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return

  if (message === 'jump') {
    bot.setControlState('jump', true)

    setTimeout(() => {
      bot.setControlState('jump', false)
    }, 500)
  }
})

bot.on('error', console.log)
bot.on('kicked', console.log)