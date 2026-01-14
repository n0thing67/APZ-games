let tg = window.Telegram.WebApp;
tg.expand();

// Хранилище очков по уровням
let levelScores = {
    1: 0,
    2: 0,
    3: 0,
    4: 0
};

let levelStartTime = 0; // Для засекания времени

// ==========================================
// НАВИГАЦИЯ
// ==========================================
function startGame(level) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

    levelStartTime = Date.now(); // Засекаем время старта уровня

    if (level === 1) {
        document.getElementById('screen-level1').classList.add('active');
        initPuzzle();
    } else if (level === 2) {
        document.getElementById('screen-level2').classList.add('active');
        initJumper();
    } else if (level === 3) {
        document.getElementById('screen-level3').classList.add('active');
        init2048();
    } else if (level === 4) {
        document.getElementById('screen-level4').classList.add('active');
        initQuiz();
    }
}

// ==========================================
// УРОВЕНЬ 1: ПАЗЛ (Логика)
// ==========================================
let puzzleState = [1, 2, 3, 4, 5, 6, 7, 8, 9];
let selectedPieceNum = null;
let puzzleSolved = false;

function initPuzzle() {
    puzzleState.sort(() => Math.random() - 0.5);
    createPuzzleElements();
    updatePuzzlePositions();
}

function createPuzzleElements() {
    const board = document.getElementById('puzzle-board');
    board.innerHTML = '';
    for (let i = 1; i <= 9; i++) {
        const div = document.createElement('div');
        div.className = 'puzzle-piece';
        div.id = `piece-${i}`;
        div.style.backgroundImage = `url('assets/${i}.jpg')`;
        div.onclick = () => handlePieceClick(i);
        board.appendChild(div);
    }
}

function updatePuzzlePositions() {
    puzzleState.forEach((pieceNum, index) => {
        const div = document.getElementById(`piece-${pieceNum}`);
        const row = Math.floor(index / 3);
        const col = index % 3;
        div.style.top = `${row * 33.33}%`;
        div.style.left = `${col * 33.33}%`;
        if (selectedPieceNum === pieceNum) div.classList.add('selected');
        else div.classList.remove('selected');
    });
    checkPuzzleWin();
}

function handlePieceClick(clickedNum) {
    if (puzzleSolved) return;
    if (selectedPieceNum === null) {
        selectedPieceNum = clickedNum;
        updatePuzzlePositions();
    } else {
        if (selectedPieceNum !== clickedNum) {
            const index1 = puzzleState.indexOf(selectedPieceNum);
            const index2 = puzzleState.indexOf(clickedNum);
            [puzzleState[index1], puzzleState[index2]] = [puzzleState[index2], puzzleState[index1]];
            selectedPieceNum = null;
            updatePuzzlePositions();
        } else {
            selectedPieceNum = null;
            updatePuzzlePositions();
        }
    }
}

function checkPuzzleWin() {
    const isWin = puzzleState.every((val, index) => val === index + 1);
    if (isWin) {
        puzzleSolved = true;
        const status = document.getElementById('puzzle-status');
        status.textContent = "✅ Логотип собран!";
        status.style.color = "#2ecc71";
        document.querySelectorAll('.puzzle-piece').forEach(el => {
            el.style.border = "none";
            el.style.borderRadius = "0";
            el.style.width = "33.5%";
            el.style.height = "33.5%";
            el.style.cursor = "default";
            el.classList.remove('selected');
        });

        // == ПОДСЧЕТ ОЧКОВ (УРОВЕНЬ 1) ==
        let timeSpent = (Date.now() - levelStartTime) / 1000;
        // Макс 1000, минус 5 очков за секунду. Минимум 100.
        levelScores[1] = Math.max(100, Math.floor(1000 - timeSpent * 5));

        document.getElementById('btn-next-2').classList.remove('hidden');
    }
}

// ==========================================
// УРОВЕНЬ 2: JUMP GAME
// ==========================================
let doodleGameLoop;
let ctx;
let canvasWidth = 320;
let canvasHeight = 480;

// ============================
// PERF: общие оптимизации
// ============================
// На телефонах с devicePixelRatio=3 канвас становится слишком тяжёлым (слишком много пикселей),
// что приводит к просадкам FPS. Ограничиваем DPR до 2 — визуально почти не заметно,
// но значительно разгружает GPU/CPU. Логику и картинки не меняем.
const MAX_DPR = 2;

const imgHero = new Image(); imgHero.src = 'assets/hero.png';
const imgPlatform = new Image(); imgPlatform.src = 'assets/platform.png';
const imgSpring = new Image(); imgSpring.src = 'assets/spring.png';
const imgPropeller = new Image(); imgPropeller.src = 'assets/propeller.png';
const imgJetpack = new Image(); imgJetpack.src = 'assets/jetpack.png';
const imgPart = new Image(); imgPart.src = 'assets/part.png';

