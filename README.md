# itouCards

一個用純 HTML / CSS / JavaScript 製作的卡片展示頁，會從本機載入兩張 WEBP 圖片並以 3D 卡片形式呈現。

## 功能

- 自動載入 `img/1.webp` 與 `img/2.webp`
- 卡片正反面翻轉
- 滑鼠移動時的 3D 傾斜效果
- 滾輪縮放卡片大小
- 鍵盤操作支援
- 相容偏好減少動畫設定

## 檔案結構

```text
itouCards/
├─ index.html
├─ style.css
├─ app.js
├─ favicon.ico
├─ CNAME
├─ README.md
├─ .github/
│  └─ workflows/
│     └─ pages.yml
└─ img/
   ├─ 1.webp
   └─ 2.webp
```

## 使用方式

2. 直接用瀏覽器開啟 `index.html`
3. 或用本機靜態伺服器開啟，例如 VS Code Live Server

## 注意事項

- 若圖片載入失敗，畫面會顯示錯誤狀態
- 建議使用支援 `aspect-ratio` 與 3D transform 的現代瀏覽器

## 技術細節

- `app.js` 負責圖片載入、互動與動畫控制
- `style.css` 負責版面、3D 效果與視覺樣式
- `index.html` 為主頁入口
