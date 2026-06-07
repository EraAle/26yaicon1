const mineflayer = require('mineflayer')
const express = require('express')
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')

const VIEWER_PORT = 3007
const CONTROL_PORT = 8082

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'VLLMBot',
  version: '1.20.1',
  physicsEnabled: true
})

const app = express()
app.use(express.json())

// =========================
// State
// =========================

let latestScene = {
  time: 0,
  has_visible_entity: false,
  nearest_type: 'none',
  nearest_distance: 'none',
  nearest_horizontal: 'none',
  nearest_vertical: 'middle',
  nearest_too_close: false,
  nearest_attackable: false,
  multiple_entities: false,
  visible_entity_count: '0',
  visible_zombie_count: '0',
  visible_skeleton_count: '0',
  scene_text: 'No hostile entity is visible.'
}

let currentAction = {
  time: 0,
  expiresAt: 0,
  action: 'stop',
  duration_ms: 300,
  reason: 'initial state'
}

let actionHistory = []

const ACTION_TICK_MS = 100
const ATTACK_INTERVAL_MS = 650

const TURN_STEP_RAD = 10 * Math.PI / 180
const SCAN_STEP_RAD = 7 * Math.PI / 180

const MIN_ACTION_DURATION_MS = 100
const MAX_ACTION_DURATION_MS = 2000

let lastAttackTime = 0
let lastLookTime = 0
let busyLooking = false

const VALID_ACTIONS = new Set([
  'scan',
  'turn_left',
  'turn_right',
  'move_forward',
  'retreat',
  'attack',
  'stop'
])

// =========================
// Utils
// =========================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value))
}

function stopMovement() {
  bot.setControlState('forward', false)
  bot.setControlState('back', false)
  bot.setControlState('left', false)
  bot.setControlState('right', false)
  bot.setControlState('jump', false)
  bot.setControlState('sprint', false)
}

function isTargetEntity(entity) {
  if (!entity) return false
  if (!entity.position) return false
  if (entity.isValid === false) return false

  return entity.name === 'zombie' || entity.name === 'skeleton'
}

function angleDiff(a, b) {
  let d = a - b

  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI

  return d
}

function getNearestVisibleTarget(maxDist, maxAngleDeg) {
  if (!bot.entity || !bot.entity.position) return null

  let best = null
  let bestDist = Infinity

  const maxAngle = maxAngleDeg * Math.PI / 180

  for (const id in bot.entities) {
    const entity = bot.entities[id]
    if (!isTargetEntity(entity)) continue

    const dx = entity.position.x - bot.entity.position.x
    const dz = entity.position.z - bot.entity.position.z

    const dist = bot.entity.position.distanceTo(entity.position)
    if (dist > maxDist) continue

    const targetYaw = Math.atan2(-dx, -dz)
    const diff = Math.abs(angleDiff(targetYaw, bot.entity.yaw))

    if (diff > maxAngle) continue

    if (dist < bestDist) {
      best = entity
      bestDist = dist
    }
  }

  return best
}

function getNearestTarget(maxDist) {
  if (!bot.entity || !bot.entity.position) return null

  let best = null
  let bestDist = Infinity

  for (const id in bot.entities) {
    const entity = bot.entities[id]
    if (!isTargetEntity(entity)) continue

    const dist = bot.entity.position.distanceTo(entity.position)

    if (dist < bestDist && dist <= maxDist) {
      best = entity
      bestDist = dist
    }
  }

  return best
}

function countTargets() {
  let count = 0

  for (const id in bot.entities) {
    if (isTargetEntity(bot.entities[id])) {
      count += 1
    }
  }

  return count
}

async function lookAtTarget(entity) {
  if (!entity || !entity.position) return
  if (busyLooking) return

  busyLooking = true

  try {
    const h = entity.height || 1.6
    await bot.lookAt(entity.position.offset(0, h * 0.6, 0), true)
  } catch (e) {
  }

  busyLooking = false
}

