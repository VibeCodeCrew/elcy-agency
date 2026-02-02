import * as THREE from 'three';

// --- КОНФИГУРАЦИЯ ---
const TRASH_COUNT = 150; 
const COLLISION_RADIUS = 4; 
const MOUSE_REPEL_RADIUS = 35; 

// НАСТРОЙКИ ВЕРСТКИ
const BASE_SIZE = 5; 
const MAX_ROW_WIDTH = 110; 
const LINE_HEIGHT = 8;
const AUTHOR_SCALE = 0.45;

// ОТФИЛЬТРОВАННЫЕ ЦИТАТЫ (DIGITAL & BUSINESS)
// === НАЧАЛО ВСТАВКИ: ЗАГРУЗКА ДАННЫХ ===
const API_URL = '/api/quotes'; // В проде заменишь на реальный домен

// Дефолтные цитаты на случай, если сервер упал
const fallbackQuotes = [
    { text: "Сервер недоступен но мы работаем", author: "Dev" },
    { text: "Ошибка подключения к API", author: "System" },
    { text: "Люди покупают не то что вы делаете", author: "Саймон Синек" },
    { text: "Контент огонь а социальные сети бензин", author: "Джей Баер" }
];

let quotes = [];

try {
    // Ждем ответа от сервера перед отрисовкой
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Network error');
    quotes = await response.json();
    
    // Защита от пустого массива
    if (!quotes || quotes.length === 0) quotes = fallbackQuotes;
    
} catch (e) {
    console.warn('⚠️ BACKEND OFFLINE. Using fallback data.', e);
    quotes = fallbackQuotes;
}
// === КОНЕЦ ВСТАВКИ ===

let currentQuoteIndex = Math.floor(Math.random() * quotes.length);
let mouseX = 0, mouseY = 0, normMouse = new THREE.Vector2();
let scene, camera, renderer;
let letterMeshes = [];
let isOrdered = false;

let blockTotalWidth = 0;
let blockTotalHeight = 0;

// --- ПРЕЛОАДЕР ---
const counter = document.getElementById('counter');
const preloader = document.getElementById('preloader');
let loadProgress = 0;

document.fonts.ready.then(() => {
    const loaderInterval = setInterval(() => {
        loadProgress += Math.floor(Math.random() * 10) + 1;
        if (loadProgress > 100) loadProgress = 100;
        counter.innerText = loadProgress + '%';
        if (loadProgress === 100) { 
            clearInterval(loaderInterval); 
            finishPreloader(); 
            initThree(); 
            animateThree();
        }
    }, 30);
});

function finishPreloader() {
     gsap.to(preloader, { y: '-100%', duration: 1, ease: "power4.inOut" });
}

// --- 2D CANVAS (СЕТКА) ---
const gridCanvas = document.getElementById('grid-canvas');
const ctxGrid = gridCanvas.getContext('2d');
let gridPoints = [];
const spacing = 60;

function resizeGrid() { gridCanvas.width = window.innerWidth; gridCanvas.height = window.innerHeight; initGrid(); }
function initGrid() {
    gridPoints = [];
    for (let x = 0; x < gridCanvas.width + spacing; x += spacing) {
        for (let y = 0; y < gridCanvas.height + spacing; y += spacing) {
            gridPoints.push({ x, y, ox: x, oy: y, vx: 0, vy: 0 });
        }
    }
}
function animateGrid() {
    ctxGrid.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    ctxGrid.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctxGrid.lineWidth = 1; ctxGrid.beginPath();
    for (let i = 0; i < gridPoints.length; i++) {
        const p = gridPoints[i];
        const dist = Math.hypot(p.x - mouseX, p.y - mouseY);
        if (dist < 200) {
            const angle = Math.atan2(p.y - mouseY, p.x - mouseX);
            const force = (200 - dist) / 200;
            p.vx += Math.cos(angle) * force * 2;
            p.vy += Math.sin(angle) * force * 2;
        }
        p.vx += (p.ox - p.x) * 0.05; p.vy += (p.oy - p.y) * 0.05;
        p.vx *= 0.9; p.vy *= 0.9;
        p.x += p.vx; p.y += p.vy;
        const right = gridPoints.find(n => Math.abs(n.ox - (p.ox + spacing)) < 1 && Math.abs(n.oy - p.oy) < 1);
        const bottom = gridPoints.find(n => Math.abs(n.ox - p.ox) < 1 && Math.abs(n.oy - (p.oy + spacing)) < 1);
        if (right) { ctxGrid.moveTo(p.x, p.y); ctxGrid.lineTo(right.x, right.y); }
        if (bottom) { ctxGrid.moveTo(p.x, p.y); ctxGrid.lineTo(bottom.x, bottom.y); }
    }
    ctxGrid.stroke();
    requestAnimationFrame(animateGrid);
}

