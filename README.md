# 🎬 SubtitleGenAI  
### AI-Powered Subtitle Generator + Editor (Whisper / Vosk / Wav2Vec2 / Silero)

✨ Generate subtitles, edit timelines, translate text, and export SRT — all in your browser.

---

### 🔥 Built with:
**Flask + Whisper + Vosk + Wav2Vec2 + Silero + SSE + Vanilla JS + Tailwind UI**

---

![Python](https://img.shields.io/badge/Python-3.10+-blue?style=flat-square)
![Framework](https://img.shields.io/badge/Flask-Backend-green?style=flat-square)
![ASR](https://img.shields.io/badge/Whisper-ASR-purple?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

---

# 📌 Overview

SubtitleGenAI is a full-stack AI subtitle generation platform featuring:

### 🧠 Speech Recognition (ASR)
- **Whisper (OpenAI)** — small / medium / large  
- **Vosk**
- **Wav2Vec2**
- **Silero**

### 🎨 Frontend Features
- Video player  
- Upload audio/video  
- Smart ASR model selection  
- Multi-language subtitle output  
- Real-time progress (Server-Sent Events)  
- In-browser subtitle timeline editor  
- Drag, resize, delete subtitle segments  
- Undo/Redo stack  
- Export: **SRT, VTT, SVG**

### ☁️ Deployment
- Runs 100% locally  
- Uses **Cloudflare Tunnel** for free public HTTPS access  
- No users download models  
- Free, fast, secure

---

# 🚀 Getting Started

## 1️⃣ Clone repository

```bash
git clone https://github.com/er-aryan/AI-SubtitleGenerator
cd AI-SubtitleGenerator
```

## 2️⃣ Create virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate     # Mac/Linux
```

## 3️⃣ Install dependencies

```bash
pip install -r requirements.txt
```

## 4️⃣ Run backend

```bash
python web/app.py
```

App runs on:

```
http://localhost:5050
```

---

# 🌎 FREE Deployment Using Cloudflare Tunnel (No Cost, No Server)

Cloudflare Tunnel allows you to expose your local Flask app publicly — **for free**.

## 🟦 1. Install Cloudflare Tunnel

```bash
brew install cloudflared
```

## 🟨 2. Run your Flask backend

```bash
python web/app.py
```

## 🟧 3. Start Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:5050
```

You will receive a public URL:

```
https://something-unique.trycloudflare.com
```

Open this link in any browser — your entire app is now live.

---

# 📁 Project Structure

```
SubtitleGenAI/
│
├── web/
│   ├── app.py
│   ├── generate_subtitles.py
│   ├── utils/
│   ├── static/
│   ├── templates/
│
├── models/        # ignored
├── uploads/       # ignored
├── chunks/        # ignored
├── subtitles/     # ignored
│
├── requirements.txt
├── README.md
└── .gitignore
```

---

# 📝 License
MIT License

---

<div align="center">
⭐ If you like this project, please give it a star on GitHub!
</div>
