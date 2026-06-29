import { gsap } from 'gsap';

// ==================== 1. ストレージキーと状態管理 ====================
const STORAGE_KEYS = {
  USERNAME: 'kagiri_username',
  LIKES: 'kagiri_likes',       // 形式: { [postId]: likedAtTimestamp }
  HIDDEN: 'kagiri_hidden_posts', // 形式: [postId, postId, ...]
  LOGIN_DATE: 'kagiri_login_date' // 形式: YYYY/MM/DD (日本時間)
};

const state = {
  user: {
    name: '',
    isLoggedIn: false
  },
  currentTab: 'latest', // latest, shuffle, favorites
  theme: 'light',
  likes: {},            // ローカルで保持するいいね状態
  hiddenPosts: [],      // ローカルで非表示にした投稿ID
  posts: [],             // サーバーから取得する投稿一覧
  isMelting: false,      // 消滅演出の実行中フラグ
  isSubmitting: false    // 新規投稿の送信中（連打防止）ロックフラグ
};

// ==================== API接続ベースURLの設定 ====================
// ローカルでの検証時は空文字（相対パス）、本番（エックスサーバーなど）では自動的にRender.comのURLに接続先が切り替わります。
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : 'https://kagiri.onrender.com';

// ==================== 2. ストレージ操作ヘルパー ====================
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('LocalStorageへの書き込みに失敗しました:', e);
  }
}

function getFromStorage(key, defaultValue) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error('LocalStorageからの読み込みに失敗しました:', e);
    return defaultValue;
  }
}

// ローカルストレージデータの読み込み
function syncStorageData() {
  state.likes = getFromStorage(STORAGE_KEYS.LIKES, {});
  state.hiddenPosts = getFromStorage(STORAGE_KEYS.HIDDEN, []);
}

// ==================== 3. サーバーAPI通信 ====================

