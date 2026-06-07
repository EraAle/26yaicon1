const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'ArenaBuilder',
  version: '1.20.1'
})

const commands = [
  // Clear area
  'fill -25 65 -25 25 80 25 air',

  // Main floor
  'fill -20 65 -20 20 65 20 polished_deepslate',

  // Floor border
  'fill -20 65 -20 20 65 -20 deepslate_tiles',
  'fill -20 65 20 20 65 20 deepslate_tiles',
  'fill -20 65 -20 -20 65 20 deepslate_tiles',
  'fill 20 65 -20 20 65 20 deepslate_tiles',

  // Inner decorative floor cross
  'fill -2 65 -20 2 65 20 deepslate_bricks',
  'fill -20 65 -2 20 65 2 deepslate_bricks',

  // Arena walls
  'fill -20 66 -20 20 71 -20 deepslate_brick_wall',
  'fill -20 66 20 20 71 20 deepslate_brick_wall',
  'fill -20 66 -20 -20 71 20 deepslate_brick_wall',
  'fill 20 66 -20 20 71 20 deepslate_brick_wall',

  // Corner pillars
  'fill -20 65 -20 -20 73 -20 deepslate_tiles',
  'fill 20 65 -20 20 73 -20 deepslate_tiles',
  'fill -20 65 20 -20 73 20 deepslate_tiles',
  'fill 20 65 20 20 73 20 deepslate_tiles',

  // Extra pillar caps
  'setblock -20 74 -20 sea_lantern',
  'setblock 20 74 -20 sea_lantern',
  'setblock -20 74 20 sea_lantern',
  'setblock 20 74 20 sea_lantern',

  // First spectator ring slabs
  'fill -20 71 -21 20 71 -21 deepslate_tile_slab',
  'fill -20 71 21 20 71 21 deepslate_tile_slab',
  'fill -21 71 -20 -21 71 20 deepslate_tile_slab',
  'fill 21 71 -20 21 71 20 deepslate_tile_slab',

  // Second spectator ring slabs
  'fill -21 72 -22 21 72 -22 deepslate_tile_slab',
  'fill -21 72 22 21 72 22 deepslate_tile_slab',
  'fill -22 72 -21 -22 72 21 deepslate_tile_slab',
  'fill 22 72 -21 22 72 21 deepslate_tile_slab',

  // First ring supports
  'fill -21 71 -22 21 71 -22 deepslate_bricks',
  'fill -21 71 22 21 71 22 deepslate_bricks',
  'fill -22 71 -21 -22 71 21 deepslate_bricks',
  'fill 22 71 -21 22 71 21 deepslate_bricks',

  // Third spectator ring slabs
  'fill -22 73 -23 22 73 -23 deepslate_tile_slab',
  'fill -22 73 23 22 73 23 deepslate_tile_slab',
  'fill -23 73 -22 -23 73 22 deepslate_tile_slab',
  'fill 23 73 -22 23 73 22 deepslate_tile_slab',

  // Outer ring supports
  'fill -22 71 -23 22 72 -23 deepslate_bricks',
  'fill -22 71 23 22 72 23 deepslate_bricks',
  'fill -23 71 -22 -23 72 22 deepslate_bricks',
  'fill 23 71 -22 23 72 22 deepslate_bricks',

  // Sea lantern lighting on four sides
  'setblock -20 72 -23 sea_lantern',
  'setblock -20 72 23 sea_lantern',
  'setblock -23 72 -20 sea_lantern',
  'setblock 23 72 -20 sea_lantern',

  'setblock -10 72 -23 sea_lantern',
  'setblock -10 72 23 sea_lantern',
  'setblock -23 72 -10 sea_lantern',
  'setblock 23 72 -10 sea_lantern',

  'setblock 0 72 -23 sea_lantern',
  'setblock 0 72 23 sea_lantern',
  'setblock -23 72 0 sea_lantern',
  'setblock 23 72 0 sea_lantern',

  'setblock 10 72 -23 sea_lantern',
  'setblock 10 72 23 sea_lantern',
  'setblock -23 72 10 sea_lantern',
  'setblock 23 72 10 sea_lantern',

  'setblock 20 72 -23 sea_lantern',
  'setblock 20 72 23 sea_lantern',
  'setblock -23 72 20 sea_lantern',
  'setblock 23 72 20 sea_lantern',

  // Small floor light points outside combat center
  'setblock -15 65 -15 sea_lantern',
  'setblock 15 65 -15 sea_lantern',
  'setblock -15 65 15 sea_lantern',
  'setblock 15 65 15 sea_lantern',

  // Cover floor lights with carpet-like dark blocks around them if needed
  'setblock -15 66 -15 air',
  'setblock 15 66 -15 air',
  'setblock -15 66 15 air',
  'setblock 15 66 15 air',

  // Clear inner arena volume again
  'fill -19 66 -19 19 74 19 air',

  // World settings
  'setworldspawn 0 66 0',
  'gamerule doMobSpawning false',
  'gamerule doMobLoot false',
  'gamerule doDaylightCycle false',
  'gamerule doWeatherCycle false',
  'time set noon',
  'weather clear'
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

bot.once('spawn', async () => {
  console.log('ArenaBuilder spawned')

  for (const cmd of commands) {
    console.log('/' + cmd)
    bot.chat('/' + cmd)
    await sleep(300)
  }

  console.log('Arena build done')
  bot.quit()
})