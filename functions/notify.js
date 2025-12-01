const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { sendPushToUser } = require('./fcm');

const db = admin.firestore();

/**
 * Bir kullanıcının aboneliğini belirli bir gün kadar uzatır.
 * @param {string} userId - Ödül verilecek kullanıcının ID'si.
 * @param {number} daysToAdd - Eklenecek gün sayısı.
 * @returns {Promise<Date>} Yeni son kullanma tarihi.
 */
async function extendUserSubscription(userId, daysToAdd) {
    const userRef = db.collection('users').doc(userId);

    return db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new Error(`Ödül verilecek kullanıcı bulunamadı: ${userId}`);
        }

        const userData = userDoc.data();
        const currentExpiry = userData.subscriptionExpiryDate ? userData.subscriptionExpiryDate.toDate() : new Date();
        
        const newExpiryDate = new Date(currentExpiry.getTime());
        newExpiryDate.setDate(newExpiryDate.getDate() + daysToAdd);

        transaction.update(userRef, {
            subscriptionExpiryDate: admin.firestore.Timestamp.fromDate(newExpiryDate),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return newExpiryDate;
    });
}

/**
 * Referans sürecini tamamlar:
 * 1. Referans kaydını 'completed' olarak günceller.
 * 2. Davet eden kişiye 30 gün abonelik ekler.
 * 3. Davet eden kişiye bildirim gönderir.
 * @param {string} referredUserId - Davet edilen ve abonelik alan kullanıcı ID'si.
 * @param {string} referralCode - Kullanılan referans kodu.
 */
async function completeReferralAndGrantReward(referredUserId, referralCode) {
    console.log(`Referans süreci başlatıldı. Davet edilen: ${referredUserId}, Kod: ${referralCode}`);

    const referralsRef = db.collection('referrals');
    const q = referralsRef
        .where('referredId', '==', referredUserId)
        .where('referralCode', '==', referralCode)
        .where('status', '==', 'pending')
        .limit(1);

    const snapshot = await q.get();

    if (snapshot.empty) {
        console.warn(`İşlenecek aktif referans kaydı bulunamadı. Davet edilen: ${referredUserId}, Kod: ${referralCode}`);
        return;
    }

    const referralDoc = snapshot.docs[0];
    const referralData = referralDoc.data();
    const referrerId = referralData.referrerId;
    const rewardDays = referralData.rewardDays || 30;

    // 1. Referans kaydını güncelle
    await referralDoc.ref.update({
        status: 'completed',
        subscriptionPurchased: true,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Referans kaydı güncellendi: ${referralDoc.id}`);

    // 2. Davet edene ödülü (30 gün) ver
    try {
        await extendUserSubscription(referrerId, rewardDays);
        console.log(`${referrerId} kullanıcısına ${rewardDays} gün eklendi.`);

        // 3. Davet edene bildirim gönder
        const referrerProfileSnap = await db.collection('users').doc(referrerId).get();
        const referredProfileSnap = await db.collection('users').doc(referredUserId).get();

        const referrerName = referrerProfileSnap.data()?.displayName || 'Bir kullanıcı';
        const referredName = referredProfileSnap.data()?.displayName || 'Bir arkadaşın';

        const title = `Tebrikler, ${referrerName}!`;
        const body = `${referredName} abonelik başlattı ve hesabına ${rewardDays} gün eklendi!`;

        await sendPushToUser(referrerId, {
            title,
            body,
            type: 'referral_reward',
            channelId: 'referral-notifications',
            dedupeKey: `referral_reward:${referralDoc.id}`,
            data: {
                rewardDays: String(rewardDays),
                referredUserId: referredUserId,
            }
        });
        console.log(`Bildirim gönderildi: ${referrerId}`);

    } catch (error) {
        console.error(`Referans ödülü verilirken hata oluştu: ${error.message}`, { referrerId, referredUserId });
        // Hata durumunda referans kaydını tekrar 'pending' durumuna almayı düşünebiliriz.
        await referralDoc.ref.update({
            status: 'pending',
            notes: `Ödül verilirken hata oluştu: ${error.message}`,
        });
    }
}

// Notification message helpers
function portfolioMessage(phase) {
  const map = {
    d10: { title: 'Portföy Hatırlatma', body: 'Portföyünüz 10+ gündür yayında. Güncellemeyi unutmayın.' },
    d20: { title: 'Portföy Hatırlatma', body: 'Portföyünüz 20+ gündür yayında. Yakında pasif olabilir.' },
    d30: { title: 'Portföy Güncelleme', body: 'Portföyünüz 30+ gün oldu. Yakında silinebilir.' },
    d40: { title: 'Portföy Havuzdan Kaldırıldı', body: 'Portföyünüz havuzdan yayından kaldırıldı.' },
    d60: { title: 'Portföy Hatırlatma', body: 'Portföyünüz 60 günü geçti. Son kontrolü yapın.' },
    d75: { title: 'Portföy Silindi', body: 'Portföyünüz otomatik olarak silindi.' },
  };
  return map[phase] || { title: 'Bilgilendirme', body: 'Portföy güncellemesi.' };
}

function demandMessage(phase) {
  // Align with 15/20/30/45 policy for demands/requests
  const map = {
    d15: { title: 'Talep Havuz Güncellemesi', body: 'Talebiniz havuzda yayından kaldırılmıştır.' },
    d20: { title: 'Talep Süresi Doldu', body: 'Talebinizin süresi dolmuştur. Süresi geçen taleplerden kontrol edebilirsiniz.' },
    d30: { title: 'Talep Sonlandı', body: 'Talebiniz sonlanmıştır. Geçmiş taleplerden görüntüleyebilirsiniz. 15 gün içinde tamamen silinecektir.' },
    d45: { title: 'Talep Silindi', body: 'Talebiniz ve ilgili veriler tamamen silinmiştir.' },
    d10: { title: 'Talep Hatırlatma', body: 'Talebiniz 10+ gün oldu. Yayın süresi yaklaşıyor.' },
  };
  return map[phase] || { title: 'Bilgilendirme', body: 'Talep güncellemesi.' };
}

function agendaMessage() {
  return { title: 'Ajanda Hatırlatma', body: 'Ajandanızda yaklaşan etkinlikler var.' };
}

function subscriptionMessage(plan, daysLeft) {
  return {
    title: 'Abonelik Hatırlatma',
    body: `Aboneliğinizin sona ermesine son ${daysLeft} gün.`,
  };
}

module.exports = {
    completeReferralAndGrantReward,
    portfolioMessage,
    demandMessage,
    agendaMessage,
    subscriptionMessage,
};

