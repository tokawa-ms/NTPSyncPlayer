// ===== DOM references =====
const video              = document.getElementById('video');
const statusEl           = document.getElementById('status');
const clockEl            = document.getElementById('clock');
const systemClockEl      = document.getElementById('system-clock');
const nextStartEl        = document.getElementById('next-start');
const fullscreenBtn      = document.getElementById('fullscreen-btn');
const muteBtn            = document.getElementById('mute-btn');
const fallbackCountdownEl = document.getElementById('fallback-countdown');
const tapOverlay      = document.getElementById('tap-overlay');
const videoToggleBtn  = document.getElementById('video-toggle-btn');

// ===== State =====
let isPlaying       = false;   // 動画再生中フラグ
let isMuted         = localStorage.getItem('isMuted') !== 'false'; // 保存値がなければtrue（自動再生のため）
let videoAvailable  = true;    // 動画ファイルの存在フラグ
let useVideo        = localStorage.getItem('useVideo') !== 'false'; // 動画を使うかどうか（デフォルトON）
let fallbackBeepSec = -1;      // フォールバック時の直前ビープカウント値
let fallbackWasActive = false; // フォールバック前フレームの再生区間内フラグ
let fallbackZeroUntil = 0;     // "0" 表示終了時刻（ms）
let audioCtx        = null;    // Web Audio API コンテキスト

// ===== NTP offset state =====
const ntpOffsetEl = document.getElementById('ntp-offset');
const ntpRttEl    = document.getElementById('ntp-rtt');
let ntpOffsetMs = null;  // ms (NTP time - local time)
let ntpSyncTime = null;
let ntpRttMs    = null;  // 最新の HTTP RTT (ms)

// NTP補正済み現在時刻を返す
function ntpNow() {
  const t = Date.now();
  return (ntpOffsetMs !== null) ? t + ntpOffsetMs : t;
}