// Предзагрузка/декодирование изображений для снижения фризов на телефонах
const __doodleImgs = [imgHero, imgPlatform, imgSpring, imgPropeller, imgJetpack, imgPart];
__doodleImgs.forEach(img => {
    img._ready = (img.complete && img.naturalWidth !== 0);
    // decode может ускорить первое появление, особенно на мобильных
    if (img.decode) { img.decode().catch(() => {}); }
    img.addEventListener('load', () => {
        img._ready = true;
        if (img.decode) { img.decode().catch(() => {}); }
    }, { once: true });
});


const TOTAL_ITEMS = 12;
const GRAVITY = 0.25;
const JUMP_FORCE = -9;
const MOVE_SPEED = 5;

// РАЗМЕРЫ
const HERO_SIZE = 80;
const PLATFORM_WIDTH = 100;
const PLATFORM_HEIGHT = 80;

const SPRING_WIDTH = 60; const SPRING_HEIGHT = 50;
const PROPELLER_WIDTH = 60; const PROPELLER_HEIGHT = 50;
const JETPACK_WIDTH = 60; const JETPACK_HEIGHT = 60;

const SPRING_FORCE = -16;
const PROPELLER_FORCE = -25;
const JETPACK_FORCE = -45;

let platforms = [];
let items = [];
let player = { x: 0, y: 0, width: HERO_SIZE, height: HERO_SIZE, vx: 0, vy: 0, isDead: false, equipment: null };

let itemsCollected = 0;
let keys = { left: false, right: false };
let scoreEl;
let timerEl;
let gameActive = false;
let gameStartTime = 0;

// Чтобы не навешивать обработчики по 5 раз при повторном заходе на уровень
let doodleControlsBound = false;
let doodleCanvasRef = null;

// Throttle для touchmove через requestAnimationFrame (уменьшаем нагрузку)
let touchRAF = 0;
let pendingTouchSide = 0; // -1 = left, +1 = right

// Кнопки управления (кружочки снизу)
let doodleBtnsBound = false;
let doodleControlsEl = null;

function setDoodleControlsState(state) {
    if (!doodleControlsEl) doodleControlsEl = document.getElementById('doodle-controls');
    if (!doodleControlsEl) return;
    doodleControlsEl.classList.remove('controls-hidden', 'controls-hint');
    if (state === 'hidden') {
        doodleControlsEl.classList.add('controls-hidden');
    } else if (state === 'hint') {
        doodleControlsEl.classList.add('controls-hint');
    }
}


function initJumper() {
    // На случай повторного входа на уровень — останавливаем прошлый цикл
    gameActive = false;
    if (doodleGameLoop) cancelAnimationFrame(doodleGameLoop);

    doodleControlsEl = document.getElementById('doodle-controls');

    document.getElementById('doodle-container').style.display = 'block';
    const ui = document.getElementById('doodle-ui');
    ui.style.display = 'flex';
    document.getElementById('factory-gate-container').style.display = 'none';
    ui.querySelector('h2').textContent = `Собери детали`;
    document.getElementById('doodle-score').textContent = "0";
    document.getElementById('doodle-timer').textContent = "⏱ 00:00";

    const container = document.getElementById('doodle-container');
    container.classList.remove('game-running');
    document.getElementById('game-over-overlay').classList.remove('visible');
    document.getElementById('victory-overlay').classList.remove('visible');
    document.getElementById('doodle-start-msg').style.display = 'flex';

    // Подсказка управления: стрелки пульсируют на стартовом экране
    setDoodleControlsState('hint');

    // Сбрасываем управление, чтобы не было "залипания" после прошлой сессии
    keys.left = false;
    keys.right = false;
    pendingTouchSide = 0;
    if (touchRAF) { cancelAnimationFrame(touchRAF); touchRAF = 0; }

    // === ИСПРАВЛЕНИЕ КАЧЕСТВА (HiDPI) ===

    // 1. Берем логические размеры контейнера (CSS-пиксели)
    canvasWidth = container.offsetWidth;
    canvasHeight = container.offsetHeight;

    const canvas = document.getElementById('doodle-canvas');
    doodleCanvasRef = canvas;
    ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

    // 2. Узнаем плотность пикселей устройства (на ПК = 1, на iPhone = 2 или 3)
    const dpr = Math.min((window.devicePixelRatio || 1), MAX_DPR);

    // 3. Устанавливаем РЕАЛЬНОЕ разрешение холста (умножаем на плотность)
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;

    // 4. Фиксируем ВИЗУАЛЬНЫЙ размер через CSS (чтобы холст не стал огромным на экране)
    canvas.style.width = canvasWidth + "px";
    canvas.style.height = canvasHeight + "px";

    // 5. ВАЖНО: сбрасываем transform, иначе при повторной инициализации масштаб накапливается
    // (что даёт мыло и лишнюю нагрузку).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Включаем сглаживание (или выключаем, если хочешь пиксель-арт)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    scoreEl = document.getElementById('doodle-score');
    timerEl = document.getElementById('doodle-timer');
    setupControls(canvas);
}

