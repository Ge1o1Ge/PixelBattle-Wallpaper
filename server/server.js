const WebSocket = require("ws");
const http = require("http");

console.log(`
╔══════════════════════════════════════════╗
║     PixelBattle Server v2.0              ║
║     For Wallpaper Engine Client          ║
╚══════════════════════════════════════════╝
`);

const PORT = 8080;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const COOLDOWN_MS = 1000; // 30 секунд

// Состояние холста
let canvas = {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  pixels: new Array(CANVAS_WIDTH * CANVAS_HEIGHT).fill(0),
};

// Статистика
let onlineUsers = new Map(); // ws -> {id, lastPixelTime, ip}
let totalPixelsPlaced = 0;
let serverStartTime = Date.now();

// Создаем HTTP сервер для статус-страницы
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>PixelBattle Server Status</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            color: #e0e0e0;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(30, 30, 30, 0.8);
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #4CAF50;
            padding-bottom: 20px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(40, 40, 40, 0.8);
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #4CAF50;
        }
        .stat-card h3 {
            margin-top: 0;
            color: #4CAF50;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .stat-card .value {
            font-size: 2.5em;
            font-weight: bold;
            margin: 10px 0;
            color: #ffffff;
        }
        .instructions {
            background: rgba(40, 40, 40, 0.8);
            padding: 20px;
            border-radius: 10px;
            margin-top: 30px;
            border-left: 4px solid #2196F3;
        }
        .instructions h3 {
            color: #2196F3;
        }
        code {
            background: rgba(0, 0, 0, 0.5);
            padding: 5px 10px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            color: #4CAF50;
        }
        .status-badge {
            display: inline-block;
            padding: 5px 15px;
            background: #4CAF50;
            color: white;
            border-radius: 20px;
            font-weight: bold;
            margin-left: 10px;
        }
        .server-info {
            background: rgba(40, 40, 40, 0.8);
            padding: 20px;
            border-radius: 10px;
            margin-top: 20px;
        }
        .btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 10px;
            transition: background 0.3s;
        }
        .btn:hover {
            background: #45a049;
        }
        .users-list {
            max-height: 200px;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.3);
            padding: 10px;
            border-radius: 5px;
            margin-top: 10px;
        }
        .user-item {
            padding: 5px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎨 PixelBattle Server <span class="status-badge">ONLINE</span></h1>
            <p>Real-time multiplayer pixel canvas for Wallpaper Engine</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>👥 Online Users</h3>
                <div class="value">${onlineUsers.size}</div>
                <div class="users-list" id="usersList">
                    ${
                      Array.from(onlineUsers.values())
                        .map(
                          (user) =>
                            `<div class="user-item">${user.id} (${user.ip})</div>`
                        )
                        .join("") ||
                      '<div class="user-item">No users online</div>'
                    }
                </div>
            </div>

            <div class="stat-card">
                <h3>🧮 Total Pixels</h3>
                <div class="value">${totalPixelsPlaced.toLocaleString()}</div>
                <p>Pixels placed by all users</p>
            </div>

            <div class="stat-card">
                <h3>⏱️ Server Uptime</h3>
                <div class="value" id="uptime">0h 0m</div>
                <p>Time since server started</p>
            </div>

            <div class="stat-card">
                <h3>📏 Canvas Size</h3>
                <div class="value">${CANVAS_WIDTH} × ${CANVAS_HEIGHT}</div>
                <p>Total: ${(
                  CANVAS_WIDTH * CANVAS_HEIGHT
                ).toLocaleString()} pixels</p>
            </div>
        </div>

        <div class="server-info">
            <h3>🔌 Connection Information</h3>
            <p><strong>WebSocket URL:</strong> <code>ws://${getServerIP()}:${PORT}/ws</code></p>
            <p><strong>Server IP:</strong> <code>${getServerIP()}</code></p>
            <p><strong>Port:</strong> <code>${PORT}</code></p>
            <p><strong>Cooldown:</strong> <code>${
              COOLDOWN_MS / 1000
            } seconds</code></p>
        </div>

        <div class="instructions">
            <h3>📝 How to Connect</h3>
            <ol>
                <li>Copy this WebSocket URL: <code>ws://${getServerIP()}:${PORT}/ws</code></li>
                <li>In Wallpaper Engine settings, paste the URL in "Server URL" field</li>
                <li>Save and enjoy the multiplayer pixel canvas!</li>
            </ol>
            <button class="btn" onclick="copyUrl()">📋 Copy WebSocket URL</button>
            <button class="btn" onclick="testConnection()">🔗 Test Connection</button>
        </div>
    </div>

    <script>
        // Update uptime
        function updateUptime() {
            const uptimeMs = Date.now() - ${serverStartTime};
            const hours = Math.floor(uptimeMs / 3600000);
            const minutes = Math.floor((uptimeMs % 3600000) / 60000);
            document.getElementById('uptime').textContent = hours + 'h ' + minutes + 'm';
        }
        setInterval(updateUptime, 60000);
        updateUptime();

        // Copy URL to clipboard
        function copyUrl() {
            const url = 'ws://' + window.location.hostname + ':${PORT}/ws';
            navigator.clipboard.writeText(url).then(() => {
                alert('✅ WebSocket URL copied to clipboard!');
            });
        }

        // Test connection
        function testConnection() {
            const ws = new WebSocket('ws://' + window.location.hostname + ':${PORT}/ws');
            ws.onopen = () => {
                alert('✅ Connection successful!');
                ws.close();
            };
            ws.onerror = () => alert('❌ Connection failed');
        }

        // Auto-refresh users list every 10 seconds
        setInterval(() => {
            fetch('/api/stats')
                .then(r => r.json())
                .then(data => {
                    document.querySelector('.stat-card .value').textContent = data.online;
                    document.getElementById('usersList').innerHTML = 
                        data.users.map(user => 
                            \`<div class="user-item">\${user.id} (\${user.ip})</div>\`
                        ).join('') || '<div class="user-item">No users online</div>';
                });
        }, 10000);
    </script>
</body>
</html>
        `);
    return;
  }

  if (req.url === "/api/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    const users = Array.from(onlineUsers.values()).map((user) => ({
      id: user.id,
      ip: user.ip,
      connected: user.connectedAt,
    }));
    res.end(
      JSON.stringify({
        online: onlineUsers.size,
        totalPixels: totalPixelsPlaced,
        uptime: Date.now() - serverStartTime,
        canvas: `${CANVAS_WIDTH}x${CANVAS_HEIGHT}`,
        users: users,
      })
    );
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// Создаем WebSocket сервер с путем /ws
const wss = new WebSocket.Server({ server, path: "/ws" });

// Получение IP сервера
function getServerIP() {
  const interfaces = require("os").networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === "IPv4" && !config.internal) {
        return config.address;
      }
    }
  }
  return "localhost";
}

