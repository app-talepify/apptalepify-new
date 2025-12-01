// src/services/notesService.js
// Notlar için Firestore servisi

import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';

const NOTES_COLLECTION = 'notes';

/**
 * Yeni not ekle
 * @param {Object} noteData - Not verisi
 * @param {string} noteData.userId - Kullanıcı ID
 * @param {string} noteData.type - Not tipi ('audio' veya 'text')
 * @param {string} [noteData.priority] - Not önceliği ('normal', 'priority', 'urgent')
 * @param {string} [noteData.content] - Metin notu için içerik
 * @param {string} [noteData.audioUrl] - Sesli not için CDN URL
 * @param {number} [noteData.duration] - Sesli not için süre (saniye)
 * @returns {Promise<string>} - Oluşturulan notun ID'si
 */
export async function addNote(noteData) {
  try {
    // 1 hafta sonrası için expiry tarihi hesapla
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 gün

    const noteDoc = {
      userId: noteData.userId,
      type: noteData.type, // 'audio' veya 'text'
      priority: noteData.priority || 'normal', // 'normal', 'priority', 'urgent'
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
    };

    // Tip'e göre ek alanlar
    if (noteData.type === 'text') {
      noteDoc.content = noteData.content;
    } else if (noteData.type === 'audio') {
      noteDoc.audioUrl = noteData.audioUrl;
      noteDoc.duration = noteData.duration || 0;
    }

    const docRef = await addDoc(collection(db, NOTES_COLLECTION), noteDoc);
    return docRef.id;
  } catch (error) {
    console.error('Not eklenirken hata:', error);
    throw error;
  }
}

/**
 * Kullanıcının notlarını getir (süresi dolmayanlar)
 * @param {string} userId - Kullanıcı ID
 * @returns {Promise<Array>} - Notlar listesi
 */
export async function getUserNotes(userId) {
  try {
    const now = new Date();
    const nowTimestamp = Timestamp.fromDate(now);
    
    // En basit sorgu - sadece userId (index gerektirmez)
    const q = query(
      collection(db, NOTES_COLLECTION),
      where('userId', '==', userId)
    );

    const querySnapshot = await getDocs(q);
    const notes = [];

    // Client-side filtreleme ve sıralama
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Sadece expiresAt > now olanları ekle
      if (data.expiresAt && data.expiresAt.toMillis() > nowTimestamp.toMillis()) {
        notes.push({
          id: doc.id,
          ...data,
        });
      }
    });

    // Client-side'da tarihe göre sırala (yeni -> eski)
    notes.sort((a, b) => {
      const aTime = a.createdAt?.toMillis() || 0;
      const bTime = b.createdAt?.toMillis() || 0;
      return bTime - aTime;
    });

    return notes;
  } catch (error) {
    console.error('Notlar getirilirken hata:', error);
    throw error;
  }
}

/**
 * Not sil
 * @param {string} noteId - Not ID
 * @param {string} userId - Kullanıcı ID (güvenlik için)
 * @returns {Promise<void>}
 */
export async function deleteNote(noteId, userId) {
  try {
    const noteRef = doc(db, NOTES_COLLECTION, noteId);
    
    // Güvenlik: Not kullanıcıya ait mi kontrol et
    const noteDoc = await getDocs(query(
      collection(db, NOTES_COLLECTION),
      where('__name__', '==', noteId),
      where('userId', '==', userId)
    ));

    if (noteDoc.empty) {
      throw new Error('Not bulunamadı veya yetkiniz yok');
    }

    await deleteDoc(noteRef);
  } catch (error) {
    console.error('Not silinirken hata:', error);
    throw error;
  }
}

/**
 * Süresi dolmuş notları temizle (opsiyonel - Cloud Function'da da yapılabilir)
 * @returns {Promise<number>} - Silinen not sayısı
 */
export async function cleanExpiredNotes() {
  try {
    const now = new Date();
    const q = query(
      collection(db, NOTES_COLLECTION),
      where('expiresAt', '<=', Timestamp.fromDate(now))
    );

    const querySnapshot = await getDocs(q);
    let deletedCount = 0;

    const deletePromises = [];
    querySnapshot.forEach((document) => {
      deletePromises.push(deleteDoc(doc(db, NOTES_COLLECTION, document.id)));
      deletedCount++;
    });

    await Promise.all(deletePromises);
    
    if (__DEV__ && deletedCount > 0) {
      console.log(`✓ ${deletedCount} süresi dolmuş not temizlendi`);
    }

    return deletedCount;
  } catch (error) {
    console.error('Süresi dolmuş notlar temizlenirken hata:', error);
    throw error;
  }
}