function setupControls(canvas) {
    // Клавиатура: лёгкий контроль для ПК
    window.onkeydown = (e) => {
        if (e.code === 'ArrowLeft') keys.left = true;
        if (e.code === 'ArrowRight') keys.right = true;
    };
    window.onkeyup = (e) => {
        if (e.code === 'ArrowLeft') keys.left = false;
        if (e.code === 'ArrowRight') keys.right = false;
    };

    // Touch: навешиваем обработчики один раз, чтобы не плодить слушатели при повторном запуске
    if (doodleControlsBound) return;
    doodleControlsBound = true;

    const onTouchStartMove = (e) => {
        e.preventDefault();
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        const rect = canvas.getBoundingClientRect();
        pendingTouchSide = (touch.clientX - rect.left < rect.width / 2) ? -1 : 1;
        if (!touchRAF) {
            touchRAF = requestAnimationFrame(() => {
                touchRAF = 0;
                if (pendingTouchSide < 0) {
                    keys.left = true; keys.right = false;
                } else {
                    keys.left = false; keys.right = true;
                }
            });
        }
    };

    const onTouchEnd = (e) => {
        e.preventDefault();
        keys.left = false;
        keys.right = false;
        pendingTouchSide = 0;
        // ВАЖНО: если rAF уже запланирован, отменяем, иначе он может снова включить направление
        if (touchRAF) { cancelAnimationFrame(touchRAF); touchRAF = 0; }
    };

    canvas.addEventListener('touchstart', onTouchStartMove, { passive: false });
    canvas.addEventListener('touchmove', onTouchStartMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });

    // --- Кнопки-стрелки снизу (для детей интуитивнее) ---
    if (!doodleBtnsBound) {
        doodleBtnsBound = true;
        const btnL = document.getElementById('doodle-btn-left');
        const btnR = document.getElementById('doodle-btn-right');

        const pressLeft = (e) => {
            e.preventDefault();
            keys.left = true;
            keys.right = false;
            pendingTouchSide = -1;
            if (touchRAF) { cancelAnimationFrame(touchRAF); touchRAF = 0; }
        };
        const pressRight = (e) => {
            e.preventDefault();
            keys.left = false;
            keys.right = true;
            pendingTouchSide = 1;
            if (touchRAF) { cancelAnimationFrame(touchRAF); touchRAF = 0; }
        };
        const releaseBoth = (e) => {
            if (e) e.preventDefault();
            keys.left = false;
            keys.right = false;
            pendingTouchSide = 0;
            if (touchRAF) { cancelAnimationFrame(touchRAF); touchRAF = 0; }
        };

        // Touch
        btnL.addEventListener('touchstart', pressLeft, { passive: false });
        btnL.addEventListener('touchend', releaseBoth, { passive: false });
        btnL.addEventListener('touchcancel', releaseBoth, { passive: false });
        btnR.addEventListener('touchstart', pressRight, { passive: false });
        btnR.addEventListener('touchend', releaseBoth, { passive: false });
        btnR.addEventListener('touchcancel', releaseBoth, { passive: false });

        // Mouse (на ПК тоже удобно)
        btnL.addEventListener('mousedown', pressLeft);
        btnL.addEventListener('mouseup', releaseBoth);
        btnL.addEventListener('mouseleave', releaseBoth);
        btnR.addEventListener('mousedown', pressRight);
        btnR.addEventListener('mouseup', releaseBoth);
        btnR.addEventListener('mouseleave', releaseBoth);
    }
}

function startDoodleLoop() {
    document.getElementById('doodle-container').classList.add('game-running');
    document.getElementById('doodle-start-msg').style.display = 'none';
    // Во время игры стрелки видны без подсказки
    setDoodleControlsState('play');
    document.getElementById('game-over-overlay').classList.remove('visible');
    resetGame();
    gameActive = true;

    // Сбрасываем управление при старте, чтобы не было "залипания"
    keys.left = false;
    keys.right = false;
    pendingTouchSide = 0;
    if (touchRAF) { cancelAnimationFrame(touchRAF); touchRAF = 0; }

    gameStartTime = Date.now();
    levelStartTime = Date.now();
    update();
}

function resetGame() {
    itemsCollected = 0;
    scoreEl.textContent = "0";

    // Ставим игрока ровно на стартовую платформу
    // Y платформы = canvasHeight - 60
    // Y игрока = Y платформы - HERO_SIZE
    player.x = canvasWidth / 2 - player.width / 2;
    player.y = (canvasHeight - 60) - HERO_SIZE - 15;

    player.vx = 0;
    player.vy = JUMP_FORCE;
    player.isDead = false;
    player.equipment = null;
    platforms = [];
    items = [];

    let currentY = canvasHeight - 60;
    platforms.push({ x: canvasWidth / 2 - PLATFORM_WIDTH / 2, y: currentY, width: PLATFORM_WIDTH, height: PLATFORM_HEIGHT, type: 'normal', bonus: null });
    for (let i = 0; i < 7; i++) {
        let gap = 110 + Math.random() * 40;
        currentY -= gap;
        generatePlatformAt(currentY);
    }
}

