const { app, BrowserWindow, session, ipcMain, shell, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
let loginWindow;
let naverWindow;
let currentNaverBizId = null;

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    show: false,
    resizable: true,
    title: '마감 프로그램',
    icon: path.join(__dirname, '../public/icon2.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // [수정] 개발자 도구 자동 실행(openDevTools) 코드를 삭제했습니다.
  });

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const headers = details.requestHeaders;
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      callback({ cancel: false, requestHeaders: headers });
    }
  );

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// --- [자동 업데이트 관련 핸들러] ---
ipcMain.handle('check-for-updates', async () => { if (!app.isPackaged) return; try { await autoUpdater.checkForUpdates(); } catch (e) {} });
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('start-download', () => autoUpdater.downloadUpdate());
ipcMain.handle('install-now', () => autoUpdater.quitAndInstall(false, true));

autoUpdater.on('update-available', (info) => mainWindow.webContents.send('update-available', info.version));
autoUpdater.on('download-progress', (p) => mainWindow.webContents.send('download-progress', p.percent));
autoUpdater.on('update-downloaded', () => mainWindow.webContents.send('download-complete'));

// --- [1. HandSOS 로그인 및 스크래핑] ---
ipcMain.handle('open-login-window', async () => {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.show(); return { status: "ALREADY_OPEN" }; }
  
  // 사용자가 아이디/비번을 입력해야 하므로 로그인 시에는 창을 보여줍니다.
  loginWindow = new BrowserWindow({ width: 1200, height: 900, parent: mainWindow, show: true, title: 'HAND 로그인' });
  loginWindow.loadURL('https://www.handsos.com/login/login.asp?p=pc');
  
  return new Promise((resolve) => {
    const checkLoginInterval = setInterval(async () => {
      if (!loginWindow || loginWindow.isDestroyed()) { clearInterval(checkLoginInterval); resolve({ status: "CLOSED" }); return; }
      try {
        const script = `(function() {
            function findInDoc(doc) { return doc.querySelector('#hello b'); }
            let el = findInDoc(document); if (el) return el.innerText;
            const frames = document.querySelectorAll('frame, iframe');
            for (let i = 0; i < frames.length; i++) { try { let fd = frames[i].contentDocument || frames[i].contentWindow.document; el = findInDoc(fd); if (el) return el.innerText; } catch(e){} }
            return null;
        })();`;
        const storeName = await loginWindow.webContents.executeJavaScript(script);
        if (storeName) { 
            clearInterval(checkLoginInterval); 
            loginWindow.hide(); // 로그인 성공 시 창을 숨깁니다.
            resolve({ status: "SUCCESS", storeName: storeName.trim() }); 
        }
      } catch (err) {}
    }, 1000);
    loginWindow.on('closed', () => { clearInterval(checkLoginInterval); loginWindow = null; });
  });
});

ipcMain.handle('scrap-data', async (event, payload) => {
  const { targetUrl, ...params } = payload;
  if(loginWindow && !loginWindow.isDestroyed()) {
      // [수정] 스크래핑 중에는 창을 다시 띄우지(show) 않습니다.
      const script = `(function(){
        var form=document.createElement("form");
        form.method="POST";
        form.action="${targetUrl}";
        var p=${JSON.stringify(params)};
        for(var k in p){
          var i=document.createElement("input");
          i.type="hidden"; i.name=k; i.value=p[k];
          form.appendChild(i);
        }
        document.body.appendChild(form);
        form.submit();
      })();`;
      await loginWindow.webContents.executeJavaScript(script);
      await new Promise(r => loginWindow.webContents.once('did-finish-load', r));
      await new Promise(r => setTimeout(r, 800));
      const html = await loginWindow.webContents.executeJavaScript('document.documentElement.outerHTML');
      return html;
  }
  return "";
});

