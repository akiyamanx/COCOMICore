// ==========================================
// 音声コマンド機能
// Reform App Pro v0.91
// ==========================================

// recognition, currentVoiceContext, isListening は globals.js で定義

// ==========================================
// 汎用音声入力機能
// ==========================================

// 現在の音声入力対象
let voiceInputTarget = null;
let voiceInputCallback = null;

// 任意のテキストフィールドに音声入力
function startVoiceInput(inputId, callback = null) {
  const input = document.getElementById(inputId);
  if (!input) {
    console.error('入力フィールドが見つかりません:', inputId);
    return;
  }
  
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('このブラウザは音声認識に対応していません。\nChromeブラウザをお使いください。');
    return;
  }
  
  voiceInputTarget = input;
  voiceInputCallback = callback;
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.lang = 'ja-JP';
  rec.continuous = false;
  rec.interimResults = true;
  
  // 入力欄のスタイルを変更
  input.style.background = '#fef3c7';
  input.placeholder = '🎤 話してください...';
  const originalPlaceholder = input.dataset.originalPlaceholder || input.placeholder;
  input.dataset.originalPlaceholder = originalPlaceholder;
  
  rec.onresult = function(event) {
    const result = event.results[event.results.length - 1];
    const transcript = result[0].transcript;
    
    // 途中結果を入力欄に表示
    input.value = transcript;
    
    if (result.isFinal) {
      input.style.background = '#d1fae5'; // 緑色で成功表示
      setTimeout(() => {
        input.style.background = '';
        input.placeholder = originalPlaceholder;
      }, 1000);
      
      if (voiceInputCallback) {
        voiceInputCallback(transcript);
      }
    }
  };
  
  rec.onerror = function(event) {
    input.style.background = '#fee2e2'; // 赤色でエラー表示
    setTimeout(() => {
      input.style.background = '';
      input.placeholder = originalPlaceholder;
    }, 2000);
    
    if (event.error === 'not-allowed') {
      alert('マイクへのアクセスが許可されていません。');
    } else if (event.error !== 'aborted') {
      console.error('音声認識エラー:', event.error);
    }
  };
  
  rec.onend = function() {
    if (input.style.background === 'rgb(254, 243, 199)') { // まだ黄色なら
      input.style.background = '';
      input.placeholder = originalPlaceholder;
    }
  };
  
  rec.start();
}

// 数値用の音声入力（金額、数量など）
function startVoiceInputNumber(inputId, callback = null) {
  startVoiceInput(inputId, (transcript) => {
    // 数値を抽出
    const num = extractNumber(transcript);
    if (num !== null) {
      document.getElementById(inputId).value = num;
      if (callback) callback(num);
    }
  });
}

// テキストから数値を抽出
function extractNumber(text) {
  // 「1万5千円」→ 15000
  let result = text;
  
  // 漢数字変換
  result = result.replace(/一/g, '1').replace(/二/g, '2').replace(/三/g, '3')
                 .replace(/四/g, '4').replace(/五/g, '5').replace(/六/g, '6')
                 .replace(/七/g, '7').replace(/八/g, '8').replace(/九/g, '9')
                 .replace(/零/g, '0');
  
  // 「万」「千」「百」の処理
  let total = 0;
  const manMatch = result.match(/(\d+)万/);
  const senMatch = result.match(/(\d+)千/);
  const hyakuMatch = result.match(/(\d+)百/);
  const directMatch = result.match(/(\d+)/);
  
  if (manMatch) total += parseInt(manMatch[1]) * 10000;
  if (senMatch) total += parseInt(senMatch[1]) * 1000;
  if (hyakuMatch) total += parseInt(hyakuMatch[1]) * 100;
  
  // 「万」「千」「百」がなくて直接数字がある場合
  if (!manMatch && !senMatch && !hyakuMatch && directMatch) {
    total = parseInt(directMatch[1]);
  } else if (manMatch || senMatch || hyakuMatch) {
    // 「1万5千」の後の端数（「1万5千500」の500）
    const remainder = result.replace(/\d+万/, '').replace(/\d+千/, '').replace(/\d+百/, '');
    const remainderMatch = remainder.match(/(\d+)/);
    if (remainderMatch) {
      total += parseInt(remainderMatch[1]);
    }
  }
  
  return total > 0 ? total : null;
}

// ==========================================
// AI音声コマンド（Gemini API使用）
// ==========================================

