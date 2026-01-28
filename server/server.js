const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

console.log(`
╔══════════════════════════════════════════╗
║     PixelBattle Server v3.0              ║
║     Mega Canvas + Persistent Storage     ║
╚══════════════════════════════════════════╝
`);

// Конфигурация
const PORT = 8080;
const CANVAS_WIDTH = 1920; // Большой холст 8K
const CANVAS_HEIGHT = 1080;
const COOLDOWN_MS = 1000; // 30 секунд
const SAVE_INTERVAL = 30000; // Сохранение каждые 30 секунд

const CHUNK_SIZE = 10000; // Увеличиваем чанк в 10 раз
const BATCH_DELAY = 50; // Задержка между батчами

// Директории для данных
const DATA_DIR = "./data";
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

// Создаем директории если их нет
[DATA_DIR, SNAPSHOTS_DIR, BACKUPS_DIR].forEach(dir => {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
		console.log(`📁 Created directory: ${dir}`);
	}
});

// Файлы данных
const CANVAS_FILE = path.join(DATA_DIR, "canvas.dat");
const META_FILE = path.join(DATA_DIR, "meta.json");

// Состояние холста
let canvas = {
	width: CANVAS_WIDTH,
	height: CANVAS_HEIGHT,
	pixels: null,
	version: 1,
	lastModified: Date.now()
};

// Инициализация холста
function initCanvas() {
	const totalPixels = CANVAS_WIDTH * CANVAS_HEIGHT;
	console.log(`🎨 Initializing canvas: ${CANVAS_WIDTH}x${CANVAS_HEIGHT} (${totalPixels.toLocaleString()} pixels)`);

	// Используем Buffer для экономии памяти (1 байт на пиксель)
	canvas.pixels = Buffer.alloc(totalPixels, 0);

	// Создаем тестовый паттерн только если это новый холст
	createTestPattern();
}

// Тестовый паттерн для нового холста
function createTestPattern() {
	console.log("🎨 Creating test pattern...");

	// Заливаем черным (0 - черный цвет)
	canvas.pixels.fill(0);

	// Рисуем белую рамку по краям (ширина 4 пикселя)
	for (let i = 0; i < 4; i++) {
		// Верхняя и нижняя границы
		for (let x = i; x < CANVAS_WIDTH - i; x++) {
			const topIndex = i * CANVAS_WIDTH + x;
			const bottomIndex = (CANVAS_HEIGHT - 1 - i) * CANVAS_WIDTH + x;
			canvas.pixels[topIndex] = 10; // Белый
			canvas.pixels[bottomIndex] = 10; // Белый
		}

		// Левая и правая границы
		for (let y = i; y < CANVAS_HEIGHT - i; y++) {
			const leftIndex = y * CANVAS_WIDTH + i;
			const rightIndex = y * CANVAS_WIDTH + (CANVAS_WIDTH - 1 - i);
			canvas.pixels[leftIndex] = 10; // Белый
			canvas.pixels[rightIndex] = 10; // Белый
		}
	}

	// Рисуем логотип в центре
	drawLogo();
	console.log("✅ Test pattern created");
}