// 投稿一覧のロード
async function loadPostsFromServer() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/posts`);
    const data = await res.json();
    if (data.success) {
      state.posts = data.posts;
      
      // メモリ上の投稿とローカルストレージのいいね状態を同期
      state.posts.forEach(post => {
        post.liked = !!state.likes[post.id];
      });
    }
  } catch (e) {
    console.error('サーバーからの投稿取得に失敗しました。', e);
  }
}

// ==================== 4. 初期化処理 ====================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initLucide();
  setupEventListeners();
  syncStorageData();
  setupMidnightTimer(); // 深夜0時の監視を開始
  startCountdownTimer(); // 入室前（トップページ）でもタイマーを直ちに開始

  // 前日以前のログインデータであるかを確認し、日付が変わっていればLocalStorageをクリア
  const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const loginDate = getFromStorage(STORAGE_KEYS.LOGIN_DATE, '');
  if (loginDate && loginDate !== todayStr) {
    console.log('日付が変わっているため、前日のデータを消去します。');
    localStorage.clear();
  }

  // 自動入室（ニックネームが保存されている場合）
  const savedUsername = getFromStorage(STORAGE_KEYS.USERNAME, '');
  if (savedUsername) {
    state.user.name = savedUsername;
    state.user.isLoggedIn = true;

    // アニメーションなしで直接タイムラインを表示
    document.getElementById('intro-screen').classList.add('hidden');
    document.getElementById('timeline-screen').classList.remove('hidden');
    document.body.classList.add('timeline-active');
    document.getElementById('write-btn')?.classList.remove('hidden');
    document.querySelector('.filter-box')?.classList.remove('hidden');
    gsap.set('#timeline-screen', { display: 'flex', opacity: 1, y: 0 });
    
    await loadPostsFromServer();
    renderTimeline();
  } else {
    // 初回・未入室時はIntro画面を表示
    document.getElementById('intro-screen').classList.remove('hidden');
    document.getElementById('timeline-screen').classList.add('hidden');
    gsap.set('#intro-screen', { display: 'flex', opacity: 1 });
    
    await loadPostsFromServer();
    renderTimeline();
  }
});

// Lucideアイコンの初期化/再初期化
function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ==================== 5. テーマ管理 ====================
function initTheme() {
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  
  const applyTheme = (isDark) => {
    state.theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
  };

  applyTheme(systemPrefersDark.matches);

  systemPrefersDark.addEventListener('change', (e) => {
    applyTheme(e.matches);
  });
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const themeBtn = document.getElementById('theme-toggle');
  const introThemeBtn = document.getElementById('intro-theme-toggle');
  if (!themeBtn && !introThemeBtn) return;
  
  const iconHtml = state.theme === 'dark' 
    ? '<i data-lucide="sun" class="icon-orange"></i>' 
    : '<i data-lucide="moon" class="icon-orange"></i>';

  if (themeBtn) themeBtn.innerHTML = iconHtml;
  if (introThemeBtn) introThemeBtn.innerHTML = iconHtml;
  initLucide();
}

// ==================== 6. イベントリスナー ====================
function setupEventListeners() {
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);

  // デバッグ用消滅テスト
  document.getElementById('meltdown-btn')?.addEventListener('click', triggerMidnightMeltdown);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  document.getElementById('write-btn')?.addEventListener('click', openPostModal);
  document.getElementById('close-modal-btn')?.addEventListener('click', closePostModal);
  document.getElementById('post-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePostModal();
  });

  document.getElementById('post-form')?.addEventListener('submit', handleCreatePost);
  document.getElementById('post-images')?.addEventListener('change', handleImageSelect);

  // 画像拡大オーバーレイのクローズ処理
  document.getElementById('image-overlay')?.addEventListener('click', closeImageOverlay);

  // Kagiri説明モーダルのイベントバインド
  document.getElementById('about-logo')?.addEventListener('click', openAboutModal);
  document.getElementById('intro-about-btn')?.addEventListener('click', openAboutModal);
  document.getElementById('close-about-btn')?.addEventListener('click', closeAboutModal);
  document.getElementById('about-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAboutModal();
  });
}

// ==================== 7. 入室処理 (Intro -> Timeline) ====================
function handleLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('username');
  if (!usernameInput) return;

  state.user.name = usernameInput.value.trim();
  state.user.isLoggedIn = true;

  // LocalStorageにユーザー名とログイン日付を保存
  saveToStorage(STORAGE_KEYS.USERNAME, state.user.name);
  const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  saveToStorage(STORAGE_KEYS.LOGIN_DATE, todayStr);

  // カウントダウンタイマーの開始
  startCountdownTimer();

  // GSAP タイムラインでアニメーション遷移
  const tl = gsap.timeline();

  tl.to('#intro-screen', {
    opacity: 0,
    y: -30,
    duration: 0.5,
    ease: 'power2.inOut',
    onComplete: () => {
      document.getElementById('intro-screen').classList.add('hidden');
      document.getElementById('timeline-screen').classList.remove('hidden');
      document.body.classList.add('timeline-active');
      document.getElementById('write-btn')?.classList.remove('hidden');
      document.querySelector('.filter-box')?.classList.remove('hidden');
      gsap.set('#timeline-screen', { display: 'flex' });
      renderTimeline(); // 入室時に最新状態で描画
    }
  });

  tl.fromTo('#timeline-screen', 
    { opacity: 0, y: 30 },
    { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
  );

  tl.from('.filter-box', { opacity: 0, y: 15, duration: 0.4, ease: 'power2.out' }, '-=0.3');
  tl.from('.post-card', { 
    opacity: 0, 
    y: 20, 
    stagger: 0.1, 
    duration: 0.5, 
    ease: 'power2.out' 
  }, '-=0.2');
}

// ==================== 8. タブ切り替え ====================
function switchTab(tab) {
  state.currentTab = tab;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  renderTimeline();

  gsap.from('.post-card', {
    opacity: 0,
    y: 15,
    stagger: 0.08,
    duration: 0.4,
    ease: 'power2.out'
  });
}

// ==================== 9. タイムライン描画処理 ====================
function renderTimeline() {
  const container = document.getElementById('timeline-posts');
  if (!container) return;

  container.innerHTML = '';

  // 1. 非表示にした投稿を除外
  let filteredPosts = state.posts.filter(post => !state.hiddenPosts.includes(post.id));

  // 2. タブごとのデータ絞り込み・ソート
  if (state.currentTab === 'shuffle') {
    filteredPosts.sort(() => Math.random() - 0.5);
  } else if (state.currentTab === 'favorites') {
    // 自分がいいねした投稿のみ抽出
    filteredPosts = filteredPosts.filter(post => !!state.likes[post.id]);
    
    // いいねした日時（タイムスタンプ）の新しい順にソート
    filteredPosts.sort((a, b) => {
      const timeA = state.likes[a.id] || 0;
      const timeB = state.likes[b.id] || 0;
      return timeB - timeA; // 降順
    });
  }

  if (filteredPosts.length === 0) {
    container.innerHTML = `
      <div class="bento-box info-box" style="grid-column: 1 / -1; text-align: center; padding: 40px 20px;">
        <i data-lucide="inbox" style="margin: 0 auto 12px; width: 40px; height: 40px; color: var(--text-muted);"></i>
        <p style="font-weight: 700;">投稿がありません</p>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
          ${state.currentTab === 'favorites' ? 'いいねした投稿がここに表示されます。' : '最初の投稿をしてみましょう！'}
        </p>
      </div>
    `;
    initLucide();
    return;
  }

  filteredPosts.forEach(post => {
    const postCard = document.createElement('article');
    postCard.className = 'bento-box post-card';
    postCard.id = `post-${post.id}`;

    let imagesHTML = '';
    if (post.images && post.images.length > 0) {
      const isMulti = post.images.length > 1;
      imagesHTML = `
        <div class="post-images ${isMulti ? 'multi-image' : 'single-image'}">
          ${post.images.map(src => `
            <div class="post-img-wrapper">
              <img src="${src}" alt="投稿画像" loading="lazy">
            </div>
          `).join('')}
        </div>
      `;
    }

    const isLiked = !!state.likes[post.id];
    const commentsCount = post.comments ? post.comments.length : 0;

    postCard.innerHTML = `
      <div class="post-header">
        <span class="post-author">${escapeHTML(post.author)}</span>
        <span class="post-time">${post.time}</span>
      </div>
      <div class="post-body">
        <p>${escapeHTML(post.text).replace(/\n/g, '<br>')}</p>
        ${imagesHTML}
      </div>
      <div class="post-actions">
        <button class="action-btn btn-like ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
          <i data-lucide="star"></i>
          <span class="like-count">${post.likes}</span>
        </button>
        <button class="action-btn btn-comment" data-post-id="${post.id}">
          <i data-lucide="message-circle"></i>
          <span class="comments-count">${commentsCount}</span>
        </button>
        <button class="action-btn btn-hide" data-post-id="${post.id}">
          <i data-lucide="eye-off"></i>
          <span>非表示</span>
        </button>
      </div>
      
      <!-- コメントアコーディオンセクション -->
      <div class="post-comments-section" id="comments-section-${post.id}">
        <div class="comments-list" id="comments-list-${post.id}">
          ${(post.comments || []).map(comment => `
            <div class="comment-item">
              <div class="comment-meta">
                <span class="comment-author">${escapeHTML(comment.author)}</span>
                <span class="comment-time">${comment.time}</span>
              </div>
              <div class="comment-body">${escapeHTML(comment.text)}</div>
            </div>
          `).join('')}
        </div>
        <form class="comment-form" data-post-id="${post.id}">
          <input type="text" class="comment-input" placeholder="コメントを入力..." required maxlength="100" autocomplete="off">
          <button type="submit" class="btn btn-primary btn-comment-submit">
            <i data-lucide="send" style="width: 16px; height: 16px;"></i>
          </button>
        </form>
      </div>
    `;

    // いいねトグル
    postCard.querySelector('.btn-like').addEventListener('click', (e) => {
      handleLikeToggle(post.id, e.currentTarget);
    });

    // コメントセクションの展開/格納
    postCard.querySelector('.btn-comment').addEventListener('click', () => {
      toggleCommentsSection(post.id);
    });

    // コメントフォーム送信
    postCard.querySelector('.comment-form').addEventListener('submit', (e) => {
      handleCommentSubmit(e, post.id);
    });

    // 非表示処理
    postCard.querySelector('.btn-hide').addEventListener('click', () => {
      handleHidePost(post.id);
    });

    // 画像拡大プレビューのクリックイベントバインド
    postCard.querySelectorAll('.post-img-wrapper img').forEach(img => {
      img.addEventListener('click', () => {
        openImageOverlay(img.src);
      });
    });

    container.appendChild(postCard);
  });

  initLucide();
}

// ==================== 10. アクション処理 (いいね / コメントトグル / 非表示) ====================
async function handleLikeToggle(postId, buttonEl) {
  const post = state.posts.find(p => p.id === postId);
  const likesMap = getFromStorage(STORAGE_KEYS.LIKES, {});
  const isCurrentlyLiked = !!likesMap[postId];

  // サーバーへ「いいね」または「解除」を通知
  const url = `${API_BASE_URL}/api/posts/${postId}/${isCurrentlyLiked ? 'unlike' : 'like'}`;
  
  try {
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    
    if (data.success) {
      if (!isCurrentlyLiked) {
        // いいね成功
        likesMap[postId] = Date.now();
        if (post) {
          post.likes = data.likes;
          post.liked = true;
        }
        buttonEl.classList.add('liked');
        createLikeExplosion(buttonEl);
      } else {
        // いいね解除成功
        delete likesMap[postId];
        if (post) {
          post.likes = data.likes;
          post.liked = false;
        }
        buttonEl.classList.remove('liked');
      }

      // ストレージとローカル状態を更新
      saveToStorage(STORAGE_KEYS.LIKES, likesMap);
      state.likes = likesMap;

      // カウンター更新
      buttonEl.querySelector('.like-count').textContent = data.likes;

      // お気に入りタブ表示中の場合、表示から外すために少し遅れて再描画
      if (state.currentTab === 'favorites') {
        setTimeout(() => {
          renderTimeline();
        }, 300);
      }
    }
  } catch (e) {
    console.error('いいねの更新に失敗しました:', e);
  }
}

// コメント展開のアコーディオンアニメーション (GSAP)
function toggleCommentsSection(postId) {
  const section = document.getElementById(`comments-section-${postId}`);
  if (!section) return;

  const isHidden = window.getComputedStyle(section).display === 'none';

  if (isHidden) {
    // 展開する
    gsap.set(section, { display: 'block', height: 0, opacity: 0 });
    gsap.to(section, {
      height: 'auto',
      opacity: 1,
      duration: 0.35,
      ease: 'power2.out',
      onComplete: () => {
        // 高さ指定をクリアしてレスポンシブ崩れを防ぐ
        gsap.set(section, { height: 'auto' });
        // コメント一覧がある場合は下部へスクロール
        const list = document.getElementById(`comments-list-${postId}`);
        if (list) list.scrollTop = list.scrollHeight;
      }
    });
  } else {
    // 畳む
    gsap.to(section, {
      height: 0,
      opacity: 0,
      duration: 0.3,
      ease: 'power2.inOut',
      onComplete: () => {
        gsap.set(section, { display: 'none' });
      }
    });
  }
}

// コメント送信処理
async function handleCommentSubmit(e, postId) {
  e.preventDefault();
  const form = e.currentTarget;
  const input = form.querySelector('.comment-input');
  if (!input || !input.value.trim()) return;

  const commentText = input.value.trim();
  const commentAuthor = state.user.name || 'ゲスト';

  try {
    const res = await fetch(`${API_BASE_URL}/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        author: commentAuthor,
        text: commentText
      })
    });

    const data = await res.json();
    if (data.success) {
      // 1. ローカル状態（メモリ）への同期
      const post = state.posts.find(p => p.id === postId);
      if (post) {
        post.comments = post.comments || [];
        post.comments.push(data.comment);
      }

      // 2. コメントリストUIへの追加
      const listContainer = document.getElementById(`comments-list-${postId}`);
      if (listContainer) {
        const commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        commentEl.style.opacity = 0;
        commentEl.innerHTML = `
          <div class="comment-meta">
            <span class="comment-author">${escapeHTML(data.comment.author)}</span>
            <span class="comment-time">${data.comment.time}</span>
          </div>
          <div class="comment-body">${escapeHTML(data.comment.text)}</div>
        `;
        listContainer.appendChild(commentEl);

        // 新しいコメントのフェードインアニメーション
        gsap.to(commentEl, { opacity: 1, duration: 0.3, ease: 'power1.out' });
        
        // リスト最下部への自動スクロール
        gsap.to(listContainer, {
          scrollTo: listContainer.scrollHeight,
          duration: 0.2,
          scrollTop: listContainer.scrollHeight
        });
      }

      // 3. コメント数カウンターの更新
      const card = document.getElementById(`post-${postId}`);
      const counter = card?.querySelector('.comments-count');
      if (counter) {
        counter.textContent = data.commentsCount;
      }

      // 入力欄をクリア
      input.value = '';
    }
  } catch (err) {
    console.error('コメントの送信に失敗しました:', err);
    alert('コメントの送信に失敗しました。');
  }
}

