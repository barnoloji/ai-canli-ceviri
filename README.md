# Konferans Canlı Çeviri Sistemi 🎤🌍

OpenAI API (Whisper + GPT-4) kullanarak konferanslar için gerçek zamanlı ses çevirisi yapan modern web uygulaması.

## 🚀 Özellikler

- **Gerçek Zamanlı Ses Çevirisi**: Whisper ile ses → metin, GPT-4 ile çeviri
- **Konferans Odaları**: Kullanıcılar odalara katılıp anlık çeviri yapabilir
- **Anlık Çeviri**: Konuşma anında tüm katılımcılara çeviri gönderilir
- **Çeviri Geçmişi**: Tüm çeviriler geçmişte saklanır
- **Kullanıcı Yönetimi**: Kim konuşuyor, kim katılımcı görünür
- **WebSocket Desteği**: Gerçek zamanlı iletişim
- **Modern UI**: React + Tailwind CSS ile güzel arayüz
- **Responsive**: Mobil ve desktop uyumlu

## 📋 Gereksinimler

- Node.js 18+
- OpenAI API Key ($5 ücretsiz kredit)
- Modern tarayıcı (Chrome/Edge önerilir)

## 🛠️ Kurulum

### Railway Deployment (Önerilen)
1. **Railway hesabı oluşturun**: https://railway.app
2. **GitHub'a push edin** (veya manuel upload)
3. **Railway'e bağlayın**
4. **Environment variables ekleyin**:
   - `OPENAI_API_KEY`: OpenAI API key'iniz
   - `PORT`: 3002 (otomatik)

### Local Development
```bash
# Tüm bağımlılıkları yükle
npm run install-all

# Development modunda çalıştır
npm run dev
```

### Manuel Kurulum
```bash
# Backend
cd backend
npm install

# Frontend  
cd ../live-translation-frontend
npm install

# OpenAI API Key ayarlayın
# backend/.env dosyasında:
OPENAI_API_KEY=your_api_key_here
PORT=3002
```

## 🎯 Kullanım

### Backend'i Başlatın
```bash
cd backend
npm run dev
```

### Frontend'i Başlatın
```bash
cd live-translation-frontend
npm run dev
```

### Tarayıcıda Açın
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## 🎮 Nasıl Kullanılır

1. **Giriş**: Adınızı ve oda ID'sini girin
2. **Odaya Katıl**: Aynı oda ID'sini kullanan herkes aynı çeviriyi görür
3. **Mikrofon İzni**: Tarayıcı mikrofon izni isteyecek
4. **Konuşun**: Mikrofon butonuna basıp konuşmaya başlayın
5. **Anlık Çeviri**: Konuşmanız anında tüm katılımcılara çevrilir
6. **Geçmiş**: Tüm çeviriler altta geçmişte saklanır

## 🔧 API Endpoints

### POST /api/translate-audio
Ses dosyası yükleyip çeviri yapar.

**Request:**
- `audio`: Ses dosyası (multipart/form-data)
- `targetLanguage`: Hedef dil (en/tr)

**Response:**
```json
{
  "success": true,
  "transcript": "Orijinal metin",
  "translation": "Çevrilmiş metin",
  "originalLanguage": "auto-detected",
  "targetLanguage": "en"
}
```

### POST /api/translate-text
Sadece metin çevirisi yapar.

**Request:**
```json
{
  "text": "Çevrilecek metin",
  "targetLanguage": "en"
}
```

## 💰 Maliyet

- **Whisper**: $0.006/dakika
- **GPT-4**: $0.03/1K token
- **Yeni hesaplar**: $5 ücretsiz kredit

## 🛡️ Güvenlik

- API key'ler backend'de saklanır
- CORS koruması aktif
- Dosya boyutu limiti (25MB)
- Geçici dosyalar otomatik silinir

## 🐛 Sorun Giderme

### Backend Bağlantı Hatası
- Backend server'ın çalıştığından emin olun
- Port 3001'in boş olduğunu kontrol edin

### API Key Hatası
- .env dosyasında OPENAI_API_KEY'in doğru olduğunu kontrol edin
- API key'in aktif olduğunu kontrol edin

### Mikrofon Hatası
- Tarayıcı izinlerini kontrol edin
- HTTPS kullanın (production'da)

## 📁 Proje Yapısı

```
ceviri/
├── backend/
│   ├── server.js          # Express server
│   ├── package.json       # Backend dependencies
│   └── uploads/           # Geçici ses dosyaları
├── live-translation-frontend/
│   ├── src/
│   │   └── App.jsx        # React uygulaması
│   └── package.json       # Frontend dependencies
└── README.md
```

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📄 Lisans

MIT License - detaylar için LICENSE dosyasına bakın.

## 🙏 Teşekkürler

- OpenAI (Whisper & GPT-4)
- React & Vite
- Tailwind CSS
- Lucide React Icons