// Генерация ID пользователя
function generateUserId() {
  return "user_" + Math.random().toString(36).substr(2, 8);
}

// Отправка состояния холста
function sendCanvasState(ws) {
  ws.send(
    JSON.stringify({
      type: "canvasState",
      canvas: canvas,
    })
  );
}

// Рассылка количества онлайн пользователей
function broadcastOnlineCount() {
  const message = JSON.stringify({
    type: "onlineCount",
    count: onlineUsers.size,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Проверка кулдауна
function canPlacePixel(userId) {
  const user = Array.from(onlineUsers.values()).find((u) => u.id === userId);
  if (!user) return true;

  const now = Date.now();
  const timeSinceLast = now - user.lastPixelTime;
  return timeSinceLast >= COOLDOWN_MS;
}

// Обновление времени последнего пикселя
function updateUserPixelTime(userId) {
  for (let [ws, user] of onlineUsers) {
    if (user.id === userId) {
      user.lastPixelTime = Date.now();
      onlineUsers.set(ws, user);
      break;
    }
  }
}

// WebSocket обработчик
wss.on("connection", (ws, req) => {
  const userId = generateUserId();
  const userIp = req.socket.remoteAddress.replace("::ffff:", "");
  const userAgent = req.headers["user-agent"] || "Unknown";

  console.log(`🟢 New connection: ${userId} from ${userIp}`);

  // Сохраняем информацию о пользователе
  onlineUsers.set(ws, {
    id: userId,
    ip: userIp,
    userAgent: userAgent,
    connectedAt: Date.now(),
    lastPixelTime: 0,
  });

  // Отправляем приветствие с текущим состоянием холста
  ws.send(
    JSON.stringify({
      type: "welcome",
      userId: userId,
      canvas: canvas,
      online: onlineUsers.size,
      cooldown: COOLDOWN_MS,
      message: "Welcome to PixelBattle! Connected to server.",
    })
  );

  // Рассылаем обновление онлайн-статуса
  broadcastOnlineCount();

  // Обработка входящих сообщений
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "placePixel":
          handlePlacePixel(ws, data);
          break;

        case "getCanvas":
          sendCanvasState(ws);
          break;

        case "ping":
          ws.send(
            JSON.stringify({
              type: "pong",
              timestamp: Date.now(),
            })
          );
          break;

        default:
          console.log(`Unknown message type from ${userId}:`, data.type);
      }
    } catch (error) {
      console.error(`Error processing message from ${userId}:`, error.message);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        })
      );
    }
  });

  // Обработка отключения
  ws.on("close", () => {
    console.log(`🔴 Disconnected: ${userId}`);
    onlineUsers.delete(ws);
    broadcastOnlineCount();
  });

  // Обработка ошибок
  ws.on("error", (error) => {
    console.error(`⚠️ WebSocket error for ${userId}:`, error.message);
    onlineUsers.delete(ws);
    broadcastOnlineCount();
  });
});