async function fetchNtpOffset() {
  try {
    const t1 = Date.now(); // クライアント送信時刻
    const res = await fetch('/api/ntp-offset?_=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    const t4 = Date.now(); // クライアント受信時刻
    if (data.offsetMs !== null && data.offsetMs !== undefined && data.serverTime) {
      // サーバーの NTP 補正済み時刻を算出
      const ntpTimeAtServer = data.serverTime + data.offsetMs;
      // クライアントのリクエスト中間時刻
      const rtt = t4 - t1;
      const clientMid = t1 + rtt / 2;
      // クライアント時刻に対する NTP オフセット
      ntpOffsetMs = ntpTimeAtServer - clientMid;
      ntpSyncTime = data.lastSync;
      const absMs = Math.abs(ntpOffsetMs);
      const sign = ntpOffsetMs >= 0 ? '+' : '-';
      let display;
      if (absMs < 1000) {
        display = `${sign}${absMs.toFixed(1)} ms`;
      } else {
        display = `${sign}${(absMs / 1000).toFixed(3)} s`;
      }
      let cls = 'offset-value';
      if (absMs > 500) cls += ' bad';
      else if (absMs > 100) cls += ' warn';
      ntpRttMs = rtt;
      const serverOffsetStr = data.offsetMs >= 0 ? `+${data.offsetMs.toFixed(1)}` : data.offsetMs.toFixed(1);
      ntpOffsetEl.innerHTML = `NTP補正(クライアント基準): <span class="${cls}">${display}</span> (${data.server}, サーバー側offset ${serverOffsetStr}ms)`;
      let rttCls = 'offset-value';
      if (rtt > 500) rttCls += ' bad';
      else if (rtt > 200) rttCls += ' warn';
      ntpRttEl.innerHTML = `HTTP RTT: <span class="${rttCls}">${rtt} ms</span>`;
    } else if (data.error) {
      ntpOffsetMs = null;
      ntpOffsetEl.innerHTML = `NTP: <span class="offset-value bad">サーバーNTP取得失敗 (${data.error})</span>`;
      ntpRttEl.innerHTML = '';
    } else {
      ntpOffsetMs = null;
      ntpOffsetEl.innerHTML = `NTP: <span class="offset-value bad">サーバーNTP未同期 (offsetMs=null)</span>`;
      ntpRttEl.innerHTML = '';
    }
  } catch (e) {
    ntpOffsetEl.innerHTML = `NTP: <span class="offset-value bad">通信エラー (${e.message})</span>`;
    ntpRttEl.innerHTML = '';
  }
}

fetchNtpOffset();
setInterval(fetchNtpOffset, 30_000);

// ===== Web Audio API (フォールバック用ビープ) =====
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playBeep(freq, dur) {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch (e) {}
}

// ===== 動画読み込みエラー検出 =====
function onVideoUnavailable() {
  videoAvailable = false;
  // 動画がない場合はタップオーバーレイを閉じる（フォールバックに動画不要）
  if (!tapOverlay.classList.contains('hidden')) {
    tapOverlay.classList.add('hidden');
  }
}
const sourceEl = video.querySelector('source');
if (sourceEl) sourceEl.addEventListener('error', onVideoUnavailable);
video.addEventListener('error', onVideoUnavailable);
video.addEventListener('loadedmetadata', () => {
  videoAvailable = true;
  videoToggleBtn.classList.remove('hidden');
  updateVideoToggleBtn();
});
let videoUnlocked = false; // ユーザージェスチャーで再生が許可されたか
let videoStarted  = false; // video.play() が一度でも成功したか

// ===== 動画を開始（一度だけ呼ぶ。以後 pause しない） =====
function startVideoOnce() {
  if (videoStarted) return;
  const p = video.play();
  if (p !== undefined) {
    p.then(() => {
      videoStarted = true;
      videoUnlocked = true;
      video.style.visibility = 'hidden'; // 最初は隠す（待機中かもしれないため）
    }).catch(() => {
      // Autoplay 失敗 → 動画が存在する場合のみタップオーバーレイを表示
      if (videoAvailable) {
        tapOverlay.classList.remove('hidden');
      }
    });
  }
}

// ===== Autoplay検出 =====
function checkAutoplay() {
  startVideoOnce();
}

// タップでオーバーレイを閉じ、動画を有効化
tapOverlay.addEventListener('click', () => {
  // AudioContext をユーザージェスチャーで初期化（フォールバックのビープ音用）
  getAudioContext();

  if (!videoAvailable) {
    // 動画がない場合はオーバーレイを閉じるだけ
    tapOverlay.classList.add('hidden');
    return;
  }
  video.play().then(() => {
    videoStarted = true;
    videoUnlocked = true;
    video.style.visibility = 'hidden';
    tapOverlay.classList.add('hidden');
  }).catch(() => {
    // 動画再生失敗 → 動画なしとして扱いオーバーレイを閉じる
    videoAvailable = false;
    tapOverlay.classList.add('hidden');
  });
});

// ===== Main loop =====
function update() {
  const now = new Date(ntpNow());
  const sec = now.getSeconds();
  const ms  = now.getMilliseconds();

  // NTP補正済み時刻を表示
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  const msStr = String(ms).padStart(3, '0');
  clockEl.innerHTML = `NTP補正済時刻: ${hh}:${mm}:${ss}<span class="ms">.${msStr}</span>`;

  // システム時刻（補正なし）を表示
  const sysNow = new Date();
  const sHH = String(sysNow.getHours()).padStart(2, '0');
  const sMM = String(sysNow.getMinutes()).padStart(2, '0');
  const sSS = String(sysNow.getSeconds()).padStart(2, '0');
  const sMS = String(sysNow.getMilliseconds()).padStart(3, '0');
  systemClockEl.innerHTML = `システム時刻: ${sHH}:${sMM}:${sSS}<span class="ms">.${sMS}</span>`;

  // 再生開始秒のリスト
  const START_SECS = [20, 50];
  const useFallback = !videoAvailable || !useVideo;
  const duration = useFallback ? 10 : (video.duration || 10); // フォールバック時は固定10秒

  // 現在の秒が再生区間内かを判定
  let activeStart = -1;
  for (const s of START_SECS) {
    const end = s + duration;
    if (end <= 60) {
      if (sec >= s && sec < end) { activeStart = s; break; }
    } else {
      if (sec >= s || sec < end - 60) { activeStart = s; break; }
    }
  }

  if (activeStart >= 0) {
    // ===== 再生区間 =====
    let elapsed;
    if (sec >= activeStart) {
      elapsed = (sec - activeStart) + ms / 1000;
    } else {
      // 分をまたいだ場合
      elapsed = (sec + 60 - activeStart) + ms / 1000;
    }

    if (videoAvailable && useVideo) {
      // ===== 動画再生 =====
      // 動画を表示
    video.style.visibility = 'visible';

    // まだ play() していなければ開始を試みる
    if (!videoStarted) {
      startVideoOnce();
    }

    // currentTime を同期（大きなドリフト時のみシーク）
    if (!isPlaying) {
        video.currentTime = elapsed;
          isPlaying = true;
      } else {
        const drift = Math.abs(video.currentTime - elapsed);
        if (drift > 0.5) {
          video.currentTime = elapsed;
        }
      }
      fallbackCountdownEl.textContent = '';
      document.body.classList.remove('countdown-zero');
      document.body.classList.remove('fallback-flash');
    } else {
      // ===== フォールバック: 動画なし =====
      if (isPlaying) {
        video.pause();
        video.currentTime = 0;
        isPlaying = false;
      }
      const countdownNum = Math.max(1, 10 - Math.floor(elapsed));
      fallbackCountdownEl.textContent = String(countdownNum);
      if (countdownNum !== fallbackBeepSec) {
        fallbackBeepSec = countdownNum;
        playBeep(880, 0.15);
      }
      // 0.5秒ごとに画面を点滅（過延比較用）
      if (ms < 500) {
        document.body.classList.add('fallback-flash');
      } else {
        document.body.classList.remove('fallback-flash');
      }
      document.body.classList.remove('countdown-zero');
      fallbackWasActive = true;
    }

    // 動画が止まっていたら再開（バッテリー節約等で止まった場合）
    if (videoAvailable && useVideo && videoStarted && video.paused) {
      video.play().catch(() => {});
    }

    statusEl.textContent = '▶ カウントダウン再生中';
    nextStartEl.textContent = '';

  } else {
    // ===== 待機中 =====
    // pause() は呼ばない — モバイルで再開できなくなるため
    // 動画を非表示にして裏で回し続ける
    video.style.visibility = 'hidden';

    // 再生区間→待機に遷移した瞬間に時刻同期（ドリフト補正）
    if (isPlaying && videoAvailable && useVideo && videoStarted) {
      video.currentTime = 0;
    }
    isPlaying = false;

    // フォールバック: カウントダウン終了 → "0" 表示とフラッシュ
    if ((!videoAvailable || !useVideo) && fallbackWasActive) {
      fallbackWasActive = false;
      fallbackBeepSec = -1;
      fallbackZeroUntil = ntpNow() + 1500;
      playBeep(1320, 0.5);
    }

    if ((!videoAvailable || !useVideo) && ntpNow() < fallbackZeroUntil) {
      fallbackCountdownEl.textContent = '0';
      document.body.classList.remove('fallback-flash');
      document.body.classList.add('countdown-zero');
      statusEl.textContent = '▶ カウントダウン再生中';
      nextStartEl.textContent = '';
    } else {
      fallbackCountdownEl.textContent = '';
      document.body.classList.remove('countdown-zero');

      // 次の再生開始までの秒数を計算
      let minWait = 60;
      for (const s of START_SECS) {
        const wait = (s - sec + 60) % 60;
        if (wait > 0 && wait < minWait) minWait = wait;
      }
      statusEl.textContent = '待機中...';
      nextStartEl.textContent = `次のカウントダウンまで ${minWait} 秒`;
      document.body.classList.remove('fallback-flash');
    }
  }

  requestAnimationFrame(update);
}

// ===== Fullscreen =====
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    fullscreenBtn.textContent = '⛶ ウィンドウ';
  } else {
    document.exitFullscreen();
    fullscreenBtn.textContent = '⛶ フルスクリーン';
  }
});

// ===== Mute =====
// 初期表示をlocalStorage値に合わせる
video.muted = isMuted;
muteBtn.textContent = isMuted ? '🔇 音声OFF（クリックでON）' : '🔊 音声ON';

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  video.muted = isMuted;
  muteBtn.textContent = isMuted ? '🔇 音声OFF（クリックでON）' : '🔊 音声ON';
  localStorage.setItem('isMuted', String(isMuted));
  if (!isMuted) getAudioContext(); // AudioContext を起動（ユーザー操作後に有効）
});

// ===== Video toggle =====
function updateVideoToggleBtn() {
  videoToggleBtn.textContent = useVideo ? '🎬 動画を再生: ON' : '🎬 動画を再生: OFF';
}

videoToggleBtn.addEventListener('click', () => {
  useVideo = !useVideo;
  localStorage.setItem('useVideo', String(useVideo));
  updateVideoToggleBtn();
  if (!useVideo) {
    // 動画をOFFにしたら非表示にてフォールバックへ
    video.style.visibility = 'hidden';
    if (isPlaying) {
      isPlaying = false;
    }
  }
});

// ===== Start =====
checkAutoplay();
requestAnimationFrame(update);