// AI音声コマンドを実行（API使用量チェック付き）
async function executeAiVoiceCommand(transcript, context) {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  
  if (!settings.geminiApiKey) {
    alert('Gemini APIキーが設定されていません。\n設定画面からAPIキーを入力してください。');
    return null;
  }
  
  // API使用量チェック
  const canUse = canUseApi();
  if (!canUse.allowed) {
    alert(canUse.reason);
    return null;
  }
  
  // API使用を記録
  recordApiUsage();
  
  // Gemini APIで解析
  return await parseVoiceWithGemini(transcript, settings.geminiApiKey, context);
}

// 音声認識の初期化
function initSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('このブラウザは音声認識に対応していません。\nChromeブラウザをお使いください。');
    return false;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.continuous = false;
  recognition.interimResults = true; // 途中結果も取得
  
  recognition.onresult = function(event) {
    const result = event.results[event.results.length - 1];
    const transcript = result[0].transcript;
    
    // 途中結果を表示
    updateVoiceTranscript(transcript, !result.isFinal);
    
    if (result.isFinal) {
      console.log('音声認識結果:', transcript);
      setTimeout(() => {
        hideVoiceListening();
        processVoiceCommand(transcript);
      }, 500);
    }
  };
  
  recognition.onerror = function(event) {
    console.error('音声認識エラー:', event.error);
    isListening = false;
    
    if (event.error === 'not-allowed') {
      hideVoiceListening();
      alert('マイクへのアクセスが許可されていません。\nブラウザの設定でマイクを許可してください。');
    } else if (event.error === 'no-speech') {
      updateVoiceStatus('音声が検出されませんでした。もう一度お試しください。');
      setTimeout(() => hideVoiceListening(), 2000);
    } else if (event.error === 'aborted') {
      // ユーザーがキャンセルした場合
      hideVoiceListening();
    } else {
      hideVoiceListening();
      alert('音声認識に失敗しました。\nエラー: ' + event.error);
    }
  };
  
  recognition.onend = function() {
    isListening = false;
    stopEqualizerAnimation();
  };
  
  recognition.onaudiostart = function() {
    console.log('音声入力開始');
    startEqualizerAnimation();
  };
  
  return true;
}

// 音声コマンド開始
function startVoiceCommand(context) {
  currentVoiceContext = context;
  
  // 既に実行中なら一度停止
  if (isListening && recognition) {
    recognition.stop();
    isListening = false;
    // 少し待ってから再開
    setTimeout(() => startVoiceCommand(context), 300);
    return;
  }
  
  if (!recognition && !initSpeechRecognition()) {
    return;
  }
  
  showVoiceListening();
  
  try {
    recognition.start();
    isListening = true;
  } catch (error) {
    console.error('音声認識開始エラー:', error);
    isListening = false;
    
    if (error.message && error.message.includes('already started')) {
      // 既に開始中なら停止して再試行
      recognition.stop();
      setTimeout(() => {
        try {
          recognition.start();
          isListening = true;
        } catch (e) {
          hideVoiceListening();
          alert('音声認識を開始できませんでした。ページを更新してお試しください。');
        }
      }, 300);
    } else {
      hideVoiceListening();
      alert('音声認識を開始できませんでした。\n\n考えられる原因：\n・ファイルから直接開いている（https://が必要）\n・マイクの権限がない\n・ブラウザが対応していない');
    }
  }
}

// イコライザーアニメーション用
// equalizerInterval は globals.js で定義

function startEqualizerAnimation() {
  const bars = document.querySelectorAll('.equalizer-bar');
  if (bars.length === 0) return;
  
  equalizerInterval = setInterval(() => {
    bars.forEach(bar => {
      const height = Math.random() * 100;
      bar.style.height = Math.max(20, height) + '%';
    });
  }, 100);
}

function stopEqualizerAnimation() {
  if (equalizerInterval) {
    clearInterval(equalizerInterval);
    equalizerInterval = null;
  }
  const bars = document.querySelectorAll('.equalizer-bar');
  bars.forEach(bar => {
    bar.style.height = '20%';
  });
}

