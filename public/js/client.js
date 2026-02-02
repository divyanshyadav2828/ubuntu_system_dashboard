let socket, term, fitAddon;

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colors = {
        error: 'bg-red-500/90 border-red-400',
        success: 'bg-emerald-500/90 border-emerald-400',
        info: 'bg-indigo-500/90 border-indigo-400'
    };
    const icons = {
        error: 'fa-exclamation-circle',
        success: 'fa-check-circle',
        info: 'fa-info-circle'
    };

    toast.className = `${colors[type]} toast-enter text-white px-4 py-3 rounded-lg shadow-lg border border-white/20 backdrop-blur flex items-center gap-3 min-w-[250px]`;
    toast.innerHTML = `<i class="fas ${icons[type]} text-lg"></i><span class="text-sm font-medium">${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- AUTHENTICATION ---
async function login() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const btn = document.getElementById('loginBtn');
    
    if(!u || !p) return showToast('Please enter credentials', 'error');

    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Verifying...`;
    btn.disabled = true;

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: u, password: p})
        });
        const data = await res.json();
        
        if(res.ok) {
            showToast('Authentication Successful', 'success');
            const authScreen = document.getElementById('authScreen');
            const appInterface = document.getElementById('appInterface');
            authScreen.style.opacity = '0';
            setTimeout(() => {
                authScreen.classList.add('hidden');
                appInterface.classList.remove('hidden');
                void appInterface.offsetWidth; 
                appInterface.style.opacity = '1';
                appInterface.style.transform = 'scale(1)';
                initApp(data.role, u);
            }, 500);
        } else {
            showToast(data.error || 'Login failed', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        showToast('Server connection error', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function logout() { 
    await fetch('/api/logout', {method: 'POST'}); 
    location.reload(); 
}

// --- NAVIGATION ---
function nav(id, el) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    
    const titles = {
        'dashboard': 'System Overview', 'pm2': 'Process Management', 'terminal': 'Command Line Interface',
        'logs': 'System Logs', 'serverping': 'Live Server Preview', 'nginx': 'Nginx Config Editor'
    };
    document.getElementById('pageTitle').innerText = titles[id];

    document.querySelectorAll('section').forEach(sec => {
        sec.classList.add('hidden');
        sec.classList.remove('animate-fade-in-up');
    });
    
    const activeSec = document.getElementById(id);
    activeSec.classList.remove('hidden');
    void activeSec.offsetWidth; 
    activeSec.classList.add('animate-fade-in-up');

    if(id === 'pm2') loadPm2();
    if(id === 'logs') loadLogs();
    if(id === 'nginx') loadNginx();
    if(id === 'terminal' && fitAddon) setTimeout(() => fitAddon.fit(), 50);

    if(id === 'serverping') {
        const frame = document.getElementById('pingFrame');
        const loader = document.getElementById('iframeLoader');
        const urlDisplay = document.getElementById('pingUrlDisplay');
        const targetUrl = `http://${window.location.hostname}:3055`;
        if(!frame.getAttribute('src')) {
            frame.src = targetUrl;
            urlDisplay.innerText = targetUrl;
            frame.onload = () => { loader.style.opacity = '0'; };
        }
    }
}

function reloadIframe() {
    const frame = document.getElementById('pingFrame');
    const currentSrc = frame.src;
    frame.src = ''; 
    document.getElementById('iframeLoader').style.opacity = '1';
    setTimeout(() => frame.src = currentSrc, 100);
}

// --- CORE APP ---
function initApp(role, username) {
    document.getElementById('userDisplay').innerText = username;
    document.getElementById('roleDisplay').innerText = role === 'admin' ? 'Root Administrator' : 'Viewer';

    socket = io();
    socket.on('sys-stats', d => {
        document.getElementById('cpuVal').innerText = d.cpu;
        document.getElementById('cpuBar').style.width = `${d.cpu}%`;
        document.getElementById('memVal').innerText = d.memUsed;
        document.getElementById('memTotal').innerText = d.memTotal;
        document.getElementById('uptimeVal').innerText = d.uptime;
        document.getElementById('netUp').innerText = d.netUp;
        document.getElementById('netDown').innerText = d.netDown;
    });

    if(role === 'admin') initTerminal();
    else document.getElementById('terminal-container').innerHTML = 
        '<div class="h-full flex flex-col items-center justify-center text-red-400"><i class="fas fa-lock text-4xl mb-4"></i><span class="font-bold">Restricted Access</span></div>';
}

function initTerminal() {
    term = new Terminal({ cursorBlink: true, fontFamily: '"Fira Code", monospace', fontSize: 14, theme: { background: '#0f172a00', foreground: '#f8f8f2' }, allowTransparency: true });
    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal-container'));
    fitAddon.fit();
    socket.emit('term-spawn'); 
    term.onData(d => socket.emit('term-input', d)); 
    socket.on('term-data', d => term.write(d));
    window.addEventListener('resize', () => { fitAddon.fit(); socket.emit('term-resize', { cols: term.cols, rows: term.rows }); });
}

// --- PM2 ---
async function loadPm2() {
    try {
        const res = await fetch('/api/pm2/list');
        const data = await res.json();
        const html = data.map(p => `
            <tr class="hover:bg-slate-800/50 transition border-b border-glassBorder last:border-0 group">
                <td class="p-5 font-mono text-xs text-slate-500">${p.id}</td>
                <td class="p-5 font-medium text-white">${p.name}</td>
                <td class="p-5"><span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${p.status==='online'?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20':'bg-red-500/20 text-red-400 border border-red-500/20'}">${p.status}</span></td>
                <td class="p-5 text-slate-400 text-xs font-mono">CPU: ${p.cpu}% | RAM: ${p.memory} MB</td>
                <td class="p-5 text-right space-x-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onclick="pm2Act(${p.id}, 'restart')" class="p-2 bg-amber-500/10 text-amber-400 rounded-lg"><i class="fas fa-redo"></i></button>
                    <button onclick="pm2Act(${p.id}, 'stop')" class="p-2 bg-red-500/10 text-red-400 rounded-lg"><i class="fas fa-stop"></i></button>
                    <button onclick="pm2Act(${p.id}, 'delete')" class="p-2 bg-slate-700/50 text-slate-400 rounded-lg"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`).join('');
        document.getElementById('pm2Table').innerHTML = html;
    } catch(err) { showToast("Failed to load PM2", 'error'); }
}

async function pm2Act(id, action) {
    if(!confirm(`Are you sure?`)) return;
    await fetch('/api/pm2/action', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, action}) });
    showToast(`Process ${action}ed`, 'success'); setTimeout(loadPm2, 800);
}

