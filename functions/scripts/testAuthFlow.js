// Firebase Auth Custom Token Comprehensive Test Suite
// Kullanım: node scripts/testAuthFlow.js [options]

const axios = require('axios');
const crypto = require('crypto');

// Test configuration
const config = {
  testPhone: process.argv.find(arg => arg.startsWith('--phone='))?.split('=')[1] || '+905335639228',
  useLocal: process.argv.includes('--local'),
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
  skipInteractive: process.argv.includes('--ci'),
  testSuite: process.argv.find(arg => arg.startsWith('--suite='))?.split('=')[1] || 'smoke',
};

const API_BASE_URL = config.useLocal 
  ? 'http://localhost:5001/apptalepify-14dbc/europe-west1/bunny'
  : 'https://europe-west1-apptalepify-14dbc.cloudfunctions.net/bunny';

// Test suites
const TEST_SUITES = {
  smoke: ['health', 'requestOtp', 'invalidOtp'],
  security: ['health', 'requestOtp', 'rateLimit', 'invalidOtp', 'bruteForce'],
  full: ['health', 'requestOtp', 'rateLimit', 'invalidOtp', 'bruteForce', 'edgeCases'],
  interactive: ['health', 'requestOtp', 'fullFlow']
};

console.log(`
🧪 Firebase Auth Custom Token Test Suite
=======================================
📱 Test Phone: ${config.testPhone}
🌐 API URL: ${API_BASE_URL}
🏠 Environment: ${config.useLocal ? 'Local Emulator' : 'Production'}
🧪 Test Suite: ${config.testSuite}
📝 Verbose: ${config.verbose}
🤖 CI Mode: ${config.skipInteractive}
`);

/**
 * API client
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Test helper functions
 */
