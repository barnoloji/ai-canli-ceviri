// server.js
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

dotenv.config();

// API key will be loaded from environment variables

// OpenAI client'ı başlat
let openai = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('✅ OpenAI API bağlantısı kuruldu');
  console.log('🔑 API Key:', process.env.OPENAI_API_KEY.substring(0, 10) + '...');
} else {
  console.log('⚠️ OpenAI API key bulunamadı - sadece WebSocket çalışacak');
}

// Multer konfigürasyonu (ses dosyaları için)
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit (Whisper limiti)
  },
  fileFilter: (req, file, cb) => {
    // Sadece ses dosyalarını kabul et
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece ses dosyaları kabul edilir!'), false);
    }
  }
});

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());
app.use(express.static('uploads')); // Upload edilen dosyaları serve et

// Frontend dosyalarını serve et (production için)
// app.use(express.static('../live-translation-frontend/dist'));

// SPA için tüm route'ları index.html'e yönlendir
// app.get('*', (req, res) => {
//   res.sendFile(path.join(process.cwd(), '../live-translation-frontend/dist/index.html'));
// });

// Test endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Canlı Çeviri API Çalışıyor! 🎉' });
});

// OpenAI API fonksiyonları
async function transcribeAudio(audioFile) {
  if (!openai) {
    throw new Error('OpenAI API key bulunamadı');
  }
  
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile),
      model: "whisper-1",
      language: "auto", // Otomatik dil tespiti
    });
    return transcription.text;
  } catch (error) {
    console.error('Whisper transcription error:', error);
    throw new Error('Ses çevirme hatası: ' + error.message);
  }
}

async function translateText(text, targetLanguage) {
  if (!openai) {
    throw new Error('OpenAI API key bulunamadı');
  }
  
  try {
    const systemPrompt = targetLanguage === 'tr' 
      ? "Sen bir profesyonel çevirmensin. Verilen İngilizce metni doğal ve akıcı Türkçe'ye çevir. Sadece çeviriyi döndür, açıklama yapma."
      : "You are a professional translator. Translate the given Turkish text into natural and fluent English. Only return the translation, no explanations.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('GPT translation error:', error);
    throw new Error('Çeviri hatası: ' + error.message);
  }
}

// API Endpoints

// Ses dosyası yükleme ve çeviri
app.post('/api/translate-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Ses dosyası gerekli!' });
    }

    const { targetLanguage = 'en' } = req.body;
    
    console.log('🎤 Ses dosyası alındı:', req.file.originalname);
    
    // 1. Whisper ile ses → metin
    const transcript = await transcribeAudio(req.file.path);
    console.log('📝 Transkript:', transcript);
    
    // 2. GPT-4 ile çeviri
    const translation = await translateText(transcript, targetLanguage);
    console.log('🔄 Çeviri:', translation);
    
    // 3. Geçici dosyayı sil
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      transcript,
      translation,
      originalLanguage: 'auto-detected',
      targetLanguage
    });
    
  } catch (error) {
    console.error('API Error:', error);
    
    // Hata durumunda dosyayı temizle
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: error.message || 'Sunucu hatası'
    });
  }
});

// Sadece metin çevirisi
app.post('/api/translate-text', async (req, res) => {
  try {
    const { text, targetLanguage = 'en' } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Çevrilecek metin gerekli!' });
    }
    
    console.log('📝 Metin çevirisi:', text);
    
    const translation = await translateText(text, targetLanguage);
    console.log('🔄 Çeviri:', translation);
    
    res.json({
      success: true,
      originalText: text,
      translation,
      targetLanguage
    });
    
  } catch (error) {
    console.error('Text translation error:', error);
    res.status(500).json({
      error: error.message || 'Çeviri hatası'
    });
  }
});

// Konferans odaları yönetimi
const conferenceRooms = new Map();