// 音声認識中の表示
// 音声入力ポップアップを表示（汎用）
// context: 'receipt', 'estimate', 'invoice' など
function showVoiceListening(context = 'receipt') {
  let modal = document.getElementById('voice-listening-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'voice-listening-modal';
    modal.className = 'ocr-loading';
    modal.innerHTML = `
      <div style="background: linear-gradient(135deg, #001520, #002530); border: 2px solid #00d4ff; border-radius: 20px; padding: 24px; text-align: center; max-width: 340px; box-shadow: 0 0 30px rgba(0, 212, 255, 0.3); margin: 16px;">
        
        <!-- タイトル -->
        <div id="voiceTitle" style="font-size: 18px; font-weight: bold; color: #00d4ff; text-shadow: 0 0 10px rgba(0, 212, 255, 0.5); margin-bottom: 16px;">🎤 音声入力</div>
        
        <!-- イコライザー -->
        <div id="voiceEqualizer" style="display: flex; justify-content: center; align-items: flex-end; height: 50px; gap: 4px; margin-bottom: 12px;">
          <div class="equalizer-bar" style="width: 8px; background: #00d4ff; box-shadow: 0 0 8px #00d4ff; border-radius: 4px; height: 20%; transition: height 0.1s;"></div>
          <div class="equalizer-bar" style="width: 8px; background: #00d4ff; box-shadow: 0 0 8px #00d4ff; border-radius: 4px; height: 20%; transition: height 0.1s;"></div>
          <div class="equalizer-bar" style="width: 8px; background: #00d4ff; box-shadow: 0 0 8px #00d4ff; border-radius: 4px; height: 20%; transition: height 0.1s;"></div>
          <div class="equalizer-bar" style="width: 8px; background: #00d4ff; box-shadow: 0 0 8px #00d4ff; border-radius: 4px; height: 20%; transition: height 0.1s;"></div>
          <div class="equalizer-bar" style="width: 8px; background: #00d4ff; box-shadow: 0 0 8px #00d4ff; border-radius: 4px; height: 20%; transition: height 0.1s;"></div>
          <div class="equalizer-bar" style="width: 8px; background: #00d4ff; box-shadow: 0 0 8px #00d4ff; border-radius: 4px; height: 20%; transition: height 0.1s;"></div>
          <div class="equalizer-bar" style="width: 8px; background: #00d4ff; box-shadow: 0 0 8px #00d4ff; border-radius: 4px; height: 20%; transition: height 0.1s;"></div>
        </div>
        
        <!-- ステータス表示 -->
        <div id="voiceStatus" style="font-size: 16px; font-weight: bold; margin-bottom: 12px; color: #00d4ff; text-shadow: 0 0 8px rgba(0, 212, 255, 0.5);">🎧 聞いています...</div>
        
        <!-- 認識中のテキスト表示 -->
        <div style="background: rgba(0, 212, 255, 0.1); border: 2px solid rgba(0, 212, 255, 0.5); border-radius: 12px; padding: 16px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: #00d4ff; margin-bottom: 8px; font-weight: bold;">📝 あなたが話した内容：</div>
          <div id="voiceTranscript" style="min-height: 50px; font-size: 18px; color: #a0e0f0; font-weight: bold; line-height: 1.4;">
            話しかけてください...
          </div>
        </div>
        
        <!-- 認識結果の解釈 -->
        <div id="voiceInterpretation" style="display: none; background: rgba(34, 197, 94, 0.1); border: 2px solid #22c55e; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: #22c55e; margin-bottom: 4px; font-weight: bold;">✅ 認識結果：</div>
          <div id="voiceInterpretationText" style="font-size: 14px; color: #86efac;"></div>
        </div>
        
        <!-- エラー表示 -->
        <div id="voiceError" style="display: none; background: rgba(239, 68, 68, 0.1); border: 2px solid #ef4444; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: #ef4444; margin-bottom: 4px; font-weight: bold;">❌ エラー：</div>
          <div id="voiceErrorText" style="font-size: 14px; color: #fca5a5;"></div>
        </div>
        
        <!-- ヒント -->
        <div id="voiceHint" style="font-size: 11px; color: #a0e0f0; margin-bottom: 12px; line-height: 1.5; opacity: 0.8;">
          💡 例：「店名を〇〇に変更」「価格を3500円に」
        </div>
        
        <!-- ボタン群 -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="voiceRetryBtn" onclick="retryVoiceCommand()" style="flex: 1; padding: 12px; background: rgba(0, 212, 255, 0.2); color: #00d4ff; border: 1px solid #00d4ff; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; display: none;">
            🔄 もう一度
          </button>
          <button onclick="stopVoiceCommand()" style="flex: 1; padding: 12px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer;">
            ✕ キャンセル
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }
  
  // コンテキストに応じてタイトルとヒントを変更
  const titleEl = document.getElementById('voiceTitle');
  const hintEl = document.getElementById('voiceHint');
  
  if (context === 'estimate') {
    titleEl.textContent = '🎤 音声で見積書作成';
    hintEl.innerHTML = `
      <div style="text-align: left; background: rgba(0, 212, 255, 0.1); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
        <div style="font-weight: bold; margin-bottom: 6px; color: #00d4ff;">📋 話す内容チェックリスト：</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px;">
          <div>☐ 顧客名（〇〇様）</div>
          <div>☐ 件名（〇〇工事）</div>
          <div>☐ 材料・商品名</div>
          <div>☐ 作業費</div>
          <div>☐ 諸経費</div>
          <div>☐ 合計金額</div>
        </div>
      </div>
      <div style="font-size: 11px;">💡 一気に話してください！例：「山田様、トイレ交換、便器5万円、作業費2万円、諸経費3千円」</div>
    `;
  } else if (context === 'invoice') {
    titleEl.textContent = '🎤 音声で請求書作成';
    hintEl.innerHTML = '💡 例：「山田工務店さん、トイレ交換、15万円」';
  } else {
    titleEl.textContent = '🎤 音声で修正';
    hintEl.innerHTML = '💡 例：「店名を〇〇に変更」「価格を3500円に」<br>「数量を5個に」「カテゴリを駐車場代に」';
  }
  
  // リセット
  document.getElementById('voiceStatus').textContent = '🎧 聞いています...';
  document.getElementById('voiceTranscript').textContent = '話しかけてください...';
  document.getElementById('voiceInterpretation').style.display = 'none';
  document.getElementById('voiceError').style.display = 'none';
  document.getElementById('voiceRetryBtn').style.display = 'none';
  document.getElementById('voiceEqualizer').style.display = 'flex';
  modal.classList.remove('hidden');
}

// 認識中のテキストを更新
function updateVoiceTranscript(text, isInterim) {
  const el = document.getElementById('voiceTranscript');
  if (el) {
    el.textContent = text || '話しかけてください...';
    // 暗い背景用に白系の色に
    el.style.color = isInterim ? '#a0e0f0' : '#ffffff';
  }
}

// 認識成功の表示
function showVoiceSuccess(transcript, interpretation) {
  document.getElementById('voiceStatus').textContent = '✅ 認識完了！';
  document.getElementById('voiceTranscript').textContent = transcript;
  document.getElementById('voiceEqualizer').style.display = 'none';
  
  const interpEl = document.getElementById('voiceInterpretation');
  const interpTextEl = document.getElementById('voiceInterpretationText');
  interpTextEl.textContent = interpretation;
  interpEl.style.display = 'block';
  
  document.getElementById('voiceRetryBtn').style.display = 'block';
  stopEqualizerAnimation();
}

// 認識失敗の表示
function showVoiceError(transcript, errorMsg) {
  document.getElementById('voiceStatus').textContent = '❌ 認識できませんでした';
  document.getElementById('voiceTranscript').textContent = transcript || '（音声が検出されませんでした）';
  document.getElementById('voiceEqualizer').style.display = 'none';
  
  const errorEl = document.getElementById('voiceError');
  const errorTextEl = document.getElementById('voiceErrorText');
  errorTextEl.textContent = errorMsg;
  errorEl.style.display = 'block';
  
  document.getElementById('voiceRetryBtn').style.display = 'block';
  stopEqualizerAnimation();
}

// 再試行
function retryVoiceCommand() {
  const context = currentVoiceContext;
  hideVoiceListening();
  setTimeout(() => {
    startVoiceCommand(context);
  }, 300);
}

// ステータス更新
function updateVoiceStatus(text) {
  const el = document.getElementById('voiceStatus');
  if (el) {
    el.textContent = text;
  }
}

// 音声認識停止
function stopVoiceCommand() {
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.log('recognition.stop() error:', e);
    }
  }
  isListening = false;
  stopEqualizerAnimation();
  hideVoiceListening();
}

function hideVoiceListening() {
  const modal = document.getElementById('voice-listening-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  stopEqualizerAnimation();
}

// コマンドタイプを日本語に変換
function getCommandTypeLabel(type) {
  const labels = {
    'storeName': '店名',
    'date': '日付',
    'amount': '金額',
    'quantity': '数量',
    'category': 'カテゴリ',
    'itemName': '品名'
  };
  return labels[type] || type;
}

// 音声コマンドを処理
async function processVoiceCommand(transcript) {
  // 見積書モードの場合は専用処理へ
  if (currentVoiceContext === 'estimate') {
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    if (settings.geminiApiKey) {
      processVoiceEstimate(transcript, settings.geminiApiKey);
    } else {
      alert('Gemini APIキーが設定されていません。');
      hideVoiceListening();
    }
    return;
  }
  
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const useGemini = settings.useGeminiForVoice && settings.geminiApiKey;
  
  let command = null;
  
  updateVoiceStatus('🔄 解析中...');
  
  if (useGemini) {
    // API使用量チェック
    const canUse = canUseApi();
    if (!canUse.allowed) {
      showVoiceError(transcript, canUse.reason + '\n\nシンプル解析で処理します。');
      // シンプル解析にフォールバック
      command = parseVoiceSimple(transcript);
    } else {
      // API使用を記録
      recordApiUsage();
      // Gemini APIで解析
      command = await parseVoiceWithGemini(transcript, settings.geminiApiKey);
    }
  } else {
    // シンプル解析
    command = parseVoiceSimple(transcript);
  }
  
  if (command && command.type) {
    // 成功表示
    const typeLabel = getCommandTypeLabel(command.type);
    const interpretation = `「${typeLabel}」を「${command.value}」に変更します`;
    showVoiceSuccess(transcript, interpretation);
    
    // 2秒後に実行
    setTimeout(() => {
      hideVoiceListening();
      executeVoiceCommand(command);
    }, 1500);
  } else {
    // 失敗表示
    showVoiceError(transcript, 'コマンドを理解できませんでした。\n「店名を〇〇に」「価格を〇〇円に」のように話してみてください。');
  }
}

// シンプル解析（無料）
function parseVoiceSimple(transcript) {
  const text = transcript.toLowerCase();
  
  // 店名変更
  if (text.includes('店名') || text.includes('店舗')) {
    const match = text.match(/(?:店名|店舗)(?:を|は)?(.+?)(?:に|へ)?(?:変更|修正)?$/);
    if (match) {
      return { type: 'storeName', value: match[1].trim() };
    }
  }
  
  // 日付変更
  if (text.includes('日付') || text.includes('日にち')) {
    // 「1月25日」のようなパターン
    const dateMatch = text.match(/(\d+)月(\d+)日/);
    if (dateMatch) {
      const year = new Date().getFullYear();
      const month = String(dateMatch[1]).padStart(2, '0');
      const day = String(dateMatch[2]).padStart(2, '0');
      return { type: 'date', value: `${year}-${month}-${day}` };
    }
    // 「昨日」「今日」
    if (text.includes('昨日')) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return { type: 'date', value: d.toISOString().split('T')[0] };
    }
    if (text.includes('今日')) {
      return { type: 'date', value: new Date().toISOString().split('T')[0] };
    }
  }
  
  // 金額変更
  if (text.includes('金額') || text.includes('価格') || text.includes('値段') || text.includes('円')) {
    const amountMatch = text.match(/(\d+)円/);
    if (amountMatch) {
      return { type: 'amount', value: parseInt(amountMatch[1]) };
    }
    // 「金額を1000」のようなパターンも
    const numMatch = text.match(/(?:金額|価格|値段)(?:を|は)?(\d+)/);
    if (numMatch) {
      return { type: 'amount', value: parseInt(numMatch[1]) };
    }
  }
  
  // 数量変更
  if (text.includes('数量') || text.includes('個数')) {
    const qtyMatch = text.match(/(?:数量|個数)(?:を|は)?(\d+)/);
    if (qtyMatch) {
      return { type: 'quantity', value: parseInt(qtyMatch[1]) };
    }
    const qtyMatch2 = text.match(/(\d+)(?:個|つ|本|枚)/);
    if (qtyMatch2) {
      return { type: 'quantity', value: parseInt(qtyMatch2[1]) };
    }
  }
  
  // カテゴリ変更
  if (text.includes('カテゴリ') || text.includes('分類')) {
    const categories = [
      'ガソリン代', '駐車場代', '高速道路代', '電車', 'バス',
      '車検', '自動車保険', '車修理', 'タイヤ',
      '携帯', 'インターネット', '電気代', 'ガス代', '水道代',
      '工具', '作業着', '文房具', '飲食', '弁当',
      '材料', '部材', '消耗品', '雑費'
    ];
    for (const cat of categories) {
      if (text.includes(cat.toLowerCase()) || text.includes(cat)) {
        return { type: 'category', value: cat };
      }
    }
  }
  
  // 品名変更
  if (text.includes('品名') || text.includes('商品名') || text.includes('名前')) {
    const match = text.match(/(?:品名|商品名|名前)(?:を|は)?(.+?)(?:に|へ)?(?:変更|修正)?$/);
    if (match) {
      return { type: 'itemName', value: match[1].trim() };
    }
  }
  
  return null;
}

// Gemini APIで解析
async function parseVoiceWithGemini(transcript, apiKey) {
  try {
    const prompt = `以下の音声コマンドを解析して、JSONで返してください。

コマンドの種類:
- storeName: 店名・店舗名の変更
- date: 日付の変更
- amount: 金額・価格・値段の変更（お金に関する数値）
- quantity: 数量・個数の変更（商品の個数）
- category: カテゴリ・分類の変更
- itemName: 品名・商品名の変更

重要：「金額」「価格」「値段」「〇〇円」は amount（金額）です。
「数量」「個数」「〇個」「〇本」は quantity（数量）です。

音声: "${transcript}"

JSON形式で返してください（説明不要）:
{"type": "コマンド種類", "value": "値"}

日付の場合はYYYY-MM-DD形式、金額・数量は数値のみで返してください。
認識できない場合は {"type": null} を返してください。`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      // JSONを抽出
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (e) {
    console.error('Gemini解析エラー:', e);
  }
  
  // フォールバック: シンプル解析を試す
  return parseVoiceSimple(transcript);
}

// コマンドを実行
function executeVoiceCommand(command) {
  if (!command || !command.type) return;
  
  if (currentVoiceContext === 'receipt') {
    executeReceiptVoiceCommand(command);
  } else if (currentVoiceContext === 'expense') {
    executeExpenseVoiceCommand(command);
  }
}

// レシート画面でのコマンド実行
function executeReceiptVoiceCommand(command) {
  switch (command.type) {
    case 'storeName':
      document.getElementById('receiptStoreName').value = command.value;
      alert('店名を「' + command.value + '」に変更しました！');
      break;
    case 'date':
      document.getElementById('receiptDate').value = command.value;
      alert('日付を変更しました！');
      break;
    case 'amount':
      // 最初の品目の金額を変更（3番目のinput = 金額）
      const amountInputs = document.querySelectorAll('#receiptItemsList .receipt-item-row');
      if (amountInputs.length > 0) {
        const firstRow = amountInputs[0];
        const inputs = firstRow.querySelectorAll('input[type="number"]');
        if (inputs.length >= 2) {
          inputs[1].value = command.value; // 2番目のnumber = 金額
          inputs[1].dispatchEvent(new Event('change'));
          updateReceiptTotal();
          alert('金額を ' + command.value.toLocaleString() + '円 に変更しました！');
        }
      }
      break;
    case 'quantity':
      // 最初の品目の数量を変更（2番目のinput = 数量）
      const qtyRows = document.querySelectorAll('#receiptItemsList .receipt-item-row');
      if (qtyRows.length > 0) {
        const firstRow = qtyRows[0];
        const inputs = firstRow.querySelectorAll('input[type="number"]');
        if (inputs.length >= 1) {
          inputs[0].value = command.value; // 1番目のnumber = 数量
          inputs[0].dispatchEvent(new Event('change'));
          alert('数量を ' + command.value + ' に変更しました！');
        }
      }
      break;
    case 'category':
      // カテゴリ選択があれば変更
      const categorySelect = document.querySelector('#receiptItemsList select');
      if (categorySelect) {
        // 該当するオプションを探す
        for (let option of categorySelect.options) {
          if (option.text.includes(command.value) || option.value.includes(command.value)) {
            categorySelect.value = option.value;
            alert('カテゴリを「' + command.value + '」に変更しました！');
            break;
          }
        }
      }
      break;
    case 'itemName':
      const nameInput = document.querySelector('#receiptItemsList input[type="text"]');
      if (nameInput) {
        nameInput.value = command.value;
        alert('品名を「' + command.value + '」に変更しました！');
      }
      break;
    default:
      alert('このコマンドは対応していません');
  }
}

// 経費帳画面でのコマンド実行
function executeExpenseVoiceCommand(command) {
  switch (command.type) {
    case 'date':
      document.getElementById('expFormDate').value = command.value;
      alert('日付を変更しました！');
      break;
    case 'amount':
      document.getElementById('expFormAmount').value = command.value;
      alert('金額を ' + command.value.toLocaleString() + '円 に変更しました！');
      break;
    case 'category':
      // カテゴリを検索して設定
      const cat1Select = document.getElementById('expFormCategory1');
      const cat2Select = document.getElementById('expFormCategory2');
      
      // 小分類から検索
      for (const [mainCat, subCats] of Object.entries(expenseCategories.expense)) {
        if (subCats.some(sub => sub.includes(command.value) || command.value.includes(sub))) {
          cat1Select.value = mainCat;
          updateExpenseCategory2();
          setTimeout(() => {
            for (let option of cat2Select.options) {
              if (option.text.includes(command.value) || command.value.includes(option.text)) {
                cat2Select.value = option.value;
                break;
              }
            }
          }, 100);
          alert('カテゴリを「' + command.value + '」に変更しました！');
          return;
        }
      }
      alert('カテゴリ「' + command.value + '」が見つかりませんでした');
      break;
    default:
      alert('このコマンドは対応していません');
  }
}

// ==========================================
// 見積書作成 音声コマンド（テキスト入力方式）
// ==========================================

// 見積書用テキスト入力ポップアップを表示（画面上部に完全固定）
function showVoiceEstimateInput() {
  let modal = document.getElementById('voice-estimate-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'voice-estimate-modal';
    // 画面上部に完全固定
    modal.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 99999 !important;
      padding: 10px;
      background: linear-gradient(135deg, #001520, #002530);
      border-bottom: 2px solid #00d4ff;
      box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3);
      transform: translateZ(0);
    `;
    modal.innerHTML = `
      <!-- タイトル行 -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-size: 14px; font-weight: bold; color: #00d4ff; text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);">🎤 音声で見積書作成</div>
        <button onclick="hideVoiceEstimateInput()" style="background: rgba(239, 68, 68, 0.3); color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: bold; cursor: pointer;">✕ 閉じる</button>
      </div>
      
      <!-- 入力欄とボタン -->
      <div style="display: flex; gap: 8px; align-items: stretch;">
        <textarea id="voiceEstimateText" placeholder="🎤 例：山田様、トイレ交換、便器5万円を2個、作業費2万円" style="flex: 1; height: 60px; padding: 10px; border: 2px solid rgba(0, 212, 255, 0.5); border-radius: 8px; background: rgba(255,255,255,0.95); font-size: 15px; resize: none; color: #1f2937;"></textarea>
        <button onclick="submitVoiceEstimate()" style="padding: 10px 16px; background: linear-gradient(135deg, #00d4ff, #0099cc); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 0 10px rgba(0, 212, 255, 0.4); white-space: nowrap;">
          ✨ 送信
        </button>
      </div>
      
      <!-- ステータス表示 -->
      <div id="voiceEstimateStatus" style="font-size: 12px; margin-top: 6px; color: #00d4ff; display: none; text-align: center;"></div>
    `;
    document.body.appendChild(modal);
  }
  
  // 見積書画面に移動
  showScreen('estimate');
  
  // リセット
  document.getElementById('voiceEstimateText').value = '';
  document.getElementById('voiceEstimateStatus').style.display = 'none';
  modal.style.display = 'block';
  
  // bodyにパディングを追加（ポップアップの高さ分）
  document.body.style.paddingTop = '110px';
  
  // テキストエリアにフォーカス（キーボードを出す）
  setTimeout(() => {
    document.getElementById('voiceEstimateText').focus();
  }, 300);
}

