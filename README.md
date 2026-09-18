# 賴致潔作品集 Chih-Chieh Lai Portfolio

GitHub Pages 相容的純靜態作品集。網站由 `index.html`、`styles.css`、`app.js`、`projects.json` 與 `assets/` 組成，沒有外部套件或字型依賴。

## 本機預覽

```bash
python3 -m http.server 8000
```

開啟 `http://localhost:8000/#projects`。因瀏覽器限制，請勿直接雙擊 `index.html`，否則 `projects.json` 無法載入。

## GitHub Pages

將此資料夾內容放到 repository 根目錄，在 Settings → Pages 選擇從 branch 發布。所有資產使用相對路徑，可部署在帳號首頁或 repository 子路徑。目前正式網址為 <https://yulife1289-dev.github.io/chihchiehlai-portfolio/>。

## 圖片保護限制

網站已停用圖片右鍵選單、拖曳與 iOS 長按選單。這只能降低一般使用者直接另存圖片的便利性；公開網頁中的圖片仍可能透過瀏覽器快取、開發者工具或截圖取得。

## 發布前必改

`index.html` 的 canonical URL、`og:url` 與社群分享 meta 已指向正式網址 <https://yulife1289-dev.github.io/chihchiehlai-portfolio/>。正式內容發布前，仍須在 `app.js` 搜尋「請替換」，填入 Email、電話與社群連結。

## 更新圖片

`tools/prepare_assets.py` 會從原始案場資料重新選圖及輸出最佳化 JPEG。執行前確認來源路徑仍存在；它不會修改來源資料夾。
