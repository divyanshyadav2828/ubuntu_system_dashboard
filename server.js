require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const si = require('systeminformation');
const pm2 = require('pm2');
const pty = require('node-pty');
const os = require('os');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Middleware & DB ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// --- Schemas ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'viewer'], default: 'viewer' }
});
const User = mongoose.model('User', UserSchema);

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
};

// --- HTTP API Routes ---

// 1. Setup Admin (Run once via Postman/cURL)
app.post('/api/setup', async (req, res) => {
  const count = await User.countDocuments();
  if (count > 0) return res.status(403).json({ error: 'Setup already completed' });
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  await User.create({ username: req.body.username, password: hashedPassword, role: 'admin' });
  res.json({ message: 'Admin created' });
});

// 2. Auth Routes
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.cookie('token', token, { httpOnly: true }); 
  res.json({ role: user.role });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// 3. System Logs (Admin Only)
app.get('/api/logs', authenticateToken, requireAdmin, (req, res) => {
    const category = req.query.category || 'syslog';
    let logPath = '/var/log/syslog'; 
    if (category === 'auth') logPath = '/var/log/auth.log';
    if (category === 'dpkg') logPath = '/var/log/dpkg.log';

    // Tail last 100 lines. Requires server to run as sudo or user in 'adm' group.
    exec(`tail -n 100 ${logPath}`, (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: 'Failed to read logs. Ensure server runs with sudo.' });
        res.json({ logs: stdout });
    });
});

// 4. PM2 API
app.get('/api/pm2/list', authenticateToken, (req, res) => {
    pm2.connect((err) => {
        if (err) return res.status(500).send(err);
        pm2.list((err, list) => {
            pm2.disconnect();
            const processes = list.map(proc => ({
                id: proc.pm_id,
                name: proc.name,
                status: proc.pm2_env.status,
                cpu: proc.monit ? proc.monit.cpu : 0,
                memory: proc.monit ? (proc.monit.memory / 1024 / 1024).toFixed(2) : 0
            }));
            res.json(processes);
        });
    });
});

const NGINX_PATH = '/etc/nginx/nginx.conf'; 

app.get('/api/nginx', authenticateToken, requireAdmin, (req, res) => {
    // Read using cat via exec to handle permission issues if app is not root
    exec(`cat ${NGINX_PATH}`, (err, stdout) => {
        if (err) return res.status(500).json({ error: 'Could not read Nginx config.' });
        res.json({ content: stdout });
    });
});

app.post('/api/nginx', authenticateToken, requireAdmin, (req, res) => {
    const { content, sudoPassword } = req.body;
    
    if(!sudoPassword) return res.status(400).json({ error: 'Sudo password required' });

    // 1. Write to a temporary file in the app directory (safe for non-root)
    const tempPath = path.join(__dirname, 'nginx.temp.conf');
    
    try {
        require('fs').writeFileSync(tempPath, content);
    } catch(e) {
        return res.status(500).json({ error: 'Failed to create temp file' });
    }

    // 2. Construct the Sudo Command Chain
    // - mv: move temp file to /etc/nginx/
    // - nginx -t: test config
    // - systemctl reload: apply changes
    // "sudo -S" reads password from stdin (echo)
    
    // ESCAPE PASSWORD TO PREVENT SHELL INJECTION (Basic Protection)
    const safePass = sudoPassword.replace(/"/g, '\\"');

    const command = `echo "${safePass}" | sudo -S mv "${tempPath}" "${NGINX_PATH}" && echo "${safePass}" | sudo -S nginx -t && echo "${safePass}" | sudo -S systemctl reload nginx`;

    exec(command, (error, stdout, stderr) => {
        // Cleanup temp file just in case move failed
        if(require('fs').existsSync(tempPath)) require('fs').unlinkSync(tempPath);

        if (error) {
            console.error(stderr);
            // Detect 'incorrect password' vs 'nginx syntax error'
            if(stderr.includes('incorrect password')) {
                return res.status(401).json({ error: 'Incorrect Sudo Password' });
            }
            return res.status(400).json({ 
                error: 'Operation Failed', 
                details: stderr || 'Nginx Syntax Error or Permission Denied' 
            });
        }

        res.json({ message: 'Configuration Saved & Nginx Reloaded!' });
    });
});

app.post('/api/pm2/action', authenticateToken, requireAdmin, (req, res) => {
    const { id, action } = req.body; 
    pm2.connect((err) => {
        if(err) return res.status(500).send(err);
        const cb = (err) => { pm2.disconnect(); res.json({ success: !err }); };
        if(action === 'stop') pm2.stop(id, cb);
        else if(action === 'restart') pm2.restart(id, cb);
        else if(action === 'delete') pm2.delete(id, cb);
        else { pm2.disconnect(); res.status(400).send("Invalid action"); }
    });
});

// --- Real-time Socket.IO ---

// Socket Auth Middleware
io.use((socket, next) => {
  const cookie = socket.handshake.headers.cookie;
  if (!cookie) return next(new Error('Auth error'));
  const token = cookie.split('; ').find(row => row.startsWith('token=')).split('=')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Auth error'));
    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  // 1. System Stats Stream (Every 2s)
  const statsInterval = setInterval(async () => {
    try {
      const [cpu, mem, time, fsSize, network] = await Promise.all([
          si.currentLoad(), si.mem(), si.time(), si.fsSize(), si.networkStats()
      ]);

      // Aggregate network traffic across all interfaces
      let txSec = 0, rxSec = 0;
      network.forEach(iface => { txSec += iface.tx_sec; rxSec += iface.rx_sec; });

      socket.emit('sys-stats', {
        cpu: cpu.currentLoad.toFixed(1),
        memUsed: (mem.active / 1024 / 1024 / 1024).toFixed(2),
        memTotal: (mem.total / 1024 / 1024 / 1024).toFixed(2),
        uptime: (time.uptime / 3600).toFixed(2),
        disk: fsSize[0] ? Math.round(fsSize[0].use) : 0,
        netUp: (txSec / 1024).toFixed(1),   // KB/s
        netDown: (rxSec / 1024).toFixed(1) // KB/s
      });
    } catch (e) { console.error("Stats Error", e); }
  }, 2000);

  // 2. Web Terminal (Admin Only)
  let ptyProcess = null;
  if (socket.user.role === 'admin') {
      socket.on('term-spawn', () => {
        if (ptyProcess) ptyProcess.kill();
        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        
        ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-color',
            cols: 80, rows: 30,
            cwd: process.env.HOME,
            env: process.env
        });

        ptyProcess.onData((data) => socket.emit('term-data', data));
        socket.on('term-input', (data) => ptyProcess && ptyProcess.write(data));
        socket.on('term-resize', (size) => ptyProcess && ptyProcess.resize(size.cols, size.rows));
      });
  }

  socket.on('disconnect', () => {
    clearInterval(statsInterval);
    if (ptyProcess) ptyProcess.kill();
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(process.env.PORT || 3000, () => {
  console.log(`Dashboard running on port ${process.env.PORT || 3000}`);
});