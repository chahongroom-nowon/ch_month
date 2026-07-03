const { app, BrowserWindow, session, ipcMain, shell, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
let loginWindow;
let naverWindow;
let currentNaverBizId = null;

function extractNaverBizId(text) {
  if (!text || typeof text !== 'string') return null;
  const patterns = [
    /\/businesses\/(\d+)(?:\?|$|\/)/,
    /\/bizes\/(\d+)(?:\?|$|\/)/,
    /[?&]bookingBusinessId=(\d+)/,
    /"businessId"\s*:\s*"?(\d+)"?/,
    /"bookingBusinessId"\s*:\s*"?(\d+)"?/,
    /"bizId"\s*:\s*"?(\d+)"?/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function completeNaverLogin(detectedId, resolve) {
  currentNaverBizId = detectedId;
  try {
    if (!naverWindow || naverWindow.isDestroyed()) return;
    const script = `(async () => { try { const res = await fetch('https://partner.booking.naver.com/api/businesses/${detectedId}'); const data = await res.json(); return data.name; } catch (e) { return null; } })();`;
    const storeName = await naverWindow.webContents.executeJavaScript(script);
    naverWindow.hide();
    resolve({ status: 'SUCCESS', storeName: storeName || '네이버 매장' });
  } catch (e) {
    resolve({ status: 'SUCCESS', storeName: '네이버 매장' });
  }
}

function resolveNaverBizId() {
  if (currentNaverBizId) return currentNaverBizId;
  if (naverWindow && !naverWindow.isDestroyed()) {
    const detectedId = extractNaverBizId(naverWindow.webContents.getURL());
    if (detectedId) {
      currentNaverBizId = detectedId;
      return detectedId;
    }
  }
  return null;
}

async function fetchNaverStoreName(bizId) {
  if (!naverWindow || naverWindow.isDestroyed()) return '네이버 매장';
  try {
    const script = `(async () => { try { const res = await fetch('https://partner.booking.naver.com/api/businesses/${bizId}'); const data = await res.json(); return data.name; } catch (e) { return null; } })();`;
    return (await naverWindow.webContents.executeJavaScript(script)) || '네이버 매장';
  } catch (e) {
    return '네이버 매장';
  }
}

function parseNaverBookings(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return result.content || result.items || result.data || result.bookings || [];
}

function toggleDevTools() {
  const win = BrowserWindow.getFocusedWindow();
  const target = win && !win.isDestroyed() ? win : mainWindow;
  if (target && !target.isDestroyed()) target.webContents.toggleDevTools();
}

function createAppMenu() {
  const template = [
    {
      label: '보기',
      submenu: [
        {
          label: '개발자 도구',
          accelerator: 'F12',
          click: toggleDevTools,
        },
        {
          label: '개발자 도구 (Ctrl+Shift+I)',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: toggleDevTools,
        },
        { type: 'separator' },
        {
          label: '새로고침',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            const target = win && !win.isDestroyed() ? win : mainWindow;
            if (target && !target.isDestroyed()) target.webContents.reload();
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  createAppMenu();

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
  if (naverWindow && !naverWindow.isDestroyed()) {
    const detectedId = resolveNaverBizId();
    if (detectedId) {
      const storeName = await fetchNaverStoreName(detectedId);
      return { status: 'SUCCESS', storeName };
    }
    naverWindow.show();
    return { status: 'ALREADY_OPEN' };
  }
  
  naverWindow = new BrowserWindow({ 
      width: 1000, height: 800, parent: mainWindow, show: true, title: '네이버 로그인',
      webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false }
  });
  naverWindow.loadURL('https://new.smartplace.naver.com/'); 
  
  return new Promise((resolve) => {
      let foundId = false;
      let urlPollInterval = null;
      let naverRequestFilter = { urls: ['*://*.naver.com/*'] };

      const tryDetectBizId = (source) => {
          if (foundId) return;
          const detectedId = extractNaverBizId(source);
          if (!detectedId) return;
          foundId = true;
          if (urlPollInterval) clearInterval(urlPollInterval);
          setTimeout(() => completeNaverLogin(detectedId, resolve), 200);
      };

      const onNaverRequest = (details, callback) => {
          if (!foundId) {
              tryDetectBizId(details.url);
              if (!foundId && details.method === 'POST' && details.uploadData) {
                  for (const chunk of details.uploadData) {
                      if (chunk.bytes) {
                          tryDetectBizId(Buffer.from(chunk.bytes).toString('utf8'));
                          if (foundId) break;
                      }
                  }
              }
          }
          callback({ cancel: false });
      };

      const onNavigate = (_event, url) => tryDetectBizId(url);

      naverWindow.on('closed', () => { 
          if (urlPollInterval) clearInterval(urlPollInterval);
          try {
              const winSession = naverWindow?.webContents?.session;
              winSession?.webRequest?.onBeforeRequest(naverRequestFilter, null);
          } catch (e) {}
          naverWindow = null;
          resolve({ status: "CLOSED" }); 
      });

      naverWindow.webContents.on('did-navigate', onNavigate);
      naverWindow.webContents.on('did-navigate-in-page', onNavigate);

      naverWindow.webContents.session.webRequest.onBeforeRequest(naverRequestFilter, onNaverRequest);

      urlPollInterval = setInterval(() => {
          if (foundId || !naverWindow || naverWindow.isDestroyed()) return;
          tryDetectBizId(naverWindow.webContents.getURL());
      }, 1000);
  });
});

ipcMain.handle('get-naver-sales', async (event, { date }) => {
  const bizId = resolveNaverBizId();
  if (!bizId) return { total: -1, detailList: [], reason: 'NO_BIZ_ID' };

  if (!naverWindow || naverWindow.isDestroyed()) {
      naverWindow = new BrowserWindow({ width: 1000, height: 800, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false } });
      await naverWindow.loadURL(`https://partner.booking.naver.com/bizes/${bizId}/booking-list-view`);
      await new Promise(r => setTimeout(r, 2000));
  } else {
      const currentUrl = naverWindow.webContents.getURL();
      if (!currentUrl.includes(`/bizes/${bizId}`)) {
          await naverWindow.loadURL(`https://partner.booking.naver.com/bizes/${bizId}/booking-list-view`);
          await new Promise(r => setTimeout(r, 2000));
      }
  }

  const startTime = new Date(date + 'T00:00:00').toISOString();
  const endTime = new Date(date + 'T23:59:59').toISOString();
  const apiUrl = `https://partner.booking.naver.com/api/businesses/${bizId}/bookings?bizItemTypes=STANDARD&dateDropdownType=TODAY&dateFilter=USEDATE&startDateTime=${encodeURIComponent(startTime)}&endDateTime=${encodeURIComponent(endTime)}&maxDays=31&page=0&size=100`;
  const script = `(async () => { try { const res = await fetch("${apiUrl}"); if (!res.ok) return { __error: true, status: res.status }; return await res.json(); } catch (e) { return { __error: true, message: e.message }; } })();`;
  try {
    const result = await naverWindow.webContents.executeJavaScript(script);
    if (result?.__error) return { total: -1, detailList: [], reason: 'API_ERROR', bizId };

    const bookings = parseNaverBookings(result);
    let total = 0, detailList = [];
    bookings.forEach(item => {
        const validPayments = item.payments ? item.payments.filter(p => p.status !== "CANCELED") : [];
        if (validPayments.length > 0) {
          const sum = validPayments.reduce((acc, p) => acc + (p.paidAmount || 0) - (p.refundedAmount || 0), 0);
          if (sum > 0) { total += sum; detailList.push({ name: item.name, visitor: item.visitorName || null, price: sum, designer: item.originalBizItemName || '-' }); }
        }
    });
    return { total, detailList, bizId };
  } catch (e) { return { total: -1, detailList: [], reason: 'FETCH_FAILED', bizId }; }
});

// --- [유틸리티 핸들러] ---
// 한셀(Hancell) 등 일부 오피스 프로그램은 xl/*.xml, docProps/app.xml의 엘리먼트에
// 네임스페이스 접두사(x:, ep:)를 붙여 저장하는데, ExcelJS 파서는 이를 인식하지 못해
// "Cannot read properties of undefined (reading 'company')" 같은 오류로 로드에 실패한다.
// 해당 파일들만 접두사를 제거해 표준 형식으로 맞춘다.
async function sanitizeOoxmlPrefixes(buffer) {
  const JSZip = require('jszip');
  const targets = [
    /^xl\/workbook\.xml$/,
    /^xl\/worksheets\/sheet\d+\.xml$/,
    /^xl\/sharedStrings\.xml$/,
    /^xl\/styles\.xml$/,
    /^docProps\/app\.xml$/,
  ];
  try {
    const zip = await JSZip.loadAsync(buffer);
    let changed = false;
    for (const name of Object.keys(zip.files)) {
      const file = zip.files[name];
      if (file.dir || !targets.some((re) => re.test(name))) continue;
      const content = await file.async('string');
      const fixed = content.replace(/(<\/?)([A-Za-z0-9]+):/g, '$1');
      if (fixed !== content) { zip.file(name, fixed); changed = true; }
    }
    if (!changed) return buffer;
    return await zip.generateAsync({ type: 'nodebuffer' });
  } catch (e) {
    return buffer;
  }
}

ipcMain.handle('get-template', async (event, fileName) => {
  const templatePath = app.isPackaged ? path.join(process.resourcesPath, fileName) : path.join(__dirname, `../public/${fileName}`);
  const buffer = fs.readFileSync(templatePath);
  return sanitizeOoxmlPrefixes(buffer);
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