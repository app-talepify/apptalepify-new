import { auth } from '../firebase';
import { API_BASE_URL } from '@env';

// Dev log helpers (prod'da sessiz)
const devLog = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.log(...args); /* eslint-enable no-console */ } catch {} } };
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

// Favori portföyler için fiyat değişimi bildirimi
// Not: Bu fonksiyon server tarafında aşağıdaki endpoint'in var olduğunu varsayar:
// POST ${API_BASE_URL}/notifications/portfolio-price-change
// Body: { portfolioId, oldPrice, newPrice, direction }
export const notifyPortfolioPriceChange = async (portfolioId, oldPrice, newPrice) => {
  try {
    if (!API_BASE_URL) { devWarn('[notifyPortfolioPriceChange] API_BASE_URL yok, istek atlanıyor'); return; }
    if (!portfolioId) { devWarn('[notifyPortfolioPriceChange] portfolioId yok, istek atlanıyor'); return; }

    const oldVal = Number(oldPrice);
    const newVal = Number(newPrice);
    if (!Number.isFinite(oldVal) || !Number.isFinite(newVal)) {
      devWarn('[notifyPortfolioPriceChange] Geçersiz fiyat değerleri, istek atlanıyor', { oldPrice, newPrice });
      return;
    }

    // Yönü belirle (her farkta bildirim: küçük de olsa)
    const direction = newVal >= oldVal ? 'up' : 'down';

    const token = await auth.currentUser?.getIdToken?.();
    const uid = auth.currentUser?.uid || null;
    if (!token) { devWarn('[notifyPortfolioPriceChange] idToken yok, istek atlanıyor'); return; }

    const url = `${API_BASE_URL}/notifications/portfolio-price-change`;
    devLog('[notifyPortfolioPriceChange] POST →', url, { portfolioId, uid, direction });

    // 8 sn timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), 8000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid,
          portfolioId,
          oldPrice: oldVal,
          newPrice: newVal,
          direction,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!resp?.ok) {
        devWarn('[notifyPortfolioPriceChange] API yanıtı başarısız', resp?.status);
      } else {
        devLog('[notifyPortfolioPriceChange] API OK');
      }
    } catch (innerErr) {
      clearTimeout(timeoutId);
      devWarn('[notifyPortfolioPriceChange] ağ/timeout hatası', innerErr?.message || innerErr);
    }
  } catch (error) {
    devWarn('[notifyPortfolioPriceChange] error:', error?.message || String(error));
  }
};

export default {
  notifyPortfolioPriceChange,
};