function generatePlatformAt(yPos) {
    const width = PLATFORM_WIDTH;
    const x = Math.random() * (canvasWidth - width);
    let bonusType = null;
    let spawnItem = false;
    const rand = Math.random();
    if (rand < 0.02) bonusType = 'jetpack';
    else if (rand < 0.06) bonusType = 'propeller';
    else if (rand < 0.14) bonusType = 'spring';
    else { if (Math.random() < 0.15) spawnItem = true; }

    platforms.push({ x, y: yPos, width, height: PLATFORM_HEIGHT, bonus: bonusType });

    // Спавним деталь ниже (ближе к платформе)
    if (spawnItem) items.push({ x: x + width / 2, y: yPos - 10, collected: false });
}

function update() {
    if (!gameActive) return;
    const now = Date.now();
    const elapsed = Math.floor((now - gameStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timerEl.textContent = `⏱ ${minutes}:${seconds}`;

    if (keys.left) player.vx = -MOVE_SPEED; else if (keys.right) player.vx = MOVE_SPEED; else player.vx = 0;
    player.x += player.vx; player.vy += GRAVITY; player.y += player.vy;
    if (player.x + player.width < 0) player.x = canvasWidth;
    if (player.x > canvasWidth) player.x = -player.width;
    if (player.y < canvasHeight * 0.45 && player.vy < 0) {
        player.y = canvasHeight * 0.45;
        let shift = -player.vy;
        for (let i = 0; i < platforms.length; i++) platforms[i].y += shift;
        for (let i = 0; i < items.length; i++) items[i].y += shift;
    }
    for (let pi = 0; pi < platforms.length; pi++) {
        const p = platforms[pi];
        if (p.y > canvasHeight) {
            let highestY = canvasHeight;
            for (let j = 0; j < platforms.length; j++) {
                const py = platforms[j].y;
                if (py < highestY) highestY = py;
            }
            const gap = 110 + Math.random() * 40;
            p.y = highestY - gap;
            p.x = Math.random() * (canvasWidth - p.width);
            p.bonus = null;
            const r = Math.random();
            if (r < 0.02) p.bonus = 'jetpack';
            else if (r < 0.06) p.bonus = 'propeller';
            else if (r < 0.14) p.bonus = 'spring';

            // Спавним деталь ниже при респавне
            if (p.bonus === null && Math.random() < 0.15) {
                items.push({ x: p.x + p.width / 2, y: p.y - 10, collected: false });
            }
        }
    }
    // PERF: фильтрация без создания нового массива (меньше нагрузка на GC)
    const cutoff = canvasHeight + 100;
    let write = 0;
    for (let read = 0; read < items.length; read++) {
        const it = items[read];
        if (it.y < cutoff) items[write++] = it;
    }
    items.length = write;
    if (player.vy > 0) {
        const px1 = player.x + player.width * 0.3;
        const px2 = player.x + player.width * 0.7;
        const pyBottom = player.y + player.height;
        const vy = player.vy;
        for (let i = 0; i < platforms.length; i++) {
            const p = platforms[i];
            if (px2 > p.x && px1 < p.x + p.width && pyBottom > p.y && pyBottom < p.y + p.height + vy + 2) {
                if (p.bonus === 'spring') player.vy = SPRING_FORCE;
                else if (p.bonus === 'propeller') { player.vy = PROPELLER_FORCE; player.equipment = 'propeller'; }
                else if (p.bonus === 'jetpack') { player.vy = JETPACK_FORCE; player.equipment = 'jetpack'; }
                else {
                    player.vy = JUMP_FORCE;
                    if (player.equipment && player.vy > -10) player.equipment = null;
                }
                break;
            }
        }
    }
    if (player.vy > 0) player.equipment = null;
    // Коллизии: без sqrt (быстрее)
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const R2 = 60 * 60;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.collected) continue;
        const dx = cx - item.x;
        const dy = cy - item.y;
        if ((dx * dx + dy * dy) < R2) {
            item.collected = true;
            itemsCollected++;
            scoreEl.textContent = itemsCollected;
            // Микро-анимацию оставляем, но без лишних reflow: через rAF
            scoreEl.style.transform = "scale(1.5)";
            requestAnimationFrame(() => {
                setTimeout(() => { scoreEl.style.transform = "scale(1)"; }, 200);
            });
            if (itemsCollected >= TOTAL_ITEMS) {
                showVictoryLevel2();
                break;
            }
        }
    }
    if (player.y > canvasHeight) { showGameOver(); return; }
    draw();
    if (gameActive) doodleGameLoop = requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Платформы
    for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (imgPlatform._ready) ctx.drawImage(imgPlatform, p.x, p.y, p.width, p.height);
        else { ctx.fillStyle = '#27ae60'; ctx.fillRect(p.x, p.y, p.width, p.height); }

        if (p.bonus === 'spring') { const bx = p.x + (PLATFORM_WIDTH - SPRING_WIDTH) / 2; const by = p.y - SPRING_HEIGHT + 46; drawBonus(imgSpring, bx, by, SPRING_WIDTH, SPRING_HEIGHT); }
        else if (p.bonus === 'propeller') { const bx = p.x + (PLATFORM_WIDTH - PROPELLER_WIDTH) / 2; const by = p.y - PROPELLER_HEIGHT + 15; drawBonus(imgPropeller, bx, by, PROPELLER_WIDTH, PROPELLER_HEIGHT); }
        else if (p.bonus === 'jetpack') { const bx = p.x + (PLATFORM_WIDTH - JETPACK_WIDTH) / 2; const by = p.y - JETPACK_HEIGHT + 20; drawBonus(imgJetpack, bx, by, JETPACK_WIDTH, JETPACK_HEIGHT); }
    }

    // Детали
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.collected) continue;
        if (imgPart._ready) ctx.drawImage(imgPart, item.x - 30, item.y - 30, 60, 60);
        else { ctx.beginPath(); ctx.arc(item.x, item.y, 20, 0, Math.PI * 2); ctx.fillStyle = '#3498db'; ctx.fill(); }
    }

    // Игрок (СМЕЩЕНИЕ ВНИЗ)
    // Мы добавляем +20 пикселей к Y, чтобы компенсировать зазор
    const visualOffset = 40;

    if (imgHero._ready) {
         if (player.equipment === 'jetpack') {
            // Рисуем ОДИН большой джетпак по центру
            const jpWidth = 90;  // Ширина джетпака
            const jpHeight = 100; // Высота джетпака

            // Центрируем относительно героя
            const jpX = player.x + (player.width - jpWidth) / 2;
            const jpY = player.y + 10 + visualOffset; // Чуть ниже плеч

            ctx.drawImage(imgJetpack, jpX, jpY, jpWidth, jpHeight);

            // Огонь (по центру джетпака)
            ctx.fillStyle = 'orange';
            ctx.beginPath();
            ctx.moveTo(player.x + player.width / 2 - 10, player.y + 70 + visualOffset);
            ctx.lineTo(player.x + player.width / 2 + 10, player.y + 70 + visualOffset);
            ctx.fill();
        }

        // ГЕРОЙ (Рисуется ПОВЕРХ джетпака)
        ctx.drawImage(imgHero, player.x, player.y + visualOffset, player.width, player.height);

        if (player.equipment === 'propeller') {
            // Пропеллер тоже опускаем
            ctx.drawImage(imgPropeller, player.x + 11, player.y - 25 + visualOffset, 60, 50);
        }
    } else {
        ctx.fillStyle = '#e67e22';
        // Если картинки нет, квадрат тоже рисуем со смещением, чтобы видеть хитбокс
        ctx.fillRect(player.x, player.y + visualOffset, player.width, player.height);
    }
}
function drawBonus(img, x, y, w, h) { if (img._ready) ctx.drawImage(img, x, y, w, h); else { ctx.fillStyle = 'red'; ctx.fillRect(x, y, w, h); } }
function showGameOver() { gameActive = false; cancelAnimationFrame(doodleGameLoop);
    setDoodleControlsState('hidden');
    document.getElementById('game-over-overlay').classList.add('visible'); }