// 星パーティクルアニメーション
function createLikeExplosion(targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const body = document.body;
  const numParticles = 8;

  for (let i = 0; i < numParticles; i++) {
    const particle = document.createElement('i');
    particle.setAttribute('data-lucide', 'star');
    particle.className = 'star-particle';
    
    const x = rect.left + rect.width / 2 + window.scrollX;
    const y = rect.top + rect.height / 2 + window.scrollY;
    
    gsap.set(particle, {
      x: x,
      y: y,
      scale: gsap.utils.random(0.4, 0.8),
      color: '#ff5500',
      fill: '#ff5500'
    });

    body.appendChild(particle);
    initLucide();

    const angle = (i / numParticles) * Math.PI * 2 + gsap.utils.random(-0.2, 0.2);
    const velocity = gsap.utils.random(40, 80);
    const destX = x + Math.cos(angle) * velocity;
    const destY = y + Math.sin(angle) * velocity;

    gsap.to(particle, {
      x: destX,
      y: destY,
      opacity: 0,
      scale: 0.1,
      rotation: gsap.utils.random(0, 360),
      duration: 0.6,
      ease: 'power2.out',
      onComplete: () => {
        particle.remove();
      }
    });
  }
}

function handleHidePost(postId) {
  const card = document.getElementById(`post-${postId}`);
  if (!card) return;

  // GSAPでスライドアウト演出
  gsap.to(card, {
    x: -100,
    opacity: 0,
    height: 0,
    padding: 0,
    marginTop: 0,
    marginBottom: 0,
    borderWidth: 0,
    boxShadow: 'none',
    duration: 0.4,
    ease: 'power2.in',
    onComplete: () => {
      // 非表示リストに追加して保存
      const hiddenList = getFromStorage(STORAGE_KEYS.HIDDEN, []);
      if (!hiddenList.includes(postId)) {
        hiddenList.push(postId);
        saveToStorage(STORAGE_KEYS.HIDDEN, hiddenList);
        state.hiddenPosts = hiddenList;
      }
      renderTimeline();
    }
  });
}

