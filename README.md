# Ubuntu System Dashboard

> **Production Ready System Dashboard for Ubuntu Servers**

A powerful, real-time web-based dashboard to monitor and manage your Ubuntu server. Built with Node.js, Express, Socket.IO, and MongoDB, this dashboard provides a comprehensive interface for checking system health, managing PM2 processes, editing Nginx configurations, and accessing a web terminal.

![Dashboard Overview](http://raw.githubusercontent.com/divyanshyadav2828/ubuntu_system_dashboard/refs/heads/main/images/ubuntu_sys1.png)

## 📸 Screenshots

| Dashboard | Terminal & Logs |
|-----------|-----------------|
| ![Dashboard](http://raw.githubusercontent.com/divyanshyadav2828/ubuntu_system_dashboard/refs/heads/main/images/ubuntu_sys2.png) | ![Terminal](http://raw.githubusercontent.com/divyanshyadav2828/ubuntu_system_dashboard/refs/heads/main/images/ubuntu_sys3.png) |

---

## ✨ Features

-   **Real-Time Monitoring**: Live updates for CPU load, Memory usage, Uptime, Disk space, and Network traffic (Upload/Download speeds).
-   **Web Terminal**: Full-featured web-based SSH terminal (Admin only) to execute commands directly from the browser.
-   **Log Viewer**: detailed view of system logs including `syslog`, `auth.log`, and `dpkg.log`.
-   **Nginx Manager**: Read and edit your Nginx configuration (`/etc/nginx/nginx.conf`) directly. Includes syntax validation and safe reload via Sudo.
-   **PM2 Process Manager**: List running PM2 processes with CPU/Memory stats. restart, stop, or delete processes from the UI.
-   **Role-Based Access Control**: Secure login with `Admin` and `Viewer` roles. Critical actions (Terminal, Nginx, PM2) are restricted to Admins.
-   **Secure**: JWT-based authentication and HttpOnly cookies.

## 🛠️ Tech Stack

-   **Backend**: Node.js, Express.js
-   **Real-time**: Socket.IO
-   **Database**: MongoDB (Mongoose)
-   **System Tools**: `systeminformation`, `node-pty`, `pm2`
-   **Frontend**: HTML5, CSS3, Vanilla JavaScript

## 🚀 Installation & Setup

### Prerequisites
-   Node.js (v16 or higher)
-   MongoDB (Running locally or via Atlas)
-   PM2 (Global install recommended)
-   Nginx (If using the Nginx manager feature)

### 1. Clone the Repository
```bash
git clone https://github.com/divyanshyadav2828/ubuntu_system_dashboard.git
cd ubuntu_system_dashboard
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/ubuntu-dashboard
JWT_SECRET=your_super_secret_key_change_this
```

### 4. Start the Application
```bash
# Development mode
npm start

# OR using PM2 (Recommended for production)
pm2 start server.js --name ubuntu-dashboard
```

## ⚙️ Usage & First Run

1.  **Initial Admin Setup**: The first time you run the app, no users exist. You need to create an admin account.
    *   **Method A (Postman/cURL)**: Send a `POST` request to `http://localhost:3000/api/setup` with:
        ```json
        {
          "username": "admin",
          "password": "yourpassword"
        }
        ```
    *   **Method B (Seed Script)**: If provided, run `npm run seed`.

2.  **Login**: Navigate to `http://localhost:3000`, login with your credentials.

3.  **Terminal & Nginx**:
    *   The **Web Terminal** connects as the user running the Node process.
    *   **Nginx Config** requires the user to have `sudo` privileges. You will be prompted for the sudo password when saving Nginx changes.

## 📝 License

This project is licensed under the MIT License.