function showVictoryLevel2() {
    gameActive = false;
    cancelAnimationFrame(doodleGameLoop);
    setDoodleControlsState('hidden');

    // Сбрасываем управление на всякий случай
    keys.left = false; keys.right = false; pendingTouchSide = 0;
    if (touchRAF) { cancelAnimationFrame(touchRAF); touchRAF = 0; }
    let timeSpent = (Date.now() - levelStartTime) / 1000;
    levelScores[2] = Math.max(100, Math.floor(1500 - timeSpent * 5));
    document.getElementById('victory-overlay').classList.add('visible');
    setTimeout(() => { document.getElementById('victory-overlay').classList.remove('visible'); finishLevel2(); }, 2000);
}

function finishLevel2() {
    document.getElementById('doodle-container').style.display = 'none';
    document.getElementById('doodle-ui').style.display = 'none';
    const gateContainer = document.getElementById('factory-gate-container');
    gateContainer.style.display = 'block';

    // Плавно проявляем блок (CSS transition)
    requestAnimationFrame(() => gateContainer.classList.add('gate-visible'));

    // Затем включаем "свет" на картинке
    setTimeout(() => {
        gateContainer.classList.add('lights-on');
        setTimeout(() => {
            const btn = document.getElementById('btn-next-3');
            if(btn) { btn.classList.remove('hidden'); btn.onclick = () => startGame(3); }
        }, 1000);
    }, 150);
}