// ==================== 11. 説明モーダル & 投稿モーダル & クライアント画像圧縮 ====================
function openAboutModal() {
  const modal = document.getElementById('about-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  gsap.fromTo(modal.querySelector('.modal-content'), 
    { scale: 0.9, opacity: 0, y: 20 },
    { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'back.out(1.5)' }
  );
}

function closeAboutModal() {
  const modal = document.getElementById('about-modal');
  if (!modal) return;
  gsap.to(modal.querySelector('.modal-content'), {
    scale: 0.9,
    opacity: 0,
    y: 20,
    duration: 0.2,
    ease: 'power2.in',
    onComplete: () => {
      modal.classList.add('hidden');
    }
  });
}

function openPostModal() {
  const modal = document.getElementById('post-modal');
  modal.classList.remove('hidden');
  gsap.fromTo('.modal-content', 
    { scale: 0.9, opacity: 0, y: 20 },
    { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'back.out(1.5)' }
  );
}

function closePostModal() {
  gsap.to('.modal-content', {
    scale: 0.9,
    opacity: 0,
    y: 20,
    duration: 0.2,
    ease: 'power2.in',
    onComplete: () => {
      document.getElementById('post-modal').classList.add('hidden');
      document.getElementById('post-form').reset();
      document.getElementById('image-previews-container').innerHTML = '';
    }
  });
}

