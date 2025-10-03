# Hostinger + CloudPanel Deploy Rehberi

## 1. CloudPanel'de Node.js Sitesi Oluşturma

1. CloudPanel'e giriş yapın
2. "Sites" → "Add Site"
3. Site Type: "Node.js"
4. Domain: `translation.yourdomain.com` (subdomain)
5. Node.js Version: 18.x veya 20.x
6. Create Site

## 2. Dosyaları Upload Etme

### Yöntem 1: Git Clone (Önerilen)
```bash
# CloudPanel terminal'de
cd /home/cloudpanel/htdocs/translation.yourdomain.com
git clone https://github.com/barnoloji/ai-canli-ceviri.git .
npm install
npm run build
```

### Yöntem 2: Manuel Upload
1. Tüm dosyaları ZIP olarak sıkıştır
2. CloudPanel File Manager ile upload et
3. Extract et
4. Terminal'de:
```bash
cd /home/cloudpanel/htdocs/translation.yourdomain.com
npm install
npm run build
```

## 3. Environment Variables

CloudPanel'de Environment Variables ekle:
- `NODE_ENV=production`
- `PORT=3000`

## 4. SSL Sertifikası

CloudPanel'de SSL sertifikası aktif et (Let's Encrypt ücretsiz)

## 5. Domain Ayarları

Hostinger DNS ayarlarında:
- Type: A
- Name: translation
- Value: Server IP
- TTL: 3600

## 6. Test

- https://translation.yourdomain.com adresine git
- WebSocket bağlantısı otomatik olacak
- Davet linki çalışacak

## Sorun Giderme

### WebSocket Bağlantı Hatası
- SSL sertifikası aktif mi kontrol et
- Firewall ayarlarını kontrol et
- CloudPanel'de Node.js process çalışıyor mu kontrol et

### Build Hatası
```bash
# Node.js version kontrol et
node --version
npm --version

# Cache temizle
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Port Hatası
- CloudPanel'de PORT=3000 ayarla
- Process Manager'da port kontrol et
