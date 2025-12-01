import admin from 'firebase-admin';
import RSSParser from 'rss-parser';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modüllerinde __dirname alternatifi
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, '../keys/apptalepify-14dbc-firebase-adminsdk-fbsvc-927bdbad28.json'), 'utf8'));

// --- config (env-overridable) ---
const MAX_OG_FETCH = Number(process.env.MAX_OG_FETCH || '80');
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || '8000');
const USER_AGENT = process.env.NEWS_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}
const db = admin.firestore();

const parser = new RSSParser({
  timeout: 20000,
  customFields: { 
    item: [
      ['media:content','mediaContent'], 
      ['media:thumbnail','mediaThumb'],
      ['media:group', 'mediaGroup'],
      ['enclosure', 'enclosure'],
      ['description', 'description'],
      ['content:encoded', 'contentEncoded'],
      'source'
    ] 
  }
});

const FEEDS = (process.env.NEWS_FEEDS_TR || '').split('\n').filter(Boolean);
if (!FEEDS.length) {
  // Emlak Pencerem - Kaliteli ve resimli haberler
  FEEDS.push(
    'https://www.emlakpencerem.com.tr/rss.xml'
  );
}

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const resolveDirectUrl = (link) => {
  try { const u = new URL(link); return u.searchParams.get('url') || link; }
  catch { return link; }
};

// --- utils for OG image extraction ---
function absolutize(u, base) {
  try {
    if (!u) return null;
    if (u.startsWith('data:')) return null;
    if (u.startsWith('//')) return 'https:' + u;
    return new URL(u, base).toString();
  } catch { return null; }
}

function extractOgImage(html, baseUrl) {
  const pick = (re) => {
    const m = html.match(re);
    return m && m[1] ? absolutize(m[1].trim(), baseUrl) : null;
  };
  return (
    pick(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+name=["']twitter:image:src["'][^>]*content=["']([^"']+)["']/i) ||
    pick(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)
  );
}

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    return res;
  } finally { clearTimeout(to); }
}

async function discoverFinalUrlAndOgImage(url) {
  let res;
  try { res = await fetchWithTimeout(url); }
  catch { return { finalUrl: url, ogImage: null }; }

  const finalUrl = res?.url || url;
  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('text/html')) return { finalUrl, ogImage: null };

  let html = null;
  try { html = await res.text(); } catch {}
  if (!html) return { finalUrl, ogImage: null };

  return { finalUrl, ogImage: extractOgImage(html, finalUrl) };
}

function extractImageFromContent(content, baseUrl) {
  if (!content) return null;
  
  // HTML içinden img src çek
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/i;
  const match = content.match(imgRegex);
  if (match && match[1]) {
    const imageUrl = absolutize(match[1], baseUrl);
    if (imageUrl) return imageUrl;
  }
  
  // URL pattern ara
  const urlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif))/i;
  const urlMatch = content.match(urlRegex);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  
  return null;
}

