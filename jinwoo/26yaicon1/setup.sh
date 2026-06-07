#!/bin/bash

set -euo pipefail

apt update

apt install -y \
  openjdk-21-jdk \
  wget \
  curl \
  tmux

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

mkdir -p /home/mf/mc-server
cd /home/mf/mc-server

if [[ ! -f server.jar ]]; then
  wget https://api.papermc.io/v2/projects/paper/versions/1.19.4/builds/550/downloads/paper-1.19.4-550.jar -O server.jar
fi

if [[ ! -f eula.txt ]]; then
  echo "eula=true" > eula.txt
fi

if [[ ! -f server.properties ]]; then
  java -Xmx1G -Xms1G -jar server.jar nogui || true
fi

sed -i 's/online-mode=true/online-mode=false/' server.properties || true

mkdir -p /home/mf/bot
cd /home/mf/bot

if [[ ! -f package.json ]]; then
  npm init -y
fi

npm install mineflayer

cat > bot.js <<'EOF'
const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'VLLMBot'
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

cat > /home/mf/start_mc_server.sh <<'EOF'
#!/bin/bash

cd /home/mf/mc-server
java -Xmx4G -Xms2G -jar server.jar nogui
EOF

chmod +x /home/mf/start_mc_server.sh

cat > /home/mf/start_bot.sh <<'EOF'
#!/bin/bash

cd /home/mf/bot
node bot.js
EOF

chmod +x /home/mf/start_bot.sh

echo "======================================="
echo "Minecraft + Mineflayer setup complete"
echo "======================================="
echo ""
echo "Start server: /home/mf/start_mc_server.sh"
echo "Start bot:    /home/mf/start_bot.sh"