// 見積書用ポップアップを閉じる
function hideVoiceEstimateInput() {
  const modal = document.getElementById('voice-estimate-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  // bodyのパディングを戻す
  document.body.style.paddingTop = '0';
}

// 見積書用テキストをAIに送信
function submitVoiceEstimate() {
  const text = document.getElementById('voiceEstimateText').value.trim();
  
  if (!text) {
    alert('テキストを入力してください');
    return;
  }
  
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  
  // ステータス表示
  const statusEl = document.getElementById('voiceEstimateStatus');
  statusEl.textContent = '🔄 AIが解析中...';
  statusEl.style.display = 'block';
  
  // AIに送信
  processVoiceEstimate(text, settings.geminiApiKey);
}

// 見積書を音声で作成開始
function startVoiceEstimate() {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  
  if (!settings.geminiApiKey) {
    alert('この機能にはGemini APIキーが必要です。\n設定画面からAPIキーを入力してください。');
    return;
  }
  
  // API使用量チェック
  const canUse = canUseApi();
  if (!canUse.allowed) {
    alert(canUse.reason);
    return;
  }
  
  // テキスト入力ポップアップを表示
  showVoiceEstimateInput();
}

// 音声を解析して見積書に反映
async function processVoiceEstimate(transcript, apiKey) {
  try {
    // API使用を記録
    recordApiUsage();
    
    const prompt = `以下の音声を見積書作成用に解析してください。

音声: "${transcript}"

【重要ルール】
1. 金額が複数言及されている場合は、必ずitemsに分けて入れる
2. 「〇〇代」「〇〇費」「〇〇料」などは全て別々の品目としてitemsに入れる
3. amountは全ての品目の合計金額（単価×数量の合計）
4. 「〇個」「〇台」「〇枚」「〇本」「〇セット」などの数量表現を認識してquantityに入れる
5. 数量が明示されていない場合はquantity: 1とする

以下のJSON形式で返してください（説明不要）:
{
  "customerName": "顧客名（〇〇様、〇〇さん、〇〇工務店など）",
  "title": "件名・工事内容",
  "amount": 合計金額（数値のみ）,
  "items": [
    {"name": "品目名", "quantity": 数量, "price": 単価}
  ]
}

【例1】単一金額の場合
音声「山田工務店さん、トイレ交換、15万円」
→ {"customerName": "山田工務店", "title": "トイレ交換", "amount": 150000, "items": [{"name": "トイレ交換工事", "quantity": 1, "price": 150000}]}

【例2】複数金額の場合
音声「田中様、キッチン水栓交換、部品代8000円、工賃1万円」
→ {"customerName": "田中様", "title": "キッチン水栓交換", "amount": 18000, "items": [{"name": "部品代", "quantity": 1, "price": 8000}, {"name": "工賃", "quantity": 1, "price": 10000}]}

【例3】数量がある場合（重要！）
音声「佐藤様、蛇口交換、蛇口5000円を2個、作業費1万円」
→ {"customerName": "佐藤様", "title": "蛇口交換", "amount": 20000, "items": [{"name": "蛇口", "quantity": 2, "price": 5000}, {"name": "作業費", "quantity": 1, "price": 10000}]}

【例4】数量の表現パターン
- 「2個」「2台」「2枚」「2本」「2セット」→ quantity: 2
- 「3つ」「3か所」→ quantity: 3
- 「便器5万円×2」「便器5万円が2つ」→ quantity: 2

抽出できない項目はnullにしてください。`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      
      // JSONを抽出
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        // 成功表示
        let feedbackText = '';
        if (result.customerName) feedbackText += `顧客: ${result.customerName}\n`;
        if (result.title) feedbackText += `件名: ${result.title}\n`;
        if (result.items && result.items.length > 0) {
          feedbackText += `内訳: ${result.items.length}件\n`;
        }
        if (result.amount) feedbackText += `金額: ¥${result.amount.toLocaleString()}`;
        
        // ポップアップを閉じる
        hideVoiceEstimateInput();
        hideVoiceListening();
        
        // 見積書に反映
        applyVoiceEstimate(result);
        
        // 成功メッセージ
        alert('✅ 見積書を作成しました！\n\n' + feedbackText);
        return;
      }
    }
    
    throw new Error('解析に失敗しました');
    
  } catch (e) {
    console.error('見積書音声解析エラー:', e);
    // ステータス更新（テキスト入力ポップアップ用）
    const statusEl = document.getElementById('voiceEstimateStatus');
    if (statusEl) {
      statusEl.textContent = '❌ エラー: ' + e.message;
      statusEl.style.color = '#ef4444';
    }
    alert('解析に失敗しました。\n\n' + e.message + '\n\nもう一度お試しください。');
  }
}

