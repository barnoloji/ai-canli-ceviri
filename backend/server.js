// server.js - Google Translate + WebSocket Canlı Çeviri Sistemi
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

console.log('🚀 Google Translate + WebSocket Canlı Çeviri Sistemi başlatılıyor...');

// Artık ses dosyası yüklemiyoruz, sadece WebSocket ile çalışıyoruz

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());
app.use(express.static('uploads')); // Upload edilen dosyaları serve et

// Frontend dosyalarını serve et (sadece production için)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('../live-translation-frontend/dist'));

  // SPA için tüm route'ları index.html'e yönlendir
  app.get('*', (req, res) => {
    res.sendFile(path.join(process.cwd(), '../live-translation-frontend/dist/index.html'));
  });
}

// Test endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Canlı Çeviri API Çalışıyor! 🎉' });
});

// Google Translate API fonksiyonu
async function translateWithGoogle(text, targetLanguage = 'en') {
  try {
    console.log(`🌐 Google Translate ile çeviri: ${text}`);
    
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=tr&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`);
    const data = await response.json();
    const translation = data[0][0][0];
    
    console.log(`✅ Google Translate başarılı: ${translation}`);
    return translation;
  } catch (error) {
    console.error('❌ Google Translate hatası:', error);
    return `[Çeviri hatası] ${text}`;
  }
}

// API Endpoints - Sadece metin çevirisi (Google Translate)
app.post('/api/translate-text', async (req, res) => {
  try {
    const { text, targetLanguage = 'en' } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Çevrilecek metin gerekli!' });
    }
    
    console.log('📝 Metin çevirisi:', text);
    
    const translation = await translateWithGoogle(text, targetLanguage);
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
          
        case 'new_translation':
          // Frontend'ten gelen çeviriyi tüm kullanıcılara yayınla
          console.log('📝 Yeni çeviri alındı:', data.translation);
          if (userInfo.roomId) {
            broadcastToRoom(userInfo.roomId, {
              type: 'new_translation',
              translation: data.translation
            });
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

// Artık ses işleme yapmıyoruz, sadece WebSocket ile çeviri paylaşımı

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