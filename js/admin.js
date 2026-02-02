const API_URL = '/api';
let quotes = [];

document.addEventListener('DOMContentLoaded', () => {
    // Проверка, залогинены ли мы
    const token = sessionStorage.getItem('elcy_token');
    if(token) {
        showDashboard();
        loadQuotes();
    }

    // Слушатели событий
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('save-server').addEventListener('click', saveToServer);
    document.getElementById('add-btn').addEventListener('click', addQuote);
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('elcy_token');
        location.reload();
    });

    // Удаление через делегирование
    document.getElementById('list-container').addEventListener('click', (e) => {
        if(e.target.classList.contains('btn-delete')) {
            const index = e.target.dataset.index;
            deleteQuote(index);
        }
    });
});

// --- ФУНКЦИИ ---

async function handleLogin() {
    const username = document.getElementById('admin-login').value;
    const password = document.getElementById('admin-pass').value;
    const err = document.getElementById('login-error');

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.token) {
            sessionStorage.setItem('elcy_token', data.token);
            showDashboard();
            loadQuotes();
        } else {
            showError();
        }
    } catch (e) {
        console.error(e);
        err.innerText = "SERVER ERROR";
        showError();
    }
}

async function loadQuotes() {
    try {
        const res = await fetch(`${API_URL}/quotes`);
        quotes = await res.json();
        render();
    } catch (e) {
        alert("Ошибка загрузки данных с сервера");
    }
}

async function saveToServer() {
    const token = sessionStorage.getItem('elcy_token');
    if (!token) return alert("AUTH REQUIRED");

    try {
        const res = await fetch(`${API_URL}/quotes`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(quotes)
        });

        if (res.ok) {
            alert("SUCCESS: DATA SYNCED");
        } else {
            alert("ERROR SAVING DATA");
        }
    } catch (e) {
        console.error(e);
        alert("CONNECTION FAILED");
    }
}

function showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

function showError() {
    const err = document.getElementById('login-error');
    err.style.opacity = 1;
    gsap.to(err, {x: 10, duration: 0.1, yoyo: true, repeat: 5});
}

function render() {
    const container = document.getElementById('list-container');
    document.getElementById('count-display').innerText = quotes.length;
    
    container.innerHTML = quotes.map((q, i) => `
        <div class="quote-item">
            <div>
                <div class="quote-text">"${q.text}"</div>
                <div class="quote-author">// ${q.author}</div>
            </div>
            <button class="btn-action btn-delete" data-index="${i}">DEL</button>
        </div>
    `).join('');
}

function addQuote() {
    const textInp = document.getElementById('inp-text');
    const authInp = document.getElementById('inp-author');
    
    if(!textInp.value || !authInp.value) return alert("EMPTY FIELDS");

    quotes.unshift({ 
        text: textInp.value.trim().replace(/['"]/g, ""), 
        author: authInp.value.trim() 
    });
    
    textInp.value = '';
    authInp.value = '';
    render();
}

function deleteQuote(index) {
    if(confirm('DELETE LINE?')) {
        quotes.splice(index, 1);
        render();
    }
}