// HTML5 Canvas を使用したクライアント側画像自動圧縮処理
function compressImage(file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // アスペクト比を維持しながら最大サイズにリサイズ
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        
        // 透過PNG等をJPEG変換する際の黒つぶれを防ぐため、背景を白で塗りつぶす
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        // JPEG 形式で一定クオリティで圧縮して Base64 出力
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// 画像選択時のプレビュー表示（Canvas圧縮を挟む）
async function handleImageSelect(e) {
  const files = e.target.files;
  const container = document.getElementById('image-previews-container');
  if (!container) return;

  container.innerHTML = '';
  
  const maxFiles = Math.min(files.length, 2);
  for (let i = 0; i < maxFiles; i++) {
    const file = files[i];
    try {
      // 選択した画像を即座に圧縮
      const compressedDataUrl = await compressImage(file);
      
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-wrapper';
      wrapper.innerHTML = `
        <img src="${compressedDataUrl}" alt="選択画像プレビュー">
        <button type="button" class="remove-img-btn">&times;</button>
      `;
      
      wrapper.querySelector('.remove-img-btn').addEventListener('click', () => {
        wrapper.remove();
      });

      container.appendChild(wrapper);
    } catch (err) {
      console.error('画像の圧縮に失敗しました:', err);
    }
  }
}

// サーバーへ新規投稿を作成・POST
async function handleCreatePost(e) {
  e.preventDefault();

  if (state.isSubmitting) return; // 送信中は処理をガード（連打防止）

  const textEl = document.getElementById('post-text');
  if (!textEl) return;

  const submitBtn = document.querySelector('#post-form button[type="submit"]');
  const originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';

  // プレビューの画像ソース（すでにCanvasで圧縮されたBase64文字列）を収集
  const imageUrls = [];
  document.querySelectorAll('#image-previews-container img').forEach(img => {
    imageUrls.push(img.src);
  });

  const postData = {
    author: state.user.name || 'ゲスト',
    text: textEl.value,
    images: imageUrls
  };

  // 送信中のフラグセットとUIのロード演出
  state.isSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';
    submitBtn.innerHTML = '<span>送信中...</span><i data-lucide="loader" class="animate-spin" style="width: 16px; height: 16px;"></i>';
    initLucide();
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(postData)
    });
    
    const data = await res.json();
    if (data.success) {
      // サーバーが返却した新規投稿をローカルメモリに追加
      state.posts.unshift(data.post);
      
      closePostModal();
      renderTimeline();

      // 新規カードへのふわっと表示アニメーション
      const newCard = document.getElementById(`post-${data.post.id}`);
      if (newCard) {
        gsap.from(newCard, {
          scale: 0.8,
          opacity: 0,
          duration: 0.4,
          ease: 'back.out(1.2)'
        });
      }
    }
  } catch (err) {
    console.error('投稿の作成に失敗しました:', err);
    alert('投稿の送信に失敗しました。');
  } finally {
    // 成功・失敗にかかわらず送信ロックを解除してボタンを戻す
    state.isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.innerHTML = originalBtnHTML;
      initLucide();
    }
  }
}