// Обработка размещения пикселя
function handlePlacePixel(ws, data) {
  const user = onlineUsers.get(ws);
  if (!user) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "User not found",
      })
    );
    return;
  }

  const { x, y, color } = data;
  const now = Date.now();

  // Проверка кулдауна
  if (!canPlacePixel(user.id)) {
    const lastTime = user.lastPixelTime;
    const timeLeft = COOLDOWN_MS - (now - lastTime);

    ws.send(
      JSON.stringify({
        type: "cooldown",
        timeLeft: timeLeft,
        timestamp: now,
        message: `Please wait ${Math.ceil(timeLeft / 1000)} seconds`,
      })
    );
    return;
  }

  // Проверка границ и цвета
  if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: `Coordinates out of bounds (0-${CANVAS_WIDTH - 1}, 0-${
          CANVAS_HEIGHT - 1
        })`,
      })
    );
    return;
  }

  if (color < 0 || color > 31) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Color index must be between 0 and 31",
      })
    );
    return;
  }

  // Обновляем холст
  const index = y * CANVAS_WIDTH + x;
  canvas.pixels[index] = color;
  totalPixelsPlaced++;

  // Обновляем время последнего пикселя
  updateUserPixelTime(user.id);
  user.lastPixelTime = now;
  onlineUsers.set(ws, user);

  // Готовим сообщение об обновлении
  const updateMessage = JSON.stringify({
    type: "pixelUpdate",
    x,
    y,
    color,
    userId: user.id,
    timestamp: now,
  });

  // Рассылаем всем подключенным клиентам
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(updateMessage);
    }
  });

  // Отправляем подтверждение отправителю
  ws.send(
    JSON.stringify({
      type: "pixelPlaced",
      x,
      y,
      color,
      cooldown: COOLDOWN_MS,
      timeLeft: COOLDOWN_MS,
      timestamp: now,
      message: `Pixel placed at (${x}, ${y})`,
    })
  );

  console.log(`🎨 ${user.id} placed pixel at (${x}, ${y}) color ${color}`);
}

// Запуск сервера
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
✅ SERVER STARTED SUCCESSFULLY!
📡 WebSocket: ws://localhost:${PORT}/ws
🌐 HTTP:      http://localhost:${PORT}
📊 Status:    http://localhost:${PORT}/api/stats

💡 For Wallpaper Engine:
   Use this URL: ws://localhost:${PORT}/ws

🔧 Configuration:
   Canvas: ${CANVAS_WIDTH}x${CANVAS_HEIGHT}
   Cooldown: ${COOLDOWN_MS / 1000}s
   Port: ${PORT}

👥 Current online: 0
🧮 Total pixels: 0
    `);
});

// Автосохранение каждые 5 минут
setInterval(() => {
  console.log(
    `💾 Auto-save | Online: ${onlineUsers.size} | Pixels: ${totalPixelsPlaced}`
  );
}, 300000);

// Обработка завершения работы
process.on("SIGINT", () => {
  console.log("\n\n🛑 Stopping server...");
  console.log(`✅ Saving statistics: ${totalPixelsPlaced} total pixels`);
  console.log("👋 Goodbye!");
  process.exit(0);
});