// --- LOGS ---
async function loadLogs() {
    const cat = document.getElementById('logCategory').value;
    const el = document.getElementById('logContent');
    el.innerHTML = '<span class="animate-pulse">Fetching logs...</span>';
    try {
        const res = await fetch(`/api/logs?category=${cat}`);
        const data = await res.json();
        el.innerText = data.logs || 'No logs found.'; el.scrollTop = el.scrollHeight; 
    } catch (err) { el.innerText = "Failed to fetch logs."; }
}

// --- NGINX & SUDO ---
async function loadNginx() {
    const editor = document.getElementById('nginxEditor');
    editor.value = "Loading config..."; editor.disabled = true;
    try {
        const res = await fetch('/api/nginx');
        const data = await res.json();
        if(res.ok) { editor.value = data.content; editor.disabled = false; } 
        else { editor.value = `Error: ${data.error}`; showToast(data.error, 'error'); }
    } catch (err) { editor.value = "Connection Error"; }
}

function saveNginx() {
    document.getElementById('sudoModal').classList.remove('hidden');
    document.getElementById('sudoPassInput').value = '';
    document.getElementById('sudoPassInput').focus();
}

function closeSudoModal() { document.getElementById('sudoModal').classList.add('hidden'); }

async function confirmSudo() {
    const sudoPassword = document.getElementById('sudoPassInput').value;
    if(!sudoPassword) return showToast("Password required", "error");

    const content = document.getElementById('nginxEditor').value;
    const btn = document.querySelector('#sudoModal button:last-child');
    const originalText = btn.innerText;
    btn.innerText = "Verifying..."; btn.disabled = true;

    try {
        const res = await fetch('/api/nginx', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ content, sudoPassword })
        });
        const data = await res.json();
        if (res.ok) { showToast(data.message, 'success'); closeSudoModal(); } 
        else { 
            if(res.status === 401) { showToast("Incorrect Sudo Password", 'error'); } 
            else { alert(`ERROR:\n${data.details || data.error}`); showToast("Failed", 'error'); closeSudoModal(); }
        }
    } catch (err) { showToast("Server Error", 'error'); } 
    finally { btn.innerText = originalText; btn.disabled = false; }
}