// ==================== 12. 深夜0時消滅ロジック & アニメーション ====================

// 0時自動消滅の予約とタイマー管理
function setupMidnightTimer() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0); // 明日の深夜0時 (00:00:00)
  
  const msToMidnight = nextMidnight.getTime() - now.getTime();

  // 明日の0時になったら自動で消滅処理を実行
  setTimeout(() => {
    triggerMidnightMeltdown();
  }, msToMidnight);

  // バックアップ監視（スリープ復帰後などに日付をまたいでいた場合に対応）
  let lastCheckedDate = now.getDate();
  setInterval(() => {
    const checkNow = new Date();
    if (checkNow.getDate() !== lastCheckedDate) {
      triggerMidnightMeltdown();
    }
  }, 20000); // 20秒チェック
}

// 消滅の演出（溶けて消えるアニメーション）とリセット処理
async function triggerMidnightMeltdown() {
  if (state.isMelting) return;
  state.isMelting = true;

  console.log('消滅演出（メルトダウン）を開始します。');

  // 1. サーバーのインメモリデータをリセット
  try {
    await fetch(`${API_BASE_URL}/api/posts/reset`, { method: 'POST' });
  } catch (e) {
    console.error('サーバーデータのリセットに失敗しました:', e);
  }

  // 2. GSAPによる「スゥーッと背景に溶けて消える」演出 (ブラーとフェードアウト)
  const tl = gsap.timeline();

  // 投稿カード群を上から順に時間差でブラー＆フェードアウト
  tl.to('.post-card', {
    filter: 'blur(24px)',
    opacity: 0,
    y: 15,
    scale: 0.95,
    duration: 2.2,
    stagger: 0.12,
    ease: 'power2.out'
  });

  // ヘッダー、コントロール、投稿ボタンも順次消滅
  tl.to(['.app-header', '.filter-box', '#write-btn'], {
    filter: 'blur(16px)',
    opacity: 0,
    duration: 1.5,
    ease: 'power2.inOut'
  }, '-=1.6');

  // 3. アニメーション完了後にLocalStorageをクリアし、強制リロード
  tl.to({}, {
    duration: 0.8,
    onComplete: () => {
      localStorage.clear(); // 保存された名前、いいね、非表示データをすべて削除
      window.location.reload(); // リロードして入室画面に戻す
    }
  });
}