// ==========================================
// УРОВЕНЬ 3: 2048 (ОПТИМИЗИРОВАННАЯ ВЕРСИЯ)
// ==========================================

// PERF: предзагрузка и декодирование картинок плиток.
// Основная причина "долго грузит картинки" на телефоне — декодирование изображений
// в момент первого появления каждой плитки. Предзагружаем один раз заранее.
let tileAssets2048Ready = false;
const tileAssets2048 = {
    2: 'assets/bolt.png',
    4: 'assets/nut.png',
    8: 'assets/gear.png',
    16: 'assets/chip.png',
    32: 'assets/board.png',
    64: 'assets/case.png',
    128: 'assets/sensor.png',
    256: 'assets/device.png'
};

function preload2048Assets() {
    if (tileAssets2048Ready) return;
    tileAssets2048Ready = true;

    // Загружаем/декодируем в фоне, без блокировки игры
    Object.values(tileAssets2048).forEach((src) => {
        const img = new Image();
        img.src = src;
        // decode() ускоряет момент первого рендера (где поддерживается)
        if (img.decode) img.decode().catch(() => {});
    });
}

// Запускаем предзагрузку сразу (скрипт подключен внизу страницы, DOM уже есть)
preload2048Assets();

const SIZE = 4;
// Предвычисляем позиции для ускорения (чтобы не считать в цикле)
const TILE_OFFSET = 10;
const TILE_STEP = 72.5;
const TILE_POS = Array.from({ length: SIZE }, (_, i) => (TILE_OFFSET + i * TILE_STEP) + 'px');

// Кэшируем DOM элементы, чтобы не искать их каждый раз
const gridContainer = document.getElementById('grid-container');
const scoreEl2048 = document.getElementById('score-2048');
const overlay2048GameOver = document.getElementById('overlay-2048-gameover');
const overlay2048Victory = document.getElementById('overlay-2048-victory');
const btnNext4 = document.getElementById('btn-next-4');

// Чтобы не добавлять swipe-слушатели на каждую перезапуск-инициализацию 2048
let swipe2048Bound = false;
let touchStartX2048 = 0;
let touchStartY2048 = 0;

let board2048 = [];
let score2048 = 0;
let game2048Active = false;

// Переиспользуемый массив для пустых клеток (снижает нагрузку на GC)
const emptyCells = [];

function init2048() {
    preload2048Assets();
    score2048 = 0;
    game2048Active = true;
    scoreEl2048.textContent = '0';

    // Сброс UI
    btnNext4.classList.add('hidden');
    overlay2048GameOver.classList.remove('visible');
    overlay2048Victory.classList.remove('visible');

    gridContainer.innerHTML = '';

    // Создаем фоновые клетки один раз
    const fragment = document.createDocumentFragment();
    for(let r=0; r<SIZE; r++) {
        for(let c=0; c<SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.style.top = TILE_POS[r];
            cell.style.left = TILE_POS[c];
            fragment.appendChild(cell);
        }
    }
    gridContainer.appendChild(fragment);

    // Инициализация игрового поля
    board2048 = Array(SIZE);
    for(let r=0; r<SIZE; r++) board2048[r] = Array(SIZE).fill(null);

    addRandomTile();
    addRandomTile();

    setupSwipeListeners();
    document.onkeydown = handle2048Input;

    levelStartTime = Date.now();
}

function addRandomTile() {
    // Очищаем массив без создания нового
    emptyCells.length = 0;

    for(let r=0; r<SIZE; r++) {
        for(let c=0; c<SIZE; c++) {
            if(board2048[r][c] === null) emptyCells.push({r, c});
        }
    }

    if(emptyCells.length > 0) {
        const rand = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const val = Math.random() < 0.9 ? 2 : 4;
        createTile(rand.r, rand.c, val);
    }
}

function createTile(r, c, val) {
    const tileDom = document.createElement('div');
    tileDom.className = `tile tile-${val} tile-new`;
    // Используем предвычисленные позиции
    tileDom.style.top = TILE_POS[r];
    tileDom.style.left = TILE_POS[c];

    gridContainer.appendChild(tileDom);
    board2048[r][c] = { val: val, dom: tileDom, merged: false };
}

function handle2048Input(e) {
    if(!game2048Active) return;
    if(e.code === 'ArrowUp') moveTiles(-1, 0);
    else if(e.code === 'ArrowDown') moveTiles(1, 0);
    else if(e.code === 'ArrowLeft') moveTiles(0, -1);
    else if(e.code === 'ArrowRight') moveTiles(0, 1);
}