// Рисуем логотип PixelBattle
// Рисуем простой логотип "PB"
function drawLogo() {
	const centerX = Math.floor(CANVAS_WIDTH / 2);
	const centerY = Math.floor(CANVAS_HEIGHT / 2);

	// Простая буква "P" (11x11 пикселей)
	const logoP = [
		[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
		[1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1]
	];

	// Буква "B" (11x11 пикселей)
	const logoB = [
		[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
		[1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
		[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
	];

	const startX = centerX - 15; // Смещаем чтобы было "P B"
	const startY = centerY - 5;

	// Рисуем "P"
	for (let y = 0; y < logoP.length; y++) {
		for (let x = 0; x < logoP[y].length; x++) {
			if (logoP[y][x] === 1) {
				const px = startX + x;
				const py = startY + y;
				if (px >= 0 && px < CANVAS_WIDTH && py >= 0 && py < CANVAS_HEIGHT) {
					const index = py * CANVAS_WIDTH + px;
					canvas.pixels[index] = 12; // Красный
				}
			}
		}
	}

	// Рисуем "B" (с отступом 15 пикселей)
	for (let y = 0; y < logoB.length; y++) {
		for (let x = 0; x < logoB[y].length; x++) {
			if (logoB[y][x] === 1) {
				const px = startX + x + 15; // Отступ между буквами
				const py = startY + y;
				if (px >= 0 && px < CANVAS_WIDTH && py >= 0 && py < CANVAS_HEIGHT) {
					const index = py * CANVAS_WIDTH + px;
					canvas.pixels[index] = 17; // Зеленый
				}
			}
		}
	}
}

// Загрузка холста из файла
async function loadCanvas() {
	try {
		if (fs.existsSync(CANVAS_FILE) && fs.existsSync(META_FILE)) {
			console.log("📂 Loading canvas from file...");

			const meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));

			// Проверяем совместимость версий
			if (meta.version !== canvas.version) {
				console.warn(`⚠️  Canvas version mismatch: file=${meta.version}, current=${canvas.version}`);
				return false;
			}

			// Проверяем размер
			if (meta.width !== CANVAS_WIDTH || meta.height !== CANVAS_HEIGHT) {
				console.warn(`⚠️  Canvas size mismatch: file=${meta.width}x${meta.height}, current=${CANVAS_WIDTH}x${CANVAS_HEIGHT}`);
				return false;
			}

			// Загружаем данные
			const data = fs.readFileSync(CANVAS_FILE);

			// Если файл сжат, распаковываем
			if (meta.compressed) {
				canvas.pixels = zlib.gunzipSync(data);
			} else {
				canvas.pixels = data;
			}

			canvas.lastModified = meta.lastModified;
			console.log(`✅ Canvas loaded: ${CANVAS_WIDTH}x${CANVAS_HEIGHT}, ${data.length.toLocaleString()} bytes`);
			return true;
		}
	} catch (error) {
		console.error("❌ Error loading canvas:", error.message);
	}

	return false;
}

// Сохранение холста в файл
async function saveCanvas(createBackup = true) {
	try {
		console.log("💾 Saving canvas...");

		const meta = {
			version: canvas.version,
			width: CANVAS_WIDTH,
			height: CANVAS_HEIGHT,
			lastModified: Date.now(),
			compressed: true,
			totalPixels: totalPixelsPlaced
		};

		// Сжимаем данные
		const compressed = zlib.gzipSync(canvas.pixels);

		// Создаем backup только если нужно и если файл существует
		if (createBackup && fs.existsSync(CANVAS_FILE)) {
			const backupFile = path.join(BACKUPS_DIR, `backup_${Date.now()}.dat`);
			fs.copyFileSync(CANVAS_FILE, backupFile);
			console.log(`📦 Backup created: ${path.basename(backupFile)}`);
		}

		// Сохраняем
		fs.writeFileSync(CANVAS_FILE, compressed);
		fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

		console.log(`✅ Canvas saved: ${compressed.length.toLocaleString()} bytes (${Math.round((compressed.length / 1024 / 1024) * 10) / 10} MB)`);

		// Очищаем старые бекапы (оставляем последние 5)
		cleanupOldBackups();

		return true;
	} catch (error) {
		console.error("❌ Error saving canvas:", error.message);
		return false;
	}
}

// Очистка старых бекапов (оставляем последние 5)
function cleanupOldBackups() {
	try {
		if (!fs.existsSync(BACKUPS_DIR)) return;

		const files = fs
			.readdirSync(BACKUPS_DIR)
			.filter(f => f.startsWith("backup_") && f.endsWith(".dat"))
			.map(f => ({
				name: f,
				path: path.join(BACKUPS_DIR, f),
				time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime()
			}))
			.sort((a, b) => b.time - a.time); // Сортируем по времени (новые сверху)

		// Удаляем все, кроме последних 5
		if (files.length > 5) {
			const toDelete = files.slice(5);
			toDelete.forEach(file => {
				fs.unlinkSync(file.path);
				console.log(`🗑️  Deleted old backup: ${file.name}`);
			});
		}
	} catch (error) {
		console.error("❌ Error cleaning backups:", error.message);
	}
}

// Создание снапшота
function createSnapshot() {
	const timestamp = Date.now();
	const snapshotFile = path.join(SNAPSHOTS_DIR, `snapshot_${timestamp}.dat`);

	try {
		const compressed = zlib.gzipSync(canvas.pixels);
		fs.writeFileSync(snapshotFile, compressed);

		// Сохраняем метаданные снапшота
		const snapshotMeta = {
			timestamp,
			width: CANVAS_WIDTH,
			height: CANVAS_HEIGHT,
			size: compressed.length,
			totalPixels: totalPixelsPlaced
		};

		fs.writeFileSync(path.join(SNAPSHOTS_DIR, `snapshot_${timestamp}_meta.json`), JSON.stringify(snapshotMeta, null, 2));

		console.log(`📸 Snapshot created: ${snapshotFile}`);
	} catch (error) {
		console.error("❌ Error creating snapshot:", error.message);
	}
}

// Статистика
let onlineUsers = new Map();
let totalPixelsPlaced = 0;
let serverStartTime = Date.now();
let pixelHistory = [];

// Создаем HTTP сервер для статус-страницы
const server = http.createServer((req, res) => {
	// CORS headers
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		res.writeHead(200);
		res.end();
		return;
	}

	if (req.url === "/") {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>PixelBattle Server Status</title>
    <style>
        /* ... (стили остаются те же) ... */
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎨 PixelBattle Mega Canvas <span class="status-badge">ONLINE</span></h1>
            <p>Real-time multiplayer pixel canvas 8192x8192</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>👥 Online Users</h3>
                <div class="value">${onlineUsers.size}</div>
                <div class="users-list" id="usersList">
                    ${
											Array.from(onlineUsers.values())
												.map(user => `<div class="user-item">${user.id} (${user.ip})</div>`)
												.join("") || '<div class="user-item">No users online</div>'
										}
                </div>
            </div>

            <div class="stat-card">
                <h3>🧮 Total Pixels</h3>
                <div class="value">${totalPixelsPlaced.toLocaleString()}</div>
                <p>Pixels placed by all users</p>
            </div>

            <div class="stat-card">
                <h3>📏 Canvas Size</h3>
                <div class="value">${CANVAS_WIDTH} × ${CANVAS_HEIGHT}</div>
                <p>Total: ${(CANVAS_WIDTH * CANVAS_HEIGHT).toLocaleString()} pixels</p>
            </div>

            <div class="stat-card">
                <h3>💾 Storage</h3>
                <div class="value">${(canvas.pixels.length / 1024 / 1024).toFixed(1)} MB</div>
                <p>${fs.existsSync(CANVAS_FILE) ? "Persisted to disk" : "In memory only"}</p>
            </div>
        </div>

        <div class="server-info">
            <h3>🔌 Connection Information</h3>
            <p><strong>WebSocket URL:</strong> <code>ws://${getServerIP()}:${PORT}/ws</code></p>
            <p><strong>Canvas Size:</strong> <code>${CANVAS_WIDTH}x${CANVAS_HEIGHT}</code></p>
            <p><strong>Cooldown:</strong> <code>${COOLDOWN_MS / 1000} seconds</code></p>
            <div style="margin-top: 15px;">
                <button onclick="createSnapshot()" class="btn">📸 Create Snapshot</button>
                <button onclick="clearCanvas()" class="btn" style="background: #f44336;">🗑️ Clear Canvas</button>
            </div>
        </div>

        <div class="instructions">
            <h3>📝 How to Connect</h3>
            <ol>
                <li>Copy WebSocket URL: <code>ws://${getServerIP()}:${PORT}/ws</code></li>
                <li>In Wallpaper Engine settings, paste URL in "Server URL" field</li>
                <li>Use zoom and pan to navigate the 8192x8192 canvas!</li>
            </ol>
        </div>
    </div>

    <script>
        // ... (скрипт остается тот же) ...
        
        function createSnapshot() {
            fetch('/api/snapshot', { method: 'POST' })
                .then(r => r.json())
                .then(data => alert('Snapshot created: ' + data.filename))
                .catch(e => alert('Error: ' + e));
        }
        
        function clearCanvas() {
            if (confirm('Are you sure? This will clear ALL pixels!')) {
                fetch('/api/clear', { method: 'POST' })
                    .then(r => r.json())
                    .then(() => {
                        alert('Canvas cleared!');
                        location.reload();
                    });
            }
        }
    </script>
</body>
</html>
        `);
		return;
	}

	// API эндпоинты
	if (req.url === "/api/stats") {
		const users = Array.from(onlineUsers.values()).map(user => ({
			id: user.id,
			ip: user.ip,
			connected: user.connectedAt,
			lastPixel: user.lastPixelTime
		}));

		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				online: onlineUsers.size,
				totalPixels: totalPixelsPlaced,
				uptime: Date.now() - serverStartTime,
				canvas: `${CANVAS_WIDTH}x${CANVAS_HEIGHT}`,
				memory: process.memoryUsage(),
				users: users,
				pixelRate: pixelHistory.filter(t => Date.now() - t < 60000).length
			})
		);
		return;
	}

	if (req.url === "/api/canvas/info") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				width: CANVAS_WIDTH,
				height: CANVAS_HEIGHT,
				cooldown: COOLDOWN_MS,
				version: canvas.version,
				paletteSize: 40,
				colors: getColorPalette()
			})
		);
		return;
	}

	if (req.url === "/api/snapshot" && req.method === "POST") {
		createSnapshot();
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ success: true, message: "Snapshot created" }));
		return;
	}

	if (req.url === "/api/clear" && req.method === "POST") {
		canvas.pixels.fill(0);
		totalPixelsPlaced = 0;
		saveCanvas();
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ success: true, message: "Canvas cleared" }));
		return;
	}

	res.writeHead(404);
	res.end("Not Found");
});

// Создаем WebSocket сервер
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

// В функции sendCanvasChunks:
function sendCanvasChunks(ws, startChunk = 0) {
	const totalChunks = Math.ceil((CANVAS_WIDTH * CANVAS_HEIGHT) / CHUNK_SIZE);
	let currentChunk = startChunk;

	function sendNextChunk() {
		if (currentChunk >= totalChunks || ws.readyState !== WebSocket.OPEN) {
			// Отправляем завершающее сообщение
			ws.send(
				JSON.stringify({
					type: "canvasComplete",
					message: "Canvas loading complete"
				})
			);
			return;
		}

		const start = currentChunk * CHUNK_SIZE;
		const end = Math.min(start + CHUNK_SIZE, CANVAS_WIDTH * CANVAS_HEIGHT);
		const chunkData = canvas.pixels.slice(start, end);

		// Сначала отправляем метаданные
		ws.send(
			JSON.stringify({
				type: "chunkMeta",
				chunkIndex: currentChunk,
				start: start,
				end: end
			})
		);

		// Затем отправляем бинарные данные
		ws.send(chunkData);

		currentChunk++;

		// Отправляем следующий чанк с задержкой
		setTimeout(sendNextChunk, 5);
	}

	sendNextChunk();
}

// Рассылка количества онлайн пользователей
function broadcastOnlineCount() {
	const message = JSON.stringify({
		type: "onlineCount",
		count: onlineUsers.size
	});

	wss.clients.forEach(client => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(message);
		}
	});
}

// Проверка кулдауна
function canPlacePixel(userId) {
	const user = Array.from(onlineUsers.values()).find(u => u.id === userId);
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

// Обработка размещения пикселя
function handlePlacePixel(ws, data) {
	const user = onlineUsers.get(ws);
	if (!user) {
		ws.send(
			JSON.stringify({
				type: "error",
				message: "User not found"
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
				message: `Please wait ${Math.ceil(timeLeft / 1000)} seconds`
			})
		);
		return;
	}

	// Проверка границ и цвета
	if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
		ws.send(
			JSON.stringify({
				type: "error",
				message: `Coordinates out of bounds (0-${CANVAS_WIDTH - 1}, 0-${CANVAS_HEIGHT - 1})`
			})
		);
		return;
	}

	// Расширяем проверку цвета для 40 цветов (0-39)
	if (color < 0 || color > 39) {
		ws.send(
			JSON.stringify({
				type: "error",
				message: "Color index must be between 0 and 39"
			})
		);
		return;
	}

	// Обновляем холст
	const index = y * CANVAS_WIDTH + x;
	const oldColor = canvas.pixels[index];
	canvas.pixels[index] = color;
	totalPixelsPlaced++;
	pixelHistory.push(now);
	pixelHistory = pixelHistory.filter(t => now - t < 300000); // Храним 5 минут истории

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
		timestamp: now
	});

	// Рассылаем всем подключенным клиентам
	wss.clients.forEach(client => {
		if (client !== ws && client.readyState === WebSocket.OPEN) {
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
			oldColor,
			cooldown: COOLDOWN_MS,
			timeLeft: COOLDOWN_MS,
			timestamp: now,
			message: `Pixel placed at (${x}, ${y})`
		})
	);

	console.log(`🎨 ${user.id} placed pixel at (${x}, ${y}) color ${color}`);
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
		lastPixelTime: 0
	});

	// Отправляем приветствие с информацией о холсте
	ws.send(
		JSON.stringify({
			type: "welcome",
			userId: userId,
			canvas: {
				width: CANVAS_WIDTH,
				height: CANVAS_HEIGHT,
				version: canvas.version,
				paletteSize: 40 // Указываем количество цветов
			},
			online: onlineUsers.size,
			cooldown: COOLDOWN_MS,
			totalPixels: totalPixelsPlaced,
			message: "Welcome to PixelBattle Mega Canvas! Loading pixels..."
		})
	);

	// Начинаем отправку холста по частям
	sendCanvasChunks(ws);

	// Рассылаем обновление онлайн-статуса
	broadcastOnlineCount();

	// Обработка входящих сообщений
	ws.on("message", message => {
		try {
			const data = JSON.parse(message);

			switch (data.type) {
				case "placePixel":
					handlePlacePixel(ws, data);
					break;

				case "getCanvas":
					sendCanvasChunks(ws, data.chunkIndex || 0);
					break;

				case "ping":
					ws.send(
						JSON.stringify({
							type: "pong",
							timestamp: Date.now()
						})
					);
					break;

					case "getOnline" :
					ws.send(
						JSON.stringify({
							type: "onlineCount",
							count: onlineUsers.size
						})
					);
					break;

				case "requestChunk":
					const { chunkIndex } = data;
					const start = chunkIndex * CHUNK_SIZE;
					const end = Math.min(start + CHUNK_SIZE, CANVAS_WIDTH * CANVAS_HEIGHT);
					const chunkData = canvas.pixels.slice(start, end);

					ws.send(
						JSON.stringify({
							type: "canvasChunk",
							chunkIndex,
							totalChunks: Math.ceil((CANVAS_WIDTH * CANVAS_HEIGHT) / CHUNK_SIZE),
							start,
							end,
							data: chunkData.toString("base64")
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
					message: "Invalid message format"
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
	ws.on("error", error => {
		console.error(`⚠️ WebSocket error for ${userId}:`, error.message);
		onlineUsers.delete(ws);
		broadcastOnlineCount();
	});
});

// Запуск сервера
server.listen(PORT, "0.0.0.0", async () => {
	console.log(`\n🚀 Starting PixelBattle Server v3.0...`);

	// Пытаемся загрузить холст из файла
	const loaded = await loadCanvas();
	if (!loaded) {
		console.log("📝 Creating new canvas...");
		initCanvas();
	}

	console.log(`
✅ SERVER STARTED SUCCESSFULLY!
📡 WebSocket: ws://localhost:${PORT}/ws
🌐 HTTP:      http://localhost:${PORT}
📊 Status:    http://localhost:${PORT}/api/stats

🎨 Canvas:    ${CANVAS_WIDTH}x${CANVAS_HEIGHT} (${(CANVAS_WIDTH * CANVAS_HEIGHT).toLocaleString()} pixels)
⏱️  Cooldown: ${COOLDOWN_MS / 1000}s
💾 Storage:   ${DATA_DIR}/

👥 Current online: 0
🧮 Total pixels: ${totalPixelsPlaced}
💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB
    `);
});

// Автосохранение (создаем бекап только каждый час)
let lastBackupTime = 0;
const BACKUP_INTERVAL = 3600000; // 1 час

setInterval(async () => {
	const now = Date.now();
	const shouldCreateBackup = now - lastBackupTime >= BACKUP_INTERVAL;

	await saveCanvas(shouldCreateBackup);

	if (shouldCreateBackup) {
		lastBackupTime = now;
	}

	console.log(`💾 Auto-save | Online: ${onlineUsers.size} | Pixels: ${totalPixelsPlaced} | Rate: ${pixelHistory.filter(t => Date.now() - t < 60000).length}/min`);
}, SAVE_INTERVAL);

// Создание снапшотов каждый час
setInterval(() => {
	createSnapshot();
}, 3600000);

// Очистка старых backup'ов (оставляем последние 10)
setInterval(() => {
	try {
		const files = fs
			.readdirSync(BACKUPS_DIR)
			.filter(f => f.startsWith("backup_"))
			.map(f => ({
				name: f,
				time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime()
			}))
			.sort((a, b) => b.time - a.time);

		files.slice(10).forEach(file => {
			fs.unlinkSync(path.join(BACKUPS_DIR, file.name));
		});
	} catch (error) {
		console.error("Error cleaning backups:", error.message);
	}
}, 3600000);

// Обработка завершения работы
process.on("SIGINT", async () => {
	console.log("\n\n🛑 Stopping server...");

	console.log("💾 Saving canvas...");
	await saveCanvas();

	console.log(`✅ Final statistics: ${totalPixelsPlaced} total pixels`);
	console.log("👋 Goodbye!");
	process.exit(0);
});

// Мониторинг памяти
setInterval(() => {
	const mem = process.memoryUsage();
	const usedMB = Math.round(mem.heapUsed / 1024 / 1024);
	const totalMB = Math.round(mem.heapTotal / 1024 / 1024);

	if (usedMB > 1024) {
		// Предупреждение при использовании >1GB
		console.warn(`⚠️  High memory usage: ${usedMB}MB / ${totalMB}MB`);
	}
}, 30000);

function getColorPalette() {
	return [
		"#000000",
		"#1A1A1A",
		"#333333",
		"#4D4D4D",
		"#666666",
		"#808080",
		"#999999",
		"#B3B3B3",
		"#CCCCCC",
		"#E6E6E6",
		"#FFFFFF",
		"#FF4444",
		"#FF8844",
		"#FFCC44",
		"#FFFF44",
		"#CCFF44",
		"#88FF44",
		"#44FF44",
		"#44FF88",
		"#44FFCC",
		"#44FFFF",
		"#44CCFF",
		"#4488FF",
		"#4444FF",
		"#8844FF",
		"#CC44FF",
		"#FF44FF",
		"#FF44CC",
		"#FF4488",
		"#FF4444",
		"#FF0000",
		"#00FF00",
		"#0000FF",
		"#FFFF00",
		"#FF00FF",
		"#00FFFF",
		"#FFA500",
		"#800080",
		"#008080",
		"#FFC0CB"
	];
}