async function equipSword() {
  let sword = bot.inventory.items().find(item => {
    return item.name === 'iron_sword' ||
           item.name === 'diamond_sword' ||
           item.name === 'netherite_sword' ||
           item.name === 'stone_sword' ||
           item.name === 'wooden_sword'
  })

  if (!sword) {
    bot.chat(`/give ${bot.username} minecraft:iron_sword 1`)
    await sleep(500)
    sword = bot.inventory.items().find(item => item.name === 'iron_sword')
  }

  if (!sword) {
    console.log('no sword found')
    return
  }

  try {
    await bot.equip(sword, 'hand')
  } catch (e) {
    console.log('equip failed:', e.message)
  }
}

// =========================
// Primitive actions
// =========================

async function scanAround() {
  stopMovement()

  const now = Date.now()
  if (now - lastLookTime < 180) return

  lastLookTime = now

  const yaw = bot.entity.yaw + SCAN_STEP_RAD
  const pitch = Math.sin(now / 900) * 6 * Math.PI / 180

  try {
    await bot.look(yaw, pitch, true)
  } catch (e) {
  }
}

async function turnLeft() {
  stopMovement()

  const now = Date.now()
  if (now - lastLookTime < 120) return

  lastLookTime = now

  try {
    await bot.look(bot.entity.yaw + TURN_STEP_RAD, bot.entity.pitch, true)
  } catch (e) {
  }
}

async function turnRight() {
  stopMovement()

  const now = Date.now()
  if (now - lastLookTime < 120) return

  lastLookTime = now

  try {
    await bot.look(bot.entity.yaw - TURN_STEP_RAD, bot.entity.pitch, true)
  } catch (e) {
  }
}

async function moveForward() {
  const target = getNearestVisibleTarget(10, 70)

  if (target) {
    await lookAtTarget(target)
  }

  bot.setControlState('back', false)
  bot.setControlState('forward', true)
  bot.setControlState('sprint', true)
}

async function retreat() {
  const target = getNearestTarget(3.0)

  if (target) {
    await lookAtTarget(target)
  }

  bot.setControlState('forward', false)
  bot.setControlState('sprint', false)
  bot.setControlState('back', true)
}

async function attackNearest() {
  stopMovement()

  let target = getNearestVisibleTarget(3.4, 55)

  if (!target) {
    target = getNearestTarget(3.4)
  }

  if (!target) {
    console.log('[attack] no valid target')
    return
  }

  await lookAtTarget(target)

  const now = Date.now()
  if (now - lastAttackTime < ATTACK_INTERVAL_MS) return

  lastAttackTime = now

  try {
    await equipSword()
    bot.attack(target)
    console.log('[attack]', target.name)
  } catch (e) {
    console.log('[attack failed]', e.message)
  }
}

// =========================
// Action executor
// =========================

function setCurrentAction(action, durationMs, reason) {
  const now = Date.now()

  currentAction = {
    time: now,
    expiresAt: now + durationMs,
    action,
    duration_ms: durationMs,
    reason: reason || ''
  }

  actionHistory.push({
    time: now,
    action,
    duration_ms: durationMs,
    reason: reason || ''
  })

  if (actionHistory.length > 20) {
    actionHistory = actionHistory.slice(actionHistory.length - 20)
  }

  console.log(
    '[action]',
    action,
    `${durationMs}ms`,
    reason ? `- ${reason}` : ''
  )
}

function expireCurrentAction() {
  if (currentAction.action !== 'stop') {
    console.log('[action expired]', currentAction.action)
  }

  currentAction = {
    time: Date.now(),
    expiresAt: 0,
    action: 'stop',
    duration_ms: 0,
    reason: 'expired'
  }

  stopMovement()
}