// WebSocket bağlantısı
wss.on('connection', (ws) => {
  console.log('✅ Yeni WebSocket bağlantısı kuruldu');
  
  let userInfo = {
    id: null,
    roomId: null,
    name: null
  };
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('📩 Mesaj alındı:', data.type);
      
      switch (data.type) {
        case 'join_room':
          userInfo = {
            id: data.userId || generateUserId(),
            roomId: data.roomId,
            name: data.userName || 'Anonim'
          };
          
          // Odaya katıl
          if (!conferenceRooms.has(data.roomId)) {
            conferenceRooms.set(data.roomId, {
              users: new Map(),
              translations: []
            });
          }
          
          const room = conferenceRooms.get(data.roomId);
          room.users.set(userInfo.id, { ws, ...userInfo });
          
          // Tüm kullanıcılara bildir
          broadcastToRoom(data.roomId, {
            type: 'user_joined',
            user: { id: userInfo.id, name: userInfo.name },
            timestamp: new Date().toISOString()
          }, userInfo.id);
          
          // Kullanıcıya odanın durumunu gönder
          ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: data.roomId,
            users: Array.from(room.users.values()).map(u => ({ id: u.id, name: u.name })),
            recentTranslations: room.translations.slice(-10) // Son 10 çeviri
          }));
          break;
          
        case 'audio_chunk':
          // Ses parçasını işle
          console.log('🎤 Ses parçası alındı, boyut:', data.audioData?.length);
          if (userInfo.roomId) {
            await processAudioChunk(data.audioData, data.roomId, userInfo);
          } else {
            console.error('❌ Kullanıcı oda ID\'si yok!');
          }
          break;
          
        case 'start_speaking':
          // Konuşmaya başladığını bildir
          broadcastToRoom(userInfo.roomId, {
            type: 'user_speaking',
            userId: userInfo.id,
            userName: userInfo.name,
            timestamp: new Date().toISOString()
          }, userInfo.id);
          break;
          
        case 'stop_speaking':
          // Konuşmayı bitirdiğini bildir
          broadcastToRoom(userInfo.roomId, {
            type: 'user_stopped_speaking',
            userId: userInfo.id,
            userName: userInfo.name,
            timestamp: new Date().toISOString()
          }, userInfo.id);
          break;
      }
    } catch (error) {
      console.error('WebSocket mesaj hatası:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Mesaj işleme hatası'
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('❌ Bağlantı kapatıldı');
    
    // Kullanıcıyı odadan çıkar
    if (userInfo.roomId && conferenceRooms.has(userInfo.roomId)) {
      const room = conferenceRooms.get(userInfo.roomId);
      room.users.delete(userInfo.id);
      
      // Diğer kullanıcılara bildir
      broadcastToRoom(userInfo.roomId, {
        type: 'user_left',
        userId: userInfo.id,
        userName: userInfo.name,
        timestamp: new Date().toISOString()
      });
      
      // Oda boşsa sil
      if (room.users.size === 0) {
        conferenceRooms.delete(userInfo.roomId);
      }
    }
  });
});

// Yardımcı fonksiyonlar
function generateUserId() {
  return 'user_' + Math.random().toString(36).substr(2, 9);
}

function broadcastToRoom(roomId, message, excludeUserId = null) {
  if (!conferenceRooms.has(roomId)) return;
  
  const room = conferenceRooms.get(roomId);
  room.users.forEach((user, userId) => {
    if (userId !== excludeUserId && user.ws.readyState === 1) {
      user.ws.send(JSON.stringify(message));
    }
  });
}

async function processAudioChunk(audioData, roomId, userInfo) {
  try {
    console.log('🔄 Ses işleme başlıyor...');
    
    // Base64 ses verisini işle
    const audioBuffer = Buffer.from(audioData, 'base64');
    console.log('📁 Ses buffer boyutu:', audioBuffer.length);
    
    // Geçici dosya oluştur
    const tempFile = `uploads/temp_${Date.now()}.webm`;
    fs.writeFileSync(tempFile, audioBuffer);
    console.log('💾 Geçici dosya oluşturuldu:', tempFile);
    
    let transcript = '';
    let translation = '';
    
    if (openai) {
      // Gerçek API ile çeviri
      console.log('🎯 Whisper ile transkript başlıyor...');
      transcript = await transcribeAudio(tempFile);
      console.log('📝 Transkript:', transcript);
      
      if (transcript && transcript.trim().length > 0) {
        console.log('🔄 GPT-4 ile çeviri başlıyor...');
        const targetLanguage = 'en';
        translation = await translateText(transcript, targetLanguage);
        console.log('✅ Çeviri:', translation);
      }
    } else {
      // Mock çeviri (test için)
      console.log('🎭 Mock çeviri yapılıyor...');
      transcript = 'Test konuşması - ses algılandı';
      translation = 'Test speech - audio detected';
      console.log('📝 Mock Transkript:', transcript);
      console.log('✅ Mock Çeviri:', translation);
    }
    
    if (transcript && transcript.trim().length > 0) {
      // Çeviri kaydını oluştur
      const translationRecord = {
        id: generateTranslationId(),
        userId: userInfo.id,
        userName: userInfo.name,
        originalText: transcript,
        translatedText: translation,
        timestamp: new Date().toISOString(),
        language: 'auto-detected'
      };
      
      // Oda geçmişine ekle
      const room = conferenceRooms.get(roomId);
      room.translations.push(translationRecord);
      
      // Tüm kullanıcılara gönder
      console.log('📡 Çeviri tüm kullanıcılara gönderiliyor...');
      broadcastToRoom(roomId, {
        type: 'new_translation',
        translation: translationRecord
      });
    } else {
      console.log('⚠️ Transkript boş, çeviri yapılmıyor');
    }
    
    // Geçici dosyayı sil
    fs.unlinkSync(tempFile);
    console.log('🗑️ Geçici dosya silindi');
    
  } catch (error) {
    console.error('❌ Ses işleme hatası:', error);
  }
}

function generateTranslationId() {
  return 'trans_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

const PORT = process.env.PORT || 3002;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server çalışıyor!`);
  console.log(`📡 HTTP: http://0.0.0.0:${PORT}`);
  console.log(`🔌 WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n✨ Tarayıcıda test et: http://localhost:${PORT}`);
});