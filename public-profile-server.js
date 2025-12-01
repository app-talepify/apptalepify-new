const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Static dosyaları serve et
app.use(express.static('public'));

// Profil sayfası route'u
app.get('/profile/:username', (req, res) => {
  const { username } = req.params;
  
  // Mock user data - gerçek uygulamada API'den gelecek
  const publicUser = {
    name: 'Alihan Tellioglu',
    username: username,
    profilePicture: null,
    officeName: 'Tellioglu Emlak',
    city: 'Samsun',
    expertTitle: 'Lüks Konut Uzmanı',
    bio: 'Lüks konut sektöründe uzmanlaşmış, müşteri memnuniyetini ön planda tutan deneyimli bir emlak danışmanıyım. Size en uygun konutu bulmanızda yardımcı olmaktan mutluluk duyarım.',
    instagram: '@alihan.tellioglu',
    facebook: 'facebook.com/alihan.tellioglu',
    youtube: 'youtube.com/@alihan.tellioglu',
    phone: '+90 555 123 45 67',
    whatsapp: '+90 555 123 45 67',
    createdAt: new Date('2024-01-01'),
  };

  const userPortfolios = [
    {
      id: '1',
      title: 'Lüks Villa - Atakum',
      location: 'Atakum, Samsun',
      price: 2500000,
      images: ['https://via.placeholder.com/300x200'],
      isPublished: true,
    },
    {
      id: '2',
      title: 'Modern Daire - İlkadım',
      location: 'İlkadım, Samsun',
      price: 850000,
      images: ['https://via.placeholder.com/300x200'],
      isPublished: true,
    },
  ];
  
  // Mobil uygulamadaki profil sayfasının birebir kopyası
  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${publicUser.name} - Talepify Profil</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            min-height: 100vh;
        }
        
        .container {
            max-width: 400px;
            margin: 0 auto;
            background: white;
            min-height: 100vh;
        }
        
        .header {
            background: white;
            padding: 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .back-button {
            width: 40px;
            height: 40px;
            background: #e74c3c;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
            cursor: pointer;
        }
        
        .header-title {
            font-size: 18px;
            font-weight: bold;
            color: #2c3e50;
        }
        
        .content {
            padding: 20px;
        }
        
        .profile-main {
            display: flex;
            align-items: flex-start;
            margin-bottom: 20px;
            position: relative;
        }
        
        .profile-image {
            width: 120px;
            height: 120px;
            border-radius: 16px;
            border: 4px solid #e74c3c;
            object-fit: cover;
        }
        
        .profile-info {
            flex: 1;
            margin-left: 15px;
        }
        
        .profile-name {
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 10px;
            margin-top: 8px;
        }
        
        .badges-container {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .badge {
            display: flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            color: white;
        }
        
        .office-badge {
            background: #e74c3c;
        }
        
        .city-badge {
            background: #e74c3c;
        }
        
        .expert-badge {
            background: #2c3e50;
            border: 1px solid white;
            margin-top: 8px;
        }
        
        .badge-icon {
            width: 14px;
            height: 14px;
            margin-right: 6px;
        }
        
        .badges-row {
            display: flex;
            margin-top: 15px;
            gap: 15px;
            width: 100%;
        }
        
        .social-media-badge {
            display: flex;
            border-radius: 8px;
            padding: 4px 20px;
            gap: 30px;
            background: #e74c3c;
            justify-content: center;
            align-items: center;
            flex: 1;
        }
        
        .social-icon {
            width: 20px;
            height: 20px;
            filter: brightness(0) invert(1);
        }
        
        .contact-badge {
            display: flex;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #e74c3c;
            flex: 1;
        }
        
        .phone-button, .whatsapp-button {
            flex: 1;
            padding: 4px 16px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 32px;
        }
        
        .phone-button {
            background: #2c3e50;
        }
        
        .whatsapp-button {
            background: #25D366;
        }
        
        .contact-icon {
            width: 20px;
            height: 20px;
            filter: brightness(0) invert(1);
        }
        
        .whatsapp-icon {
            width: 30px;
            height: 26px;
            filter: brightness(0) invert(1);
        }
        
        .divider {
            height: 2px;
            background: #e74c3c;
            margin: 20px 0;
            border-radius: 1px;
        }
        
        .profile-stats {
            display: flex;
            justify-content: space-around;
            padding: 20px;
            background: #2c3e50;
            border-radius: 12px;
            margin-bottom: 20px;
        }
        
        .stat-item {
            text-align: center;
        }
        
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: #e74c3c;
        }
        
        .stat-label {
            font-size: 14px;
            color: white;
            margin-top: 5px;
        }
        
        .about-section {
            padding: 20px;
            background: #2c3e50;
            border-radius: 12px;
            margin-bottom: 20px;
        }
        
        .about-title {
            font-size: 18px;
            font-weight: bold;
            color: white;
            margin-bottom: 10px;
        }
        
        .about-text {
            font-size: 16px;
            line-height: 24px;
            font-style: italic;
            color: white;
        }
        
        .portfolios-section {
            padding: 20px;
            background: #2c3e50;
            border-radius: 12px;
            margin-bottom: 20px;
        }
        
        .portfolios-title {
            font-size: 18px;
            font-weight: bold;
            color: white;
            margin-bottom: 15px;
        }
        
        .portfolios-list {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
        }
        
        .portfolio-item {
            width: calc(50% - 7.5px);
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 15px;
        }
        
        .portfolio-image {
            width: 100%;
            height: 120px;
            object-fit: cover;
        }
        
        .portfolio-info {
            padding: 15px;
        }
        
        .portfolio-title {
            font-size: 16px;
            font-weight: 600;
            color: white;
            margin-bottom: 5px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        
        .portfolio-location {
            font-size: 14px;
            color: rgba(255,255,255,0.8);
            margin-bottom: 5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .portfolio-price {
            font-size: 16px;
            font-weight: bold;
            color: #e74c3c;
        }
        
        .empty-portfolios {
            text-align: center;
            padding: 40px 20px;
        }
        
        .empty-portfolios-text {
            font-size: 16px;
            color: rgba(255,255,255,0.8);
            font-style: italic;
        }
        
        .app-button {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #e74c3c;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 25px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="back-button" onclick="history.back()">←</div>
            <div class="header-title">${publicUser.name}</div>
            <div></div>
        </div>
        
        <!-- Content -->
        <div class="content">
            <!-- Profil Resmi ve Bilgiler -->
            <div class="profile-main">
                <img src="${publicUser.profilePicture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiByeD0iMTYiIGZpbGw9IiNlNzRjM2MiLz4KPHRleHQgeD0iNjAiIHk9IjYwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNDgiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlQ8L3RleHQ+Cjwvc3ZnPgo='}" 
                     alt="Profil Resmi" class="profile-image">
                
                <div class="profile-info">
                    <div class="profile-name">${publicUser.name}</div>
                    
                    <div class="badges-container">
                        ${publicUser.officeName ? `
                        <div class="badge office-badge">
                            <span class="badge-icon">🏢</span>
                            <span>${publicUser.officeName}</span>
                        </div>
                        ` : ''}
                        
                        ${publicUser.city ? `
                        <div class="badge city-badge">
                            <span class="badge-icon">📍</span>
                            <span>${publicUser.city}</span>
                        </div>
                        ` : ''}
                        
                        <div class="badge expert-badge">
                            <span>${publicUser.expertTitle}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Sosyal Medya ve İletişim Badge'leri -->
            <div class="badges-row">
                <div class="social-media-badge">
                    <span class="social-icon">📷</span>
                    <span class="social-icon">📘</span>
                    <span class="social-icon">📺</span>
                </div>
                
                <div class="contact-badge">
                    <div class="phone-button">
                        <span class="contact-icon">📞</span>
                    </div>
                    <div class="whatsapp-button">
                        <span class="whatsapp-icon">💬</span>
                    </div>
                </div>
            </div>
            
            <!-- Ayırıcı Çizgi -->
            <div class="divider"></div>
            
            <!-- İstatistikler -->
            <div class="profile-stats">
                <div class="stat-item">
                    <div class="stat-number">${userPortfolios.length}</div>
                    <div class="stat-label">Portföy</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${userPortfolios.filter(p => p.isPublished).length}</div>
                    <div class="stat-label">Yayında</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${Math.floor((new Date() - new Date(publicUser.createdAt)) / (1000 * 60 * 60 * 24))}</div>
                    <div class="stat-label">Gün</div>
                </div>
            </div>
            
            <!-- Hakkında Bölümü -->
            <div class="about-section">
                <div class="about-title">Hakkında</div>
                <div class="about-text">${publicUser.bio}</div>
            </div>
            
            <!-- Portföylerim Bölümü -->
            <div class="portfolios-section">
                <div class="portfolios-title">Portföylerim</div>
                <div class="portfolios-list">
                    ${userPortfolios.filter(portfolio => portfolio.isPublished).map(portfolio => `
                    <div class="portfolio-item">
                        <img src="${portfolio.images[0]}" alt="${portfolio.title}" class="portfolio-image">
                        <div class="portfolio-info">
                            <div class="portfolio-title">${portfolio.title}</div>
                            <div class="portfolio-location">${portfolio.location}</div>
                            <div class="portfolio-price">${portfolio.price ? portfolio.price.toLocaleString() + ' TL' : 'Fiyat Belirtilmemiş'}</div>
                        </div>
                    </div>
                    `).join('')}
                    
                    ${userPortfolios.filter(portfolio => portfolio.isPublished).length === 0 ? `
                    <div class="empty-portfolios">
                        <div class="empty-portfolios-text">Henüz yayınlanmış portföy bulunmuyor</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
        
        <!-- Uygulamada Aç Butonu -->
        <a href="talepifyapp://profile/${username}" class="app-button">
            📱 Uygulamada Aç
        </a>
    </div>
</body>
</html>
  `;
  
  res.send(html);
});

// Ana sayfa
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Talepify Test Server</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .container { max-width: 600px; margin: 0 auto; }
            .logo { font-size: 48px; color: #e74c3c; margin-bottom: 20px; }
            .test-link { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
            .test-link a { color: #e74c3c; text-decoration: none; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🏠</div>
            <h1>Talepify Test Server</h1>
            <p>Profil paylaşım test sunucusu çalışıyor!</p>
            
            <div class="test-link">
                <h3>Test Linkleri:</h3>
                <p><a href="/profile/alihan.tellioglu">/profile/alihan.tellioglu</a></p>
                <p><a href="/profile/test.user">/profile/test.user</a></p>
            </div>
            
            <p>Sunucu: http://192.168.1.31:3000</p>
        </div>
    </body>
    </html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Talepify Test Server çalışıyor!`);
  console.log(`📱 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://192.168.1.31:${PORT}`);
  console.log(`👤 Test Profil: http://192.168.1.31:${PORT}/profile/alihan.tellioglu`);
});