async function upsert(item, ogBudget) {
  const raw = item.link || item.guid || '';
  const prelimUrl = resolveDirectUrl(raw);
  const id = sha1(prelimUrl);
  const publishedAt = item.isoDate ? new Date(item.isoDate).toISOString() : new Date().toISOString();
  
  console.log('📰 HABER:', (item.title || '').substring(0, 50) + '...');
  
  // Resim kaynakları (öncelik sırasına göre)
  let image = null;

  // 1. Description/content içinden çek (emlakpencerem için öncelikli)
  if (item.description) {
    image = extractImageFromContent(item.description, prelimUrl);
    if (image) console.log('   🖼️ Resim kaynağı: Description (HTML)');
  }
  if (!image && item.contentEncoded) {
    image = extractImageFromContent(item.contentEncoded, prelimUrl);
    if (image) console.log('   🖼️ Resim kaynağı: Content encoded (HTML)');
  }
  if (!image && item.content) {
    image = extractImageFromContent(item.content, prelimUrl);
    if (image) console.log('   🖼️ Resim kaynağı: Content (HTML)');
  }
  
  // 2. Enclosure (podcast/medya ekleri)
  if (!image && item.enclosure?.url) {
    image = item.enclosure.url;
    console.log('   🖼️ Resim kaynağı: Enclosure');
  }
  // 3. Media content
  else if (!image && item.mediaContent?.$?.url) {
    image = item.mediaContent.$.url;
    console.log('   🖼️ Resim kaynağı: Media content');
  }
  // 4. Media thumbnail  
  else if (!image && item.mediaThumb?.$?.url) {
    image = item.mediaThumb.$.url;
    console.log('   🖼️ Resim kaynağı: Media thumbnail');
  }
  // 5. Media group
  else if (!image && item.mediaGroup?.['media:content']?.[0]?.$?.url) {
    image = item.mediaGroup['media:content'][0].$.url;
    console.log('   🖼️ Resim kaynağı: Media group');
  }

  const docRef = db.collection('news').doc(id);
  
  // if previously saved doc has image, reuse
  const prev = await docRef.get();
  if (!image && prev.exists && prev.data()?.image) {
    image = prev.data().image;
    console.log('   🖼️ Resim kaynağı: Önceki kayıt');
  }

  // if still no image, try OG (limited)
  if (!image && ogBudget.left > 0) {
    try {
      console.log('   🔍 OG image çekiliyor... (Kalan:', ogBudget.left, ')');
      const { finalUrl, ogImage } = await discoverFinalUrlAndOgImage(prelimUrl);
      if (ogImage) {
        // Kötü/placeholder resimleri filtrele
        const badDomains = [
          'googleusercontent.com', 'gstatic.com', 'google.com/logos',
          'placeholder', 'default', 'logo.png', 'favicon',
          'avatar', 'profile.jpg', 'no-image', 'coming-soon'
        ];
        
        const isBadImage = badDomains.some(bad => ogImage.toLowerCase().includes(bad));
        
        if (isBadImage) {
          console.log('   ❌ Placeholder/logo resmi - atlanıyor');
        } else {
          // Gerçek haber resmi gibi görünüyor
          image = ogImage;
          console.log('   ✅ OG image bulundu:', ogImage.substring(0, 50) + '...');
          console.log('   📄 Kaynak site:', finalUrl.split('/')[2]);
        }
      } else {
        console.log('   ❌ OG image bulunamadı');
      }
      ogBudget.left--;
      // be polite
      await new Promise(r => setTimeout(r, 250));
    } catch (e) {
      console.log('   ⚠️ OG fetch hatası:', e.message);
    }
  }
  
  // Sadece resimli haberleri kaydet
  if (!image) {
    console.log('   ❌ RESİM YOK - Haber atlandı');
    return; // Resim yoksa bu haberi kaydetme
  }
  
  console.log('   ✅ RESİMLİ HABER - Kaydediliyor');

  const data = {
    title: (item.title || '').trim(),
    summary: (item.contentSnippet || '').trim(),
    url: prelimUrl,
    source: (item.source && item.source._) || item.creator || item.author || 'Kaynak',
    image,
    publishedAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  await docRef.set(data, { merge: true });
}

async function cleanupOldNews() {
  try {
    const snapshot = await db.collection('news')
      .orderBy('publishedAt', 'desc')
      .offset(100)
      .get();
    
    const batch = db.batch();
    let deleteCount = 0;
    
    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });
    
    if (deleteCount > 0) {
      await batch.commit();
      console.log(`Deleted ${deleteCount} old news items (keeping latest 100)`);
    }
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
}

async function run() {
  const ogBudget = { left: MAX_OG_FETCH };
  let count = 0;
  const newItems = [];
  
  for (const feedUrl of FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const it of (feed.items || [])) {
        try { 
          await upsert(it, ogBudget); 
          count++;
          newItems.push(it);
        }
        catch (e) { console.error('item err:', it.link, e.message); }
      }
    } catch (e) {
      console.error('feed err:', feedUrl, e.message);
    }
  }
  
  // 100'den fazla haber varsa eskilerini sil
  if (count > 0) {
    await cleanupOldNews();
  }
  
  console.log(`Done. Upserted: ${count} news items. OG fetches left: ${ogBudget.left}`);
}

run().then(()=>process.exit(0)).catch((e)=>{console.error(e); process.exit(1);});