function moveTiles(dr, dc) {
    let moved = false;

    // Сброс флагов слияния
    for(let r=0; r<SIZE; r++)
        for(let c=0; c<SIZE; c++)
            if(board2048[r][c]) board2048[r][c].merged = false;

    const rStart = dr === 1 ? SIZE - 1 : 0;
    const rEnd = dr === 1 ? -1 : SIZE;
    const rStep = dr === 1 ? -1 : 1;
    const cStart = dc === 1 ? SIZE - 1 : 0;
    const cEnd = dc === 1 ? -1 : SIZE;
    const cStep = dc === 1 ? -1 : 1;

    for (let r = rStart; r !== rEnd; r += rStep) {
        for (let c = cStart; c !== cEnd; c += cStep) {
            const tile = board2048[r][c];
            if (!tile) continue;

            let nextR = r + dr;
            let nextC = c + dc;
            let targetR = r;
            let targetC = c;

            while(nextR >= 0 && nextR < SIZE && nextC >= 0 && nextC < SIZE) {
                const nextTile = board2048[nextR][nextC];
                if (!nextTile) {
                    targetR = nextR; targetC = nextC;
                } else if (nextTile.val === tile.val && !nextTile.merged) {
                    targetR = nextR; targetC = nextC;
                    break;
                } else { break; }
                nextR += dr; nextC += dc;
            }

            if (targetR !== r || targetC !== c) {
                const targetTile = board2048[targetR][targetC];

                if (!targetTile) {
                    board2048[r][c] = null;
                    board2048[targetR][targetC] = tile;
                    updateTilePosition(tile, targetR, targetC);
                    moved = true;
                } else if (targetTile.val === tile.val) {
                    board2048[r][c] = null;
                    updateTilePosition(tile, targetR, targetC);

                    targetTile.val *= 2;
                    targetTile.merged = true;
                    score2048 += targetTile.val;
                    scoreEl2048.textContent = score2048;

                    // Удаляем старую плитку после анимации
                    setTimeout(() => {
                        if(tile.dom.parentNode) tile.dom.remove();
                        // Обновляем вид целевой плитки
                        targetTile.dom.className = `tile tile-${targetTile.val} tile-merged`;
                    }, 150);
                    moved = true;
                }
            }
        }
    }

    if (moved) {
        setTimeout(() => {
            addRandomTile();
            check2048Status();
        }, 150);
    } else {
        check2048Status();
    }
}

function updateTilePosition(tile, r, c) {
    // Используем кэшированные значения координат
    tile.dom.style.top = TILE_POS[r];
    tile.dom.style.left = TILE_POS[c];
}

function check2048Status() {
    // 1. Проверка победы
    for(let r=0; r<SIZE; r++) {
        for(let c=0; c<SIZE; c++) {
            const tile = board2048[r][c];
            if(tile && tile.val >= 256 && game2048Active) {
                showVictory2048();
                return;
            }
        }
    }

    // 2. Проверка поражения
    // Сначала ищем пустые (быстрая проверка)
    for(let r=0; r<SIZE; r++) {
        for(let c=0; c<SIZE; c++) {
            if(board2048[r][c] === null) return; // Есть ход
        }
    }

    // Если пустых нет, ищем слияния
    for(let r=0; r<SIZE; r++) {
        for(let c=0; c<SIZE; c++) {
            const val = board2048[r][c].val;
            if(c < SIZE-1 && board2048[r][c+1].val === val) return;
            if(r < SIZE-1 && board2048[r+1][c].val === val) return;
        }
    }

    // Ходов нет
    showGameOver2048();
}

function showVictory2048() {
    game2048Active = false;

    // Подсчет очков
    let timeSpent = (Date.now() - levelStartTime) / 1000;
    levelScores[3] = Math.max(100, Math.floor(2000 - timeSpent * 2));

    overlay2048Victory.classList.add('visible');
    setTimeout(() => {
        overlay2048Victory.classList.remove('visible');
        btnNext4.classList.remove('hidden');
    }, 2000);
}

function showGameOver2048() {
    game2048Active = false;
    overlay2048GameOver.classList.add('visible');
}

function setupSwipeListeners() {
    if (swipe2048Bound) return;
    swipe2048Bound = true;

    // Используем уже найденный элемент
    const grid = gridContainer;

    grid.addEventListener('touchstart', function(e) {
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        touchStartX2048 = t.screenX;
        touchStartY2048 = t.screenY;
        e.preventDefault();
    }, {passive: false});

    grid.addEventListener('touchend', function(e) {
        e.preventDefault();
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        let dx = t.screenX - touchStartX2048;
        let dy = t.screenY - touchStartY2048;

        if(Math.abs(dx) > Math.abs(dy)) {
            if(Math.abs(dx) > 30) dx > 0 ? moveTiles(0, 1) : moveTiles(0, -1);
        } else {
            if(Math.abs(dy) > 30) dy > 0 ? moveTiles(1, 0) : moveTiles(-1, 0);
        }
    }, {passive: false});
}