// ==================== 13. ユーティリティ ====================
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==================== 14. 画像拡大モーダル ====================
function openImageOverlay(src) {
  const overlay = document.getElementById('image-overlay');
  const img = document.getElementById('overlay-img');
  if (!overlay || !img) return;

  img.src = src;
  overlay.classList.remove('hidden');

  // GSAPでなめらかにフェード＆ズームイン表示
  gsap.fromTo(img,
    { scale: 0.9, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' }
  );
}

function closeImageOverlay() {
  const overlay = document.getElementById('image-overlay');
  if (!overlay) return;

  gsap.to('#overlay-img', {
    scale: 0.9,
    opacity: 0,
    duration: 0.2,
    ease: 'power2.in',
    onComplete: () => {
      overlay.classList.add('hidden');
      document.getElementById('overlay-img').src = '';
    }
  });
}

// ==================== 15. カウントダウンタイマー ====================
let countdownIntervalId = null;

function startCountdownTimer() {
  if (countdownIntervalId) clearInterval(countdownIntervalId);

  const timerEl = document.getElementById('countdown-timer');
  const introTimerEl = document.getElementById('intro-countdown-timer');
  if (!timerEl && !introTimerEl) return;

  function updateTimer() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0); // 次の深夜0時

    const diffMs = midnight.getTime() - now.getTime();
    let htmlContent = '';
    
    if (diffMs <= 0) {
      htmlContent = '<span class="countdown-label">消滅まで</span><span class="countdown-time-val">00:00:00</span>';
    } else {
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      const format = (num) => String(num).padStart(2, '0');
      htmlContent = `<span class="countdown-label">消滅まで</span><span class="countdown-time-val">${format(hours)}:${format(minutes)}:${format(seconds)}</span>`;
    }

    if (timerEl) timerEl.innerHTML = htmlContent;
    if (introTimerEl) introTimerEl.innerHTML = htmlContent;
  }

  updateTimer();
  countdownIntervalId = setInterval(updateTimer, 1000);
}