async function executeCurrentAction() {
  if (!bot.entity) return

  const now = Date.now()

  if (currentAction.action !== 'stop' && now > currentAction.expiresAt) {
    expireCurrentAction()
    return
  }

  switch (currentAction.action) {
    case 'scan':
      await scanAround()
      break

    case 'turn_left':
      await turnLeft()
      break

    case 'turn_right':
      await turnRight()
      break

    case 'move_forward':
      await moveForward()
      break

    case 'retreat':
      await retreat()
      break

    case 'attack':
      await attackNearest()
      break

    case 'stop':
    default:
      stopMovement()
      break
  }
}

// =========================
// HTTP API
// =========================

app.post('/scene_state', (req, res) => {
  const body = req.body || {}

  latestScene = {
    time: Date.now(),

    has_visible_entity: Boolean(body.has_visible_entity),
    nearest_type: body.nearest_type || 'none',
    nearest_distance: body.nearest_distance || 'none',
    nearest_horizontal: body.nearest_horizontal || 'none',
    nearest_vertical: body.nearest_vertical || 'middle',

    nearest_too_close: Boolean(body.nearest_too_close),
    nearest_attackable: Boolean(body.nearest_attackable),
    multiple_entities: Boolean(body.multiple_entities),

    visible_entity_count: body.visible_entity_count || '0',
    visible_zombie_count: body.visible_zombie_count || '0',
    visible_skeleton_count: body.visible_skeleton_count || '0',

    scene_text: body.scene_text || ''
  }

  res.json({
    ok: true,
    received: latestScene
  })
})

app.post('/action', (req, res) => {
  const body = req.body || {}

  const action = String(body.action || 'stop')
  const reason = String(body.reason || '')

  if (!VALID_ACTIONS.has(action)) {
    res.status(400).json({
      ok: false,
      error: `invalid action: ${action}`,
      valid_actions: Array.from(VALID_ACTIONS)
    })
    return
  }

  let durationMs = Number(body.duration_ms || 300)

  if (!Number.isFinite(durationMs)) {
    durationMs = 300
  }

  durationMs = Math.floor(
    clamp(durationMs, MIN_ACTION_DURATION_MS, MAX_ACTION_DURATION_MS)
  )

  setCurrentAction(action, durationMs, reason)

  res.json({
    ok: true,
    currentAction
  })
})

app.post('/stop', (req, res) => {
  setCurrentAction('stop', 100, 'manual stop')
  stopMovement()

  res.json({
    ok: true,
    currentAction
  })
})

app.post('/test_forward', (req, res) => {
  setCurrentAction('move_forward', 1000, 'manual test forward')

  res.json({
    ok: true,
    currentAction
  })
})

app.post('/test_attack', (req, res) => {
  setCurrentAction('attack', 800, 'manual test attack')

  res.json({
    ok: true,
    currentAction
  })
})

app.get('/status', (req, res) => {
  res.json({
    ok: true,

    latestScene,
    currentAction,
    actionHistory,

    target_count: countTargets(),

    bot: bot.entity ? {
      position: bot.entity.position,
      yaw: bot.entity.yaw,
      pitch: bot.entity.pitch
    } : null
  })
})

// =========================
// Bot events
// =========================

bot.once('spawn', async () => {
  console.log('Bot spawned!')

  mineflayerViewer(bot, {
    port: VIEWER_PORT,
    firstPerson: true,
    viewDistance: 6
  })

  console.log(`Viewer running at http://localhost:${VIEWER_PORT}`)
  console.log(`Control server running at http://localhost:${CONTROL_PORT}`)

  await sleep(1000)
  await equipSword()

  setInterval(() => {
    executeCurrentAction().catch(e => {
      console.log('[action tick error]', e.message)
    })
  }, ACTION_TICK_MS)
})

bot.on('kicked', reason => {
  console.log('kicked:', reason)
})

bot.on('error', err => {
  console.log('bot error:', err)
})

app.listen(CONTROL_PORT, () => {
  console.log(`Scene live control server running at http://localhost:${CONTROL_PORT}`)
})