// ==========================================
// УРОВЕНЬ 4: КВИЗ
// ==========================================
const questions = [
    { q: "Что является символом безопасности на заводе?", answers: ["Кепка", "Каска", "Панамка"], correct: 1 },
    { q: "Что производит Арзамасский приборостроительный завод?", answers: ["Булочки", "Игрушки", "Сложные приборы"], correct: 2 },
    { q: "Какого цвета кнопка аварийной остановки?", answers: ["Красная", "Зеленая", "Синяя"], correct: 0 },
    { q: "Кто управляет современным станком ЧПУ?", answers: ["Робот", "Оператор", "Директор"], correct: 1 },
    { q: "Где находится завод АПЗ?", answers: ["г. Арзамас", "г. Москва", "на Луне"], correct: 0 },
    { q: "Чем измеряют размер детали с высокой точностью?", answers: ["Линейкой", "На глаз", "Штангенциркулем"], correct: 2 },
    { q: "Кто разрабатывает чертежи новых приборов?", answers: ["Повар", "Инженер-конструктор", "Водитель"], correct: 1 },
    { q: "Что делает конвейер на заводе?", answers: ["Танцует", "Перемещает детали", "Поет песни"], correct: 1 },
    { q: "Зачем на заводе нужны защитные очки?", answers: ["Для красоты", "Беречь глаза", "Чтобы лучше видеть"], correct: 1 },
    { q: "Как называется 3D-чертёж на компьютере?", answers: ["Модель", "Рисунок", "Картина"], correct: 0 }
];

let currentQuestionIndex = 0;
let questionStartTime = 0;

function initQuiz() {
    currentQuestionIndex = 0;
    levelScores[4] = 0;
    renderQuestion();
}

function renderQuestion() {
    const qData = questions[currentQuestionIndex];
    document.getElementById('question-text').textContent = qData.q;
    document.getElementById('quiz-progress').textContent = `Вопрос ${currentQuestionIndex + 1} из ${questions.length}`;
    const container = document.getElementById('answers-block');
    container.innerHTML = '';

    questionStartTime = Date.now(); // Засекаем время на вопрос

    qData.answers.forEach((answerText, index) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = answerText;
        btn.onclick = () => handleAnswerClick(btn, index, qData.correct);
        container.appendChild(btn);
    });
}

let isAnswering = false;

function handleAnswerClick(btn, index, correctIndex) {
    if (isAnswering) return;
    isAnswering = true;

    let timeSpent = (Date.now() - questionStartTime) / 1000;

    if (index === correctIndex) {
        btn.classList.add('correct');
        btn.innerHTML += ' ✅';
        let speedBonus = Math.max(0, 100 - timeSpent * 10);
        levelScores[4] += (200 + Math.floor(speedBonus));
    } else {
        btn.classList.add('wrong');
        btn.innerHTML += ' ❌';
        const buttons = document.querySelectorAll('.answer-btn');
        buttons[correctIndex].classList.add('correct');
    }

    // 1. Даем игроку 1.5 секунды осознать результат
    setTimeout(() => {
        const container = document.getElementById('quiz-container');

        // 2. Плавно растворяем текущий вопрос
        container.classList.add('quiz-hidden');

        // 3. Ждем 500мс (время анимации в CSS), пока он полностью исчезнет
        setTimeout(() => {
            isAnswering = false;
            currentQuestionIndex++;

            if (currentQuestionIndex < questions.length) {
                // Подменяем текст, пока его НЕ ВИДНО
                renderQuestion();

                // 4. Плавно проявляем новый вопрос
                container.classList.remove('quiz-hidden');
            } else {
                showFinalScreen();
            }
        }, 500); // Синхронизировано с CSS transition: 0.5s

    }, 1500);
}

function showFinalScreen() {
    document.getElementById('screen-level4').classList.remove('active');
    document.getElementById('screen-final').classList.add('active');

    // Заполняем таблицу
    document.getElementById('res-l1').textContent = levelScores[1];
    document.getElementById('res-l2').textContent = levelScores[2];
    document.getElementById('res-l3').textContent = levelScores[3];
    document.getElementById('res-l4').textContent = levelScores[4];

    // Итого
    let totalScore = levelScores[1] + levelScores[2] + levelScores[3] + levelScores[4];

    // Анимация итогового счета
    const scoreVal = document.getElementById('final-score-val');
    let displayScore = 0;
    const step = Math.ceil(totalScore / 50);

    const timer = setInterval(() => {
        displayScore += step;
        if (displayScore >= totalScore) {
            displayScore = totalScore;
            clearInterval(timer);
        }
        scoreVal.textContent = displayScore;
    }, 30);
}

// === ФИНАЛ: ОТПРАВКА ДАННЫХ ===
function closeApp() {
    // Отправляем общую сумму
    let totalScore = levelScores[1] + levelScores[2] + levelScores[3] + levelScores[4];
    tg.sendData(JSON.stringify({score: totalScore}));
    tg.close();
}
