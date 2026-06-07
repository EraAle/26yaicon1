# Minecraft Server + Mineflayer Setup Guide

이 문서는 Vessl GPU 서버 위에 Minecraft 서버를 띄우고,
로컬 Minecraft 클라이언트로 접속하며,
Mineflayer 기반 AI bot 및 vLLM 연동을 위한 초기 환경을 구축하는 과정을 정리한다.

---

# 목표 구조

```text
로컬 Minecraft Client
        ↓
Vessl Minecraft Server
        ↑
Mineflayer Bot
        ↑
vLLM API
```

---

# 환경 정보

* Ubuntu 22.04
* Java 21
* PaperMC 1.19.4
* Node.js + Mineflayer
* vLLM OpenAI API

---

# 1. Java 21 설치

```bash
apt update
apt install -y openjdk-21-jdk
```

확인:

```bash
java -version
```

예상 출력:

```text
openjdk version "21..."
```

---

# 2. Minecraft 서버 설치

```bash
mkdir -p /home/mf/mc-server
cd /home/mf/mc-server
```

PaperMC 1.19.4 다운로드:

```bash
wget https://api.papermc.io/v2/projects/paper/versions/1.19.4/builds/550/downloads/paper-1.19.4-550.jar -O server.jar
```

---

# 3. 최초 실행

```bash
java -Xmx4G -Xms2G -jar server.jar nogui
```

EULA 오류 발생 후 종료됨.

---

# 4. EULA 동의

```bash
echo "eula=true" > eula.txt
```

---

# 5. 서버 실행

```bash
java -Xmx4G -Xms2G -jar server.jar nogui
```

성공 시:

```text
Done (...)! For help, type "help"
```

---

# 6. Offline mode 설정

Mineflayer bot 접속을 위해:

```bash
sed -i 's/online-mode=true/online-mode=false/' server.properties
```

확인:

```bash
grep online-mode server.properties
```

예상 출력:

```text
online-mode=false
```

서버 재시작 필요.

---

# 7. Port 열기

vscode 쓴다면 -> terminal 탭 오른쪽 Ports 탭에서 25565 포트 추가
터미널 -> ssh -L 25565:localhost:25565 root@165.132.46.92 -p 30459 로 연결 (ip와 포트 확인)


---

# 7. 로컬 Minecraft 접속

Minecraft Java Edition 1.19.4 사용.

서버 주소:

```text
<server_ip>:25565
```

또는 SSH Tunnel 사용 시:

```text
localhost:25565
```

---

# 8. OP 권한 부여

서버 콘솔:

```text
op <player_name>
```

예시:

```text
op A_le_
```

---

---

# 서버 실행

```bash
bash /home/mf/start_mc_server.sh
```

---

# Mineflayer 설치

```bash
mkdir -p /home/mf/bot
cd /home/mf/bot

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

npm init -y
npm install mineflayer
```

---

# Labeled dataset generator

## 1) Bot 실행

`/generate` HTTP endpoint는 `bot.js`에서 제공합니다. 포트는 8082입니다.

```bash
cd /home/vla/mf/bot
node bot.js
```

## 2) Python 수집기 실행

```bash
cd /home/vla
python dataset_generator.py --save-dir dataset
```

---

# 기본 Bot 생성

## bot.js

```javascript
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

  console.log(`<${username}> ${message}`)

  if (message === 'jump') {
    bot.setControlState('jump', true)

    setTimeout(() => {
      bot.setControlState('jump', false)
    }, 500)
  }
})
```

---

# Bot 실행

```bash
cd /home/mf/bot
node bot.js
```

성공 시:

* VLLMBot 서버 접속
* 채팅에 hello world 출력
* 플레이어가 jump 채팅 입력 시 봇 점프

---