// --- [2. 네이버 로그인 및 매출 조회] ---
ipcMain.handle('open-naver-login', async () => {
  if (naverWindow && !naverWindow.isDestroyed()) { naverWindow.show(); return { status: "ALREADY_OPEN" }; }
  
  // 네이버 로그인도 직접 입력이 필요하므로 창을 보여줍니다.
  naverWindow = new BrowserWindow({ 
      width: 1000, height: 800, parent: mainWindow, show: true, title: '네이버 로그인',
      webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false }
  });
  naverWindow.loadURL('https://new.smartplace.naver.com/'); 
  
  return new Promise((resolve) => {
      let foundId = false;
      naverWindow.on('closed', () => { 
          naverWindow = null; 
          try { session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*.naver.com/*'] }, null); } catch(e){}
          resolve({ status: "CLOSED" }); 
      });
      const filter = { urls: ['*://*.naver.com/*'] };
      naverWindow.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
          if (foundId) { callback({ cancel: false }); return; }
          const match = details.url.match(/\/businesses\/(\d+)(\?|$)/);
          if (match && match[1]) {
              const detectedId = match[1];
              foundId = true;
              currentNaverBizId = detectedId;
              setTimeout(async () => {
                  try {
                      if(!naverWindow || naverWindow.isDestroyed()) return;
                      const script = `(async () => { try { const res = await fetch('https://partner.booking.naver.com/api/businesses/${detectedId}'); const data = await res.json(); return data.name; } catch (e) { return null; } })();`;
                      const storeName = await naverWindow.webContents.executeJavaScript(script);
                      naverWindow.hide(); // 연동 성공 시 창을 숨깁니다.
                      resolve({ status: "SUCCESS", storeName: storeName || "네이버 매장" });
                  } catch (e) { foundId = false; }
              }, 200);
          }
          callback({ cancel: false });
      });
  });
});

ipcMain.handle('get-naver-sales', async (event, { date }) => {
  if (!currentNaverBizId) return { total: -1, detailList: [] };
  
  // 데이터 조회 시에는 창을 백그라운드(show: false)에서 생성하거나 유지합니다.
  if (!naverWindow || naverWindow.isDestroyed()) {
      naverWindow = new BrowserWindow({ width: 1000, height: 800, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false } });
      await naverWindow.loadURL(`https://partner.booking.naver.com/bizes/${currentNaverBizId}/booking-list-view`);
      await new Promise(r => setTimeout(r, 2000));
  } 

  const startTime = new Date(date + 'T00:00:00').toISOString();
  const endTime = new Date(date + 'T23:59:59').toISOString();
  const apiUrl = `https://partner.booking.naver.com/api/businesses/${currentNaverBizId}/bookings?bizItemTypes=STANDARD&dateDropdownType=TODAY&dateFilter=USEDATE&startDateTime=${encodeURIComponent(startTime)}&endDateTime=${encodeURIComponent(endTime)}&maxDays=31&page=0&size=100`;
  const script = `(async () => { const res = await fetch("${apiUrl}"); return await res.json(); })();`;
  try {
    const result = await naverWindow.webContents.executeJavaScript(script);
    let total = 0, detailList = [];
    if (result && Array.isArray(result)) {
      result.forEach(item => {
        const validPayments = item.payments ? item.payments.filter(p => p.status !== "CANCELED") : [];
        if (validPayments.length > 0) {
          const sum = validPayments.reduce((acc, p) => acc + (p.paidAmount || 0) - (p.refundedAmount || 0), 0);
          if (sum > 0) { total += sum; detailList.push({ name: item.name, visitor: item.visitorName || null, price: sum, designer: item.originalBizItemName || '-' }); }
        }
      });
    }
    return { total, detailList };
  } catch (e) { return { total: -1, detailList: [] }; }
});

// --- [유틸리티 핸들러] ---
ipcMain.handle('get-template', async (event, fileName) => {
  const templatePath = app.isPackaged ? path.join(process.resourcesPath, fileName) : path.join(__dirname, `../public/${fileName}`);
  return fs.readFileSync(templatePath);
});

ipcMain.handle('open-excel-direct', async (event, { buffer, fileName }) => {
  const filePath = path.join(os.tmpdir(), fileName);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  await shell.openPath(filePath);
});

ipcMain.handle('save-excel-file', async (event, { buffer, fileName }) => {
  const { filePath } = await dialog.showSaveDialog({ title: '엑셀 파일 저장', defaultPath: fileName, filters: [{ name: 'Excel Files', extensions: ['xlsx'] }] });
  if (filePath) { fs.writeFileSync(filePath, Buffer.from(buffer)); return { success: true, filePath }; }
  throw new Error('파일 저장이 취소되었습니다.');
});