// --- 3D SCENE ---
function initThree() {
    const container = document.getElementById('webgl-container');
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.008);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 70;
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); 
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);
    
    createLetters(quotes[currentQuoteIndex].text, quotes[currentQuoteIndex].author);
}

function createTextTexture(char, font) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    const fontSize = 400; 
    const fontStr = `900 ${fontSize}px "${font}"`; 
    context.font = fontStr;
    
    const textMetrics = context.measureText(char);
    const textWidth = textMetrics.width;
    const textHeight = fontSize * 1.2; 

    canvas.width = textWidth + 40; 
    canvas.height = textHeight;

    context.font = fontStr;
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(char.toUpperCase(), canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter; 
    texture.magFilter = THREE.LinearFilter;
    
    return {
        texture: texture,
        aspect: canvas.width / canvas.height
    };
}

function createLetters(text, authorName) {
    letterMeshes.forEach(m => { 
        scene.remove(m); 
        if(m.geometry) m.geometry.dispose();
        if(m.material) {
            if(m.material.map) m.material.map.dispose();
            m.material.dispose();
        }
    });
    letterMeshes = [];

    const upperText = text.toUpperCase();
    const words = upperText.split(' ');
    
    let wordObjects = []; 
    words.forEach(word => {
        let letters = [];
        let currentWordWidth = 0;
        for(let i=0; i<word.length; i++) {
            const char = word[i];
            const data = createTextTexture(char, 'Unbounded');
            const planeW = BASE_SIZE * data.aspect;
            const geometry = new THREE.PlaneGeometry(planeW, BASE_SIZE);
            const material = new THREE.MeshBasicMaterial({ 
                map: data.texture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.05 
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set((Math.random()-0.5)*140, (Math.random()-0.5)*90, (Math.random()-0.5)*60);
            mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
            letters.push({ mesh: mesh, width: planeW });
            currentWordWidth += planeW;
            if(i < word.length - 1) currentWordWidth += 0.5;
        }
        wordObjects.push({ letters: letters, width: currentWordWidth });
    });

    let lines = [];
    let currentLine = [];
    let currentLineWidth = 0;
    const spaceWidth = BASE_SIZE * 0.6; 

    wordObjects.forEach(wordObj => {
        if(currentLineWidth + wordObj.width > MAX_ROW_WIDTH && currentLine.length > 0) {
            lines.push({ words: currentLine, width: currentLineWidth });
            currentLine = [wordObj];
            currentLineWidth = wordObj.width;
        } else {
            if(currentLine.length > 0) currentLineWidth += spaceWidth;
            currentLine.push(wordObj);
            currentLineWidth += wordObj.width;
        }
    });
    if(currentLine.length > 0) lines.push({ words: currentLine, width: currentLineWidth });

    const authorUpper = "// " + authorName.toUpperCase();
    let authorLetters = [];
    let authorWidth = 0;
    for(let i=0; i<authorUpper.length; i++) {
        const char = authorUpper[i];
        if(char === ' ') { authorWidth += BASE_SIZE * 0.3 * AUTHOR_SCALE; continue; }
        
        const data = createTextTexture(char, 'Unbounded');
        const planeW = BASE_SIZE * data.aspect;
        const geometry = new THREE.PlaneGeometry(planeW, BASE_SIZE);
        const material = new THREE.MeshBasicMaterial({ 
            map: data.texture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.05,
            color: 0xaaaaaa 
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((Math.random()-0.5)*140, (Math.random()-0.5)*90, (Math.random()-0.5)*60);
        mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        
        authorLetters.push({ mesh: mesh, width: planeW });
        authorWidth += (planeW * AUTHOR_SCALE) + 0.5; 
    }
    
    const quoteHeight = lines.length * LINE_HEIGHT;
    const authorGap = LINE_HEIGHT * 1.5; 
    blockTotalHeight = quoteHeight + authorGap; 
    blockTotalWidth = MAX_ROW_WIDTH;

    let startY = (blockTotalHeight / 2) - (LINE_HEIGHT / 2); 

    lines.forEach((line, lineIndex) => {
        let startX = -line.width / 2; 
        const yPos = startY - (lineIndex * LINE_HEIGHT);
        
        line.words.forEach(wordObj => {
            let letterX = startX;
            wordObj.letters.forEach(letterData => {
                const mesh = letterData.mesh;
                const finalX = letterX + letterData.width / 2;
                
                mesh.userData = { 
                    isTarget: true, isAuthor: false,
                    finalX: finalX, finalY: yPos, 
                    w: letterData.width,
                    velocity: new THREE.Vector3((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3),
                    rotSpeed: { x: (Math.random()-0.5)*0.04, y: (Math.random()-0.5)*0.04, z: (Math.random()-0.5)*0.04 }
                };
                scene.add(mesh);
                letterMeshes.push(mesh);
                letterX += letterData.width + 0.5; 
            });
            startX = letterX + spaceWidth; 
        });
    });

    const authorY = startY - quoteHeight - (authorGap/2); 
    let authorStartX = -(authorWidth / 2); 
    
    let currentAuthorX = authorStartX;
    const authorKern = 0.2;
    
    let authCharIdx = 0;
    for(let i=0; i<authorUpper.length; i++) {
            const char = authorUpper[i];
            if(char === ' ') { currentAuthorX += (BASE_SIZE * 0.6 * AUTHOR_SCALE); continue; }
            
            const lData = authorLetters[authCharIdx];
            const scaledW = lData.width * AUTHOR_SCALE;
            const finalX = currentAuthorX + scaledW / 2;
            
            lData.mesh.userData = {
                isTarget: true, isAuthor: true,
                finalX: finalX, finalY: authorY,
                w: lData.width,
                velocity: new THREE.Vector3((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3),
                rotSpeed: { x: (Math.random()-0.5)*0.04, y: (Math.random()-0.5)*0.04, z: (Math.random()-0.5)*0.04 }
            };
            scene.add(lData.mesh);
            letterMeshes.push(lData.mesh);
            
            currentAuthorX += scaledW + authorKern;
            authCharIdx++;
    }

    const trashChars = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ1234567890?!@#$%&*<>";
    for(let i=0; i < TRASH_COUNT; i++) {
        const char = trashChars[Math.floor(Math.random()*trashChars.length)];
        const data = createTextTexture(char, 'Unbounded');
        const planeW = BASE_SIZE * data.aspect;
        const geometry = new THREE.PlaneGeometry(planeW, BASE_SIZE);
        const material = new THREE.MeshBasicMaterial({ 
            map: data.texture, transparent: true, side: THREE.DoubleSide, opacity: 0.5 + Math.random()*0.5 
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((Math.random()-0.5)*200, (Math.random()-0.5)*120, (Math.random()-0.5)*100);
        mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        mesh.userData = { 
            isTarget: false,
            velocity: new THREE.Vector3((Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2),
            rotSpeed: { x: (Math.random()-0.5)*0.03, y: (Math.random()-0.5)*0.03, z: (Math.random()-0.5)*0.03 }
        };
        scene.add(mesh);
        letterMeshes.push(mesh);
    }
}

function checkCollisions() {
    for (let i = 0; i < letterMeshes.length; i++) {
        for (let j = i + 1; j < letterMeshes.length; j++) {
            const a = letterMeshes[i];
            const b = letterMeshes[j];
            const dist = a.position.distanceTo(b.position);
            if (dist < COLLISION_RADIUS) {
                const normal = new THREE.Vector3().subVectors(a.position, b.position).normalize();
                a.userData.velocity.add(normal.clone().multiplyScalar(0.05));
                b.userData.velocity.sub(normal.clone().multiplyScalar(0.05));
                a.userData.rotSpeed.x += (Math.random()-0.5)*0.02;
                b.userData.rotSpeed.y += (Math.random()-0.5)*0.02;
            }
        }
    }
}

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const targetVec = new THREE.Vector3();

function animateThree() {
    requestAnimationFrame(animateThree);
    
    if (!isOrdered) {
        raycaster.setFromCamera(normMouse, camera);
        raycaster.ray.intersectPlane(plane, targetVec);

        checkCollisions();

        letterMeshes.forEach(mesh => {
            mesh.position.add(mesh.userData.velocity);
            mesh.rotation.x += mesh.userData.rotSpeed.x;
            mesh.rotation.y += mesh.userData.rotSpeed.y;
            mesh.rotation.z += mesh.userData.rotSpeed.z;

            const limitX = 110, limitY = 70, limitZ = 60;
            if (mesh.position.x > limitX || mesh.position.x < -limitX) mesh.userData.velocity.x *= -1;
            if (mesh.position.y > limitY || mesh.position.y < -limitY) mesh.userData.velocity.y *= -1;
            if (mesh.position.z > limitZ || mesh.position.z < -limitZ) mesh.userData.velocity.z *= -1;

            if (targetVec) {
                const dist = mesh.position.distanceTo(targetVec);
                if (dist < MOUSE_REPEL_RADIUS) {
                    const dir = new THREE.Vector3().subVectors(mesh.position, targetVec).normalize();
                    const force = (MOUSE_REPEL_RADIUS - dist) / MOUSE_REPEL_RADIUS;
                    mesh.userData.velocity.add(dir.multiplyScalar(force * 0.05));
                    mesh.userData.rotSpeed.z += force * 0.01;
                }
            }

            mesh.userData.velocity.multiplyScalar(0.995);
            if(mesh.userData.velocity.length() < 0.05) {
                mesh.userData.velocity.x += (Math.random()-0.5)*0.01;
                mesh.userData.velocity.y += (Math.random()-0.5)*0.01;
            }
        });
    }
    renderer.render(scene, camera);
}

window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    normMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    normMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

const cleanupBtn = document.getElementById('cleanupBtn');
const resetBtn = document.getElementById('resetBtn');

cleanupBtn.addEventListener('click', function() {
    if (isOrdered) return;
    isOrdered = true;
    
    gsap.to(cleanupBtn, { opacity: 0, pointerEvents: "none", duration: 0.5 });
    gsap.to(resetBtn, { opacity: 1, pointerEvents: "auto", scale: 1, duration: 0.5, delay: 0.5 });
    
    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight = 2 * Math.tan(vFOV / 2) * camera.position.z;
    const visibleWidth = visibleHeight * camera.aspect;

    const scaleX = (visibleWidth * 0.85) / blockTotalWidth;
    const scaleY = (visibleHeight * 0.55) / blockTotalHeight; 
    
    let scaleFactor = Math.min(scaleX, scaleY);
    if (scaleFactor > 1.8) scaleFactor = 1.8; 

    letterMeshes.forEach((mesh, i) => {
        mesh.userData.rotSpeed = {x:0, y:0, z:0};
        mesh.userData.velocity.set(0,0,0);

        if (!mesh.userData.isTarget) {
            gsap.to(mesh.position, { z: 300, x: mesh.position.x * 3, y: mesh.position.y * 3, duration: 1.5, ease: "power2.in" });
            gsap.to(mesh.material, { opacity: 0, duration: 0.5, delay: 1 });
        } else {
            const finalScale = mesh.userData.isAuthor ? scaleFactor * AUTHOR_SCALE : scaleFactor;
            
            gsap.to(mesh.position, { 
                x: mesh.userData.finalX * scaleFactor, 
                y: mesh.userData.finalY * scaleFactor, 
                z: 0, 
                duration: 2, 
                ease: "elastic.out(1, 0.7)", 
                delay: i * 0.01 
            });
            gsap.to(mesh.rotation, { x: 0, y: 0, z: 0, duration: 1.5, ease: "power2.out" });
            gsap.to(mesh.scale, { x: finalScale, y: finalScale, z: finalScale, duration: 1.5 });
        }
    });
});

resetBtn.addEventListener('click', function() {
    if (!isOrdered) return;
    
    letterMeshes.forEach((mesh, i) => {
            if (mesh.userData.isTarget) {
            const expForce = 1.5;
            mesh.userData.velocity.set(
                (Math.random()-0.5)*expForce,
                (Math.random()-0.5)*expForce,
                (Math.random()-0.5)*expForce
            );
            mesh.userData.rotSpeed = { x: (Math.random()-0.5)*0.2, y: (Math.random()-0.5)*0.2, z: (Math.random()-0.5)*0.2 };
            
            gsap.to(mesh.position, { 
                z: 100 + Math.random()*50, 
                x: (Math.random()-0.5)*150, 
                y: (Math.random()-0.5)*150, 
                duration: 0.8, 
                ease: "power2.in"
            });
            }
    });
    
    gsap.to(resetBtn, { opacity: 0, pointerEvents: "none", scale: 0.9, duration: 0.5 });
    
    setTimeout(() => {
        let nextIndex = Math.floor(Math.random() * quotes.length);
        while(nextIndex === currentQuoteIndex && quotes.length > 1) {
            nextIndex = Math.floor(Math.random() * quotes.length);
        }
        currentQuoteIndex = nextIndex;
        createLetters(quotes[currentQuoteIndex].text, quotes[currentQuoteIndex].author);
        isOrdered = false;
        gsap.to(cleanupBtn, { opacity: 1, pointerEvents: "auto", duration: 0.5 });
    }, 1000);
});

window.addEventListener('resize', () => { 
    resizeGrid(); 
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight); 
});

resizeGrid(); 
animateGrid();