// 解析結果を見積書に反映
function applyVoiceEstimate(data) {
  // 見積書画面に移動
  showScreen('estimate');
  
  // 少し待ってから値を設定（画面描画を待つ）
  setTimeout(() => {
    // 顧客名
    if (data.customerName) {
      const custInput = document.getElementById('estCustomerName');
      if (custInput) {
        custInput.value = data.customerName;
      }
    }
    
    // 件名
    if (data.title) {
      const titleInput = document.getElementById('estSubject');
      if (titleInput) {
        titleInput.value = data.title;
      }
    }
    
    // 品目がある場合
    if (data.items && data.items.length > 0) {
      // 既存の品目をクリア
      estimateMaterials = [];
      
      data.items.forEach(item => {
        if (item.name && item.price) {
          estimateMaterials.push({
            id: Date.now() + Math.random(),
            name: item.name,
            quantity: item.quantity || 1,
            unit: '式',
            costPrice: 0,  // 仕入単価（音声では不明なので0）
            profitRate: 0, // 利益率（音声では不明なので0）
            sellingPrice: item.price,  // 売値単価 ← これが重要！
            subtotal: (item.quantity || 1) * item.price
          });
        }
      });
      
      // 品目がない場合は金額から1つ作成
      if (estimateMaterials.length === 0 && data.amount) {
        estimateMaterials.push({
          id: Date.now(),
          name: data.title || '工事一式',
          quantity: 1,
          unit: '式',
          costPrice: 0,
          profitRate: 0,
          sellingPrice: data.amount,
          subtotal: data.amount
        });
      }
      
      renderEstimateMaterials();
      calculateEstimateTotal();
    } else if (data.amount) {
      // 品目なしで金額のみの場合
      estimateMaterials = [{
        id: Date.now(),
        name: data.title || '工事一式',
        quantity: 1,
        unit: '式',
        costPrice: 0,
        profitRate: 0,
        sellingPrice: data.amount,
        subtotal: data.amount
      }];
      renderEstimateMaterials();
      calculateEstimateTotal();
    }
    
    // 成功メッセージ
    let msg = '✅ 音声から見積書を作成しました！\n\n';
    if (data.customerName) msg += `顧客名: ${data.customerName}\n`;
    if (data.title) msg += `件名: ${data.title}\n`;
    if (data.amount) msg += `金額: ¥${data.amount.toLocaleString()}\n`;
    msg += '\n内容を確認・修正してください。';
    
    alert(msg);
    
  }, 300);
}

// ===== 経費帳の機能 =====

// カテゴリ定義