function log(step, message, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${step}: ${message}`);
  if (data) {
    console.log(`  Data:`, JSON.stringify(data, null, 2));
  }
}

function logError(step, error) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`[${timestamp}] ❌ ${step}:`, error.message);
  if (error.response?.data) {
    console.error(`  API Error:`, error.response.data);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Health check test
 */
async function testHealthCheck() {
  try {
    log('HEALTH', 'API durumu kontrol ediliyor...');
    
    const response = await apiClient.get('/health');
    
    if (response.data.ok) {
      log('HEALTH', '✅ API erişilebilir', response.data);
      return true;
    } else {
      log('HEALTH', '❌ API sağlıksız', response.data);
      return false;
    }
  } catch (error) {
    logError('HEALTH', error);
    return false;
  }
}

/**
 * OTP request test
 */
async function testRequestOtp(phoneNumber, purpose = 'login') {
  try {
    log('OTP_REQUEST', `OTP isteniyor: ${phoneNumber} (${purpose})`);
    
    const response = await apiClient.post('/auth/request-otp', {
      phoneNumber,
      purpose,
    });
    
    if (response.data.success) {
      log('OTP_REQUEST', '✅ OTP başarıyla gönderildi', {
        message: response.data.message,
        ttlSeconds: response.data.data?.ttlSeconds,
      });
      return true;
    } else {
      log('OTP_REQUEST', '❌ OTP gönderim başarısız', response.data);
      return false;
    }
  } catch (error) {
    logError('OTP_REQUEST', error);
    return false;
  }
}

/**
 * OTP verification test
 */
async function testVerifyOtp(phoneNumber, code, purpose = 'login') {
  try {
    log('OTP_VERIFY', `OTP doğrulanıyor: ${phoneNumber} (${purpose})`);
    
    const response = await apiClient.post('/auth/verify-otp', {
      phoneNumber,
      code,
      purpose,
    });
    
    if (response.data.success && response.data.verified) {
      log('OTP_VERIFY', '✅ OTP başarıyla doğrulandı', {
        message: response.data.message,
      });
      return true;
    } else {
      log('OTP_VERIFY', '❌ OTP doğrulama başarısız', response.data);
      return false;
    }
  } catch (error) {
    logError('OTP_VERIFY', error);
    return false;
  }
}

/**
 * Login with OTP test
 */
async function testLoginWithOtp(phoneNumber, code, purpose = 'login') {
  try {
    log('LOGIN_OTP', `OTP ile giriş: ${phoneNumber} (${purpose})`);
    
    const response = await apiClient.post('/auth/login-with-otp', {
      phoneNumber,
      code,
      purpose,
    });
    
    if (response.data.success) {
      const { uid, token, user } = response.data.data;
      
      log('LOGIN_OTP', '✅ OTP login başarılı', {
        uid: uid,
        tokenLength: token.length,
        userInfo: {
          phoneNumber: user.phoneNumber,
          displayName: user.displayName,
          city: user.city,
        },
      });
      
      return { uid, token, user };
    } else {
      log('LOGIN_OTP', '❌ OTP login başarısız', response.data);
      return null;
    }
  } catch (error) {
    logError('LOGIN_OTP', error);
    return null;
  }
}

/**
 * Rate limit test - gelişmiş
 */
async function testRateLimit(phoneNumber) {
  try {
    log('RATE_LIMIT', 'Rate limiting testi başlatılıyor...');
    
    // Test için farklı telefon numarası kullan
    const testPhone = phoneNumber.replace(/\d$/, '9');
    
    let rateLimitTriggered = false;
    let successCount = 0;
    
    // Hızlı ardışık istekler gönder
    for (let i = 1; i <= 5; i++) {
      try {
        const response = await apiClient.post('/auth/request-otp', {
          phoneNumber: testPhone,
          purpose: 'login',
        });
        
        if (response.data.ok) {
          successCount++;
          log('RATE_LIMIT', `İstek ${i}: ✅ Başarılı (${successCount})`);
        }
      } catch (error) {
        if (error.response?.status === 429) {
          log('RATE_LIMIT', `İstek ${i}: ✅ Rate limit devreye girdi`, {
            code: error.response.data.code,
            message: error.response.data.message,
            resetAt: error.response.data.resetAt,
          });
          rateLimitTriggered = true;
          break;
        } else {
          logError('RATE_LIMIT', error);
        }
      }
      
      await sleep(200); // 200ms bekle
    }
    
    if (rateLimitTriggered) {
      log('RATE_LIMIT', `✅ Rate limit başarıyla çalıştı (${successCount} başarılı istek sonrası)`);
      return true;
    } else {
      log('RATE_LIMIT', `⚠️ Rate limit tetiklenmedi (${successCount} başarılı istek)`);
      return false;
    }
  } catch (error) {
    logError('RATE_LIMIT', error);
    return false;
  }
}

/**
 * Brute force protection test
 */
async function testBruteForce(phoneNumber) {
  try {
    log('BRUTE_FORCE', 'Brute force koruması testi başlatılıyor...');
    
    // Test için farklı telefon numarası
    const testPhone = phoneNumber.replace(/\d$/, '8');
    
    // Önce OTP iste
    const otpResponse = await apiClient.post('/auth/request-otp', {
      phoneNumber: testPhone,
      purpose: 'login',
    });
    
    if (!otpResponse.data.ok) {
      log('BRUTE_FORCE', '❌ OTP istenemedi');
      return false;
    }
    
    log('BRUTE_FORCE', 'OTP istendi, şimdi hatalı kodlarla deneyecek...');
    
    let lockTriggered = false;
    
    // 6 kez hatalı kod dene
    for (let i = 1; i <= 6; i++) {
      try {
        const wrongCode = String(Math.floor(100000 + Math.random() * 899999));
        
        await apiClient.post('/auth/verify-otp', {
          phoneNumber: testPhone,
          code: wrongCode,
          purpose: 'login',
        });
        
        log('BRUTE_FORCE', `Deneme ${i}: ⚠️ Hatalı kod kabul edildi (güvenlik sorunu!)`);
      } catch (error) {
        if (error.response?.status === 429 || error.response?.data?.code === 'OTP_LOCKED') {
          log('BRUTE_FORCE', `Deneme ${i}: ✅ OTP kilidi devreye girdi`, {
            code: error.response.data.code,
            message: error.response.data.message,
            lockUntil: error.response.data.lockUntil,
          });
          lockTriggered = true;
          break;
        } else if (error.response?.data?.code === 'INVALID_OTP') {
          log('BRUTE_FORCE', `Deneme ${i}: ✅ Hatalı kod reddedildi`, {
            remainingAttempts: error.response.data.data?.remainingAttempts,
          });
        } else {
          logError('BRUTE_FORCE', error);
        }
      }
      
      await sleep(100);
    }
    
    if (lockTriggered) {
      log('BRUTE_FORCE', '✅ Brute force koruması başarıyla çalıştı');
      return true;
    } else {
      log('BRUTE_FORCE', '⚠️ Brute force koruması tetiklenmedi');
      return false;
    }
  } catch (error) {
    logError('BRUTE_FORCE', error);
    return false;
  }
}

/**
 * Edge cases test
 */
async function testEdgeCases() {
  try {
    log('EDGE_CASES', 'Edge cases testi başlatılıyor...');
    
    const tests = [
      {
        name: 'Geçersiz telefon formatı',
        test: () => apiClient.post('/auth/request-otp', {
          phoneNumber: '05551234567', // + eksik
          purpose: 'login',
        }),
        expectedError: true,
      },
      {
        name: 'Geçersiz OTP formatı',
        test: () => apiClient.post('/auth/verify-otp', {
          phoneNumber: '+905551234567',
          code: '12345', // 5 haneli
          purpose: 'login',
        }),
        expectedError: true,
      },
      {
        name: 'Geçersiz purpose',
        test: () => apiClient.post('/auth/request-otp', {
          phoneNumber: '+905551234567',
          purpose: 'invalid_purpose',
        }),
        expectedError: true,
      },
      {
        name: 'Boş request body',
        test: () => apiClient.post('/auth/request-otp', {}),
        expectedError: true,
      },
    ];
    
    let passedTests = 0;
    
    for (const testCase of tests) {
      try {
        await testCase.test();
        
        if (testCase.expectedError) {
          log('EDGE_CASES', `${testCase.name}: ❌ Hata beklendi ama başarılı`);
        } else {
          log('EDGE_CASES', `${testCase.name}: ✅ Başarılı`);
          passedTests++;
        }
      } catch (error) {
        if (testCase.expectedError) {
          log('EDGE_CASES', `${testCase.name}: ✅ Beklenen hata alındı`, {
            status: error.response?.status,
            code: error.response?.data?.code,
          });
          passedTests++;
        } else {
          log('EDGE_CASES', `${testCase.name}: ❌ Beklenmeyen hata`);
          logError('EDGE_CASES', error);
        }
      }
    }
    
    log('EDGE_CASES', `✅ Edge cases testi tamamlandı: ${passedTests}/${tests.length} başarılı`);
    return passedTests === tests.length;
  } catch (error) {
    logError('EDGE_CASES', error);
    return false;
  }
}

/**
 * Invalid OTP test
 */
async function testInvalidOtp(phoneNumber) {
  try {
    log('INVALID_OTP', 'Geçersiz OTP testi...');
    
    // Geçersiz kod ile test
    const response = await apiClient.post('/auth/verify-otp', {
      phoneNumber,
      code: '000000', // Geçersiz kod
      purpose: 'login',
    });
    
    if (!response.data.success && response.data.error === 'invalid_otp') {
      log('INVALID_OTP', '✅ Geçersiz OTP düzgün reddedildi', {
        error: response.data.error,
        message: response.data.message,
      });
      return true;
    } else {
      log('INVALID_OTP', '❌ Geçersiz OTP kabul edildi (güvenlik sorunu!)', response.data);
      return false;
    }
  } catch (error) {
    if (error.response?.data?.error === 'invalid_otp') {
      log('INVALID_OTP', '✅ Geçersiz OTP düzgün reddedildi (exception)', {
        error: error.response.data.error,
        message: error.response.data.message,
      });
      return true;
    }
    
    logError('INVALID_OTP', error);
    return false;
  }
}

/**
 * Test suite runner
 */
async function runTestSuite(suiteName) {
  const tests = TEST_SUITES[suiteName];
  if (!tests) {
    console.error(`❌ Bilinmeyen test suite: ${suiteName}`);
    console.log(`Mevcut suites: ${Object.keys(TEST_SUITES).join(', ')}`);
    return;
  }
  
  console.log(`\n🚀 Test Suite "${suiteName}" başlatılıyor...\n`);
  
  const testResults = {};
  const testFunctions = {
    health: () => testHealthCheck(),
    requestOtp: () => testRequestOtp(config.testPhone),
    rateLimit: () => testRateLimit(config.testPhone),
    invalidOtp: () => testInvalidOtp(config.testPhone),
    bruteForce: () => testBruteForce(config.testPhone),
    edgeCases: () => testEdgeCases(),
    fullFlow: () => runInteractiveTest(),
  };
  
  for (const testName of tests) {
    try {
      if (testName === 'fullFlow' && config.skipInteractive) {
        log(testName.toUpperCase(), 'Atlandı (CI mode)');
        testResults[testName] = null;
        continue;
      }
      
      console.log(`\n📋 Test: ${testName}`);
      console.log('─'.repeat(50));
      
      const testFunction = testFunctions[testName];
      if (!testFunction) {
        console.error(`❌ Test fonksiyonu bulunamadı: ${testName}`);
        testResults[testName] = false;
        continue;
      }
      
      const startTime = Date.now();
      testResults[testName] = await testFunction();
      const duration = Date.now() - startTime;
      
      const status = testResults[testName] ? '✅ PASS' : '❌ FAIL';
      console.log(`\n${status} ${testName} (${duration}ms)\n`);
      
      // Testler arası bekle (rate limit için)
      if (tests.indexOf(testName) < tests.length - 1) {
        await sleep(1000);
      }
      
    } catch (error) {
      console.error(`❌ Test "${testName}" failed with error:`, error.message);
      testResults[testName] = false;
    }
  }
  
  return testResults;
}

/**
 * Interactive test (kullanıcı input ile)
 */
async function runInteractiveTest() {
  const readline = require('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  function question(prompt) {
    return new Promise(resolve => {
      rl.question(prompt, resolve);
    });
  }
  
  try {
    console.log('\n🎮 İnteraktif test modu\n');
    
    // Phone number input
    const phoneNumber = await question(`📱 Telefon numarası (Enter = ${TEST_PHONE}): `) || TEST_PHONE;
    
    // OTP request
    const otpSent = await testRequestOtp(phoneNumber);
    if (!otpSent) {
      console.log('\n❌ OTP gönderilemedi, test durduruldu.\n');
      return;
    }
    
    // OTP input
    const otpCode = await question('\n📩 Aldığınız OTP kodunu girin: ');
    if (!otpCode || otpCode.length !== 6) {
      console.log('❌ Geçersiz OTP formatı\n');
      return;
    }
    
    console.log(''); // Boş satır
    
    // Verify OTP
    const otpVerified = await testVerifyOtp(phoneNumber, otpCode);
    if (!otpVerified) {
      console.log('\n❌ OTP doğrulanamadı\n');
      return;
    }
    
    console.log(''); // Boş satır
    
    // Login with OTP
    const loginResult = await testLoginWithOtp(phoneNumber, otpCode);
    if (loginResult) {
      console.log('\n🎉 Tam akış test edildi - tüm adımlar başarılı!\n');
      
      console.log('📊 Login Sonucu:');
      console.log(`  UID: ${loginResult.uid}`);
      console.log(`  Token uzunluğu: ${loginResult.token.length} karakter`);
      console.log(`  Kullanıcı: ${loginResult.user.phoneNumber}`);
    } else {
      console.log('\n❌ Login başarısız\n');
    }
    
  } finally {
    rl.close();
  }
}

/**
 * Test özeti
 */
function printSummary(results) {
  console.log(`
📊 TEST SONUÇLARI
===============
✅ Health Check: ${results.health ? 'BAŞARILI' : 'BAŞARISIZ'}
✅ OTP Request: ${results.otpRequest ? 'BAŞARILI' : 'BAŞARISIZ'}
✅ Rate Limiting: ${results.rateLimit ? 'BAŞARILI' : 'BAŞARISIZ'}
✅ Invalid OTP Rejection: ${results.invalidOtp ? 'BAŞARILI' : 'BAŞARISIZ'}

${Object.values(results).every(r => r) ? '🎉 TÜM TESTLER BAŞARILI!' : '⚠️ BAZI TESTLER BAŞARISIZ'}

💡 Full flow testi için: node scripts/testAuthFlow.js --interactive
`);
}

/**
 * Ana fonksiyon
 */
async function main() {
  try {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      console.log(`
Firebase Auth Custom Token Test Suite

Kullanım:
  node scripts/testAuthFlow.js [options]

Options:
  --phone=+905335639228      Test telefon numarası (E.164 format)
  --local                    Local emulator kullan (port 5001)
  --suite=<name>             Test suite seç: smoke, security, full, interactive
  --verbose, -v              Detaylı log
  --ci                       CI mode (interactive testleri atla)
  --help, -h                 Bu yardım mesajı

Test Suites:
  smoke      : Temel işlevsellik (health, requestOtp, invalidOtp)
  security   : Güvenlik testleri (rate limit, brute force)
  full       : Tüm testler (smoke + security + edge cases)
  interactive: Gerçek OTP ile full flow test

Örnekler:
  node scripts/testAuthFlow.js
  node scripts/testAuthFlow.js --suite=security --verbose
  node scripts/testAuthFlow.js --phone=+905551234567 --local
  node scripts/testAuthFlow.js --suite=interactive
  node scripts/testAuthFlow.js --suite=full --ci
`);
      return;
    }
    
    // Test suite çalıştır
    const results = await runTestSuite(config.testSuite);
    
    if (results) {
      printSummary(results);
      
      // Exit code belirleme
      const failedTests = Object.values(results).filter(result => result === false).length;
      const exitCode = failedTests > 0 ? 1 : 0;
      
      if (exitCode !== 0) {
        console.log(`\n❌ ${failedTests} test başarısız - exit code: ${exitCode}`);
      }
      
      process.exit(exitCode);
    }
    
  } catch (error) {
    console.error('\n🚨 Test script hatası:', error.message);
    if (config.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Script'i çalıştır
if (require.main === module) {
  main();
}
