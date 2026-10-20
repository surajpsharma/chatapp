# 💬 Next Chat App

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb)
![WebSockets](https://img.shields.io/badge/WebSockets-Real--time-010101?style=for-the-badge&logo=socket.io)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

A **full-stack real-time chat application** built with Next.js 14, WebSockets, and MongoDB. Supports user authentication, 1:1 direct messages, group chats, and live presence indicators.

[🚀 Live Demo](https://next-chat-app.onrender.com) &nbsp;·&nbsp; [🐛 Report Bug](https://github.com/surajpsharma/chatapp/issues) &nbsp;·&nbsp; [✨ Request Feature](https://github.com/surajpsharma/chatapp/issues)

</div>

---

## ✨ Features

- 🔐 **Email Authentication** — Register & login with email/password (JWT-based sessions)
- 💬 **1:1 Direct Messages** — Private conversations between users
- 👥 **Group Chats** — Create and manage group conversations
- ⚡ **Real-time Messaging** — Instant messages via WebSockets (no page refresh needed)
- 🟢 **Online Presence** — See who's currently online
- ✍️ **Typing Indicators** — Know when someone is typing
- 📱 **Responsive Design** — Works on desktop and mobile
- 🗑️ **Delete Messages** — Remove your own messages
- 📖 **Read Receipts** — Track unread message counts

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18 |
| **Backend** | Next.js API Routes + Custom Node.js Server |
| **Real-time** | WebSockets (`ws` library) |
| **Database** | MongoDB (Atlas or local) |
| **Auth** | JWT (JSON Web Tokens) + bcryptjs |
| **Styling** | Vanilla CSS (custom design system) |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [MongoDB Atlas](https://www.mongodb.com/atlas) account (free) or local MongoDB

### 1. Clone the repository

```bash
git clone https://github.com/surajpsharma/chatapp.git
cd chatapp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` with your values:

```env
# MongoDB connection string (from MongoDB Atlas or local)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/nextchat

# Database name
MONGODB_DB=nextchat

# JWT signing secret — use a long random string in production
# Generate one with: openssl rand -hex 48
JWT_SECRET=your_super_secret_key_here

# Server port
PORT=3000
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Project Structure

```
next-chat-app/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (REST endpoints)
│   │   ├── auth/           # Login, register, logout, me
│   │   ├── conversations/  # CRUD for conversations & messages
│   │   └── users/          # User search
│   ├── login/              # Login page
│   ├── register/           # Register page
│   ├── globals.css         # Global styles
│   └── layout.js           # Root layout
├── components/             # React components
│   ├── ChatApp.js          # Main chat UI
│   ├── AuthForm.js         # Login/Register form
│   ├── NewChatModal.js     # Start a new DM
│   ├── NewGroupModal.js    # Create group chat
│   ├── GroupPanel.js       # Group management
│   ├── Avatar.js           # User avatar
│   └── Dialog.js           # Reusable dialog
├── lib/                    # Server-side utilities
│   ├── auth.js             # JWT helpers
│   ├── db.js               # MongoDB connection
│   ├── hub.js              # WebSocket hub reference
│   └── store.js            # Database queries
├── server.js               # Custom Node.js server (Next.js + WebSocket)
├── render.yaml             # Render deployment config
├── next.config.js          # Next.js configuration
└── package.json
```

---

## 🌐 Deployment

### Deploy to Render (Free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set the following **Environment Variables** in Render dashboard:

| Variable | Value |
|---|---|
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `MONGODB_DB` | `nextchat` |
| `JWT_SECRET` | A long random string |
| `NODE_ENV` | `production` |

5. Click **Create Web Service** — Render auto-detects settings from `render.yaml`

> **Note**: Free tier apps sleep after 15 minutes of inactivity. First load may take ~30 seconds.

### Environment Variables Summary

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ Yes | MongoDB connection string |
| `MONGODB_DB` | ✅ Yes | Database name (default: `nextchat`) |
| `JWT_SECRET` | ✅ Yes | Secret key for signing JWT tokens |
| `PORT` | ❌ Optional | Server port (default: `3000`) |

---

## 📜 Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
npm test         # Run test suite
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 👤 Author

**Suraj Sharma**

- GitHub: [@surajpsharma](https://github.com/surajpsharma)

---

<div align="center">
  Made with ❤️ using Next.js & WebSockets
</div>
