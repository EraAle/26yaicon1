#!/bin/bash

set -euo pipefail

BASE_DIR="$PWD"
MF_DIR="$BASE_DIR/mf"
MC_DIR="$MF_DIR/mc-server"
BOT_DIR="$MF_DIR/bot"

apt update

apt install -y \
  openjdk-21-jdk \
  wget \
  curl \
  tmux

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

mkdir -p "$MC_DIR" "$BOT_DIR"

if [[ ! -f "$MC_DIR/server.jar" ]]; then
  wget https://api.papermc.io/v2/projects/paper/versions/1.20.1/builds/196/downloads/paper-1.20.1-196.jar -O "$MC_DIR/server.jar"
fi

if [[ ! -f "$MC_DIR/eula.txt" ]]; then
  echo "eula=true" > "$MC_DIR/eula.txt"
fi

# Generate server.properties with online-mode disabled
if [[ ! -f "$MC_DIR/server.properties" ]]; then
  cat > "$MC_DIR/server.properties" <<'PROPS'
#Minecraft server properties
online-mode=false
pvp=true
difficulty=1
gamemode=0
max-players=20
motd=A Minecraft Server
port=25565
server-port=25565
PROPS
fi

if [[ ! -f "$BOT_DIR/package.json" ]]; then
  (
    cd "$BOT_DIR"
    npm init -y
  )
fi

(
  cd "$BOT_DIR"
  npm install \
  mineflayer \
  prismarine-viewer \
  ws \
  express \
  canvas
)

cat > "$BOT_DIR/bot.js" <<'EOF'
const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'VLLMBot',
  version: '1.20.1'
})

bot.on('spawn', () => {
  console.log('Bot spawned!')
  bot.chat('hello world')
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
EOF

echo "======================================="
echo "Minecraft + Mineflayer setup complete"
echo "======================================="
echo ""
echo "Files created at:"
echo "  Server: $MC_DIR"
echo "  Bot:    $BOT_DIR"
echo ""
echo "To start server:"
echo "  cd $MC_DIR && java -Xmx4G -Xms2G -jar server.jar nogui"
echo ""
echo "To start bot (in another terminal):"
echo "  cd $BOT_DIR && node bot.js"
echo "======================================="