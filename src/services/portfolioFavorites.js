import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase';
import { API_BASE_URL } from '@env';

const makeKey = (userId) => `portfolio_favorites_${userId || 'anon'}`;

export const getPortfolioFavorites = async (userId) => {
  try {
    const raw = await AsyncStorage.getItem(makeKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    // Tüm ID'leri string'e normalize et (tür uyumsuzluğunu önlemek için)
    return arr.map((v) => String(v));
  } catch {
    return [];
  }
};

export const setPortfolioFavorites = async (userId, ids) => {
  try {
    const normalized = Array.isArray(ids) ? ids.map((v) => String(v)) : [];
    await AsyncStorage.setItem(makeKey(userId), JSON.stringify(normalized));
  } catch {}
};

// Sunucuya favori portföy izleme bilgisini senkronize et (prod için)
const syncFavoriteToServer = async (userId, portfolioId, isFavorite) => {
  try {
    if (!API_BASE_URL || !userId || !portfolioId) return;
    const token = await auth.currentUser?.getIdToken?.();
    if (!token) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    await fetch(`${API_BASE_URL}/notifications/portfolio-favorite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        uid: userId,
        portfolioId,
        action: isFavorite ? 'favorite' : 'unfavorite',
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    // Sunucu senkronizasyonu best-effort, sessizce geç
  }
};

export const togglePortfolioFavorite = async (userId, portfolioId) => {
  try {
    const current = await getPortfolioFavorites(userId);
    const pid = String(portfolioId);
    let next = [];
    if (current.includes(pid)) {
      next = current.filter((id) => id !== pid);
    } else {
      next = [...current, pid];
    }
    await setPortfolioFavorites(userId, next);

    // Server tarafındaki izleme listesi ile senkronize et
    const isNowFavorite = next.includes(pid);
    syncFavoriteToServer(userId, pid, isNowFavorite);

    return next;
  } catch {
    return null;
  }
};

export const isPortfolioFavorite = (favoritesSetOrArray, portfolioId) => {
  if (!portfolioId) return false;
  if (favoritesSetOrArray instanceof Set) {
    return favoritesSetOrArray.has(portfolioId);
  }
  if (Array.isArray(favoritesSetOrArray)) {
    return favoritesSetOrArray.includes(portfolioId);
  }
  return false;
};


