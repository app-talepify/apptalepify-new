# Manuel Mahalle Verisi İndirme Rehberi

## Sorun:
GitHub'daki bazı repolar dosya boyutu nedeniyle raw olarak indirilemeyebiliyor.

## Çözüm Adımları:

### Yöntem 1: GitHub Desktop (Önerilen)
1. https://github.com/cosmohacker/turkiye-iller-ve-ilceler-json adresine git
2. Code → Download ZIP
3. ZIP'i aç
4. `mahalle.json` dosyasını `TalepifyApp12/src/data/allNeighborhoods.json` olarak kopyala

### Yöntem 2: Git Clone
```bash
cd C:\Dev
git clone https://github.com/cosmohacker/turkiye-iller-ve-ilceler-json temp-mahalle
copy temp-mahalle\mahalle.json TalepifyApp12\src\data\allNeighborhoods.json
rmdir /s temp-mahalle
```

### Yöntem 3: curl/wget
```bash
curl -L https://github.com/cosmohacker/turkiye-iller-ve-ilceler-json/raw/master/mahalle.json -o src/data/allNeighborhoods.json
```

## Alternatif Kaynaklar:

### 1. mertsalik/cities-of-turkey
- https://github.com/mertsalik/cities-of-turkey
- İçerik: İl, İlçe, Mahalle, Köy
- Format: JSON

### 2. İçişleri Bakanlığı Resmi Veri
- https://www.nvi.gov.tr
- En güncel ama manuel indirme gerekir

## Veri Formatı Kontrolü:

Dosya şu formatta olmalı:

```json
[
  {
    "il": "Adana",
    "plaka": "01",
    "ilceleri": [
      {
        "ilce": "Seyhan",
        "mahalleler": ["Akkapı", "Bahçeşehir", ...]
      }
    ]
  },
  ...
]
```

VEYA:

```json
{
  "Seyhan": ["Akkapı", "Bahçeşehir", ...],
  "Atakum": ["Aksu", "Alanlı", ...],
  ...
}
```

## Doğrulama:

```bash
node -e "const data = require('./src/data/allNeighborhoods.json'); console.log('İlçe sayısı:', Object.keys(data).length);"
```

Çıktı: `İlçe sayısı: 922` olmalı (yaklaşık)

