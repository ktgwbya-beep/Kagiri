import express from 'express';

const app = express();
const PORT = 5050;

// 画像（Base64）などの大容量データを受け取るための設定
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ==================== インメモリデータ管理 ====================
let posts = [
  {
    id: 'dummy-1',
    author: 'ミナト',
    time: '10分前',
    text: 'Bento UIデザインで作られた「Kagiri」いい感じですね！シンプルで洗練されたテイストが可愛い。',
    images: ['https://picsum.photos/600/600?random=1'],
    likes: 4,
    comments: [
      {
        id: 'c1',
        author: 'タクミ',
        text: 'すっきりしたシンプルなデザインに調整されて、さらに見やすくなりましたね！',
        time: '5分前'
      }
    ]
  },
  {
    id: 'dummy-2',
    author: 'アカリ',
    time: '25分前',
    text: '今日の夕飯はちょっと豪華にオムライス。たまごがふわふわにできました。画像2枚投稿のテストです！',
    images: ['https://picsum.photos/600/600?random=2', 'https://picsum.photos/600/600?random=3'],
    likes: 12,
    comments: [
      {
        id: 'c2',
        author: 'ソウタ',
        text: 'めちゃくちゃうまそう！お腹空いてきました。',
        time: '15分前'
      },
      {
        id: 'c3',
        author: 'アカリ',
        time: '10分前',
        text: 'ありがとう！バターを多めに入れるのがコツです。'
      }
    ]
  },
  {
    id: 'dummy-3',
    author: '匿名ヒト',
    time: '1時間前',
    text: '深夜0時に全部消えてしまうっていうコンセプト、すごく惹かれる。今日あった嫌なことも、全部溶けて消えちゃえ！',
    images: [],
    likes: 8,
    comments: []
  }
];

// ==================== 深夜0時の自動データ消滅タイマー ====================
// 30秒ごとに時間を監視し、0時0分になったらインメモリの投稿データを消去
let lastClearedDate = new Date().getDate();

setInterval(() => {
  const now = new Date();
  const currentDate = now.getDate();

  // 日付が変わったタイミングでリセット
  if (currentDate !== lastClearedDate && now.getHours() === 0 && now.getMinutes() === 0) {
    console.log('深夜0時を迎えました。すべてのインメモリ投稿をリセットします。');
    posts = [];
    lastClearedDate = currentDate;
  }
}, 30000); // 30秒ごとに実行

// ==================== API エンドポイント ====================

// 投稿一覧の取得
app.get('/api/posts', (req, res) => {
  res.json({ success: true, posts });
});

// 新規投稿の作成
app.post('/api/posts', (req, res) => {
  const { author, text, images } = req.body;

  if (!text) {
    return res.status(400).json({ success: false, message: 'テキストは必須です。' });
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo'
  });

  const newPost = {
    id: 'post-' + Date.now(),
    author: author || 'ゲスト',
    time: timeStr,
    text,
    images: images || [],
    likes: 0,
    comments: [] // 空のコメント配列を初期化
  };

  // メモリ配列の先頭に追加
  posts.unshift(newPost);

  res.status(201).json({ success: true, post: newPost });
});

// 投稿へのいいね追加
app.post('/api/posts/:id/like', (req, res) => {
  const postId = req.params.id;
  const post = posts.find(p => p.id === postId);

  if (!post) {
    return res.status(404).json({ success: false, message: '投稿が見つかりません。' });
  }

  post.likes += 1;
  res.json({ success: true, likes: post.likes });
});

// 投稿へのいいね解除
app.post('/api/posts/:id/unlike', (req, res) => {
  const postId = req.params.id;
  const post = posts.find(p => p.id === postId);

  if (!post) {
    return res.status(404).json({ success: false, message: '投稿が見つかりません。' });
  }

  post.likes = Math.max(0, post.likes - 1);
  res.json({ success: true, likes: post.likes });
});

// 特定の投稿にコメントを追加
app.post('/api/posts/:id/comments', (req, res) => {
  const postId = req.params.id;
  const { author, text } = req.body;
  const post = posts.find(p => p.id === postId);

  if (!post) {
    return res.status(404).json({ success: false, message: '投稿が見つかりません。' });
  }
  if (!text) {
    return res.status(400).json({ success: false, message: 'コメント本文は必須です。' });
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo'
  });

  const newComment = {
    id: 'comment-' + Date.now(),
    author: author || 'ゲスト',
    text,
    time: timeStr
  };

  post.comments = post.comments || [];
  post.comments.push(newComment);

  res.status(201).json({ success: true, comment: newComment, commentsCount: post.comments.length });
});

// デバッグ用手動リセットAPI（クライアントからの消滅テスト連動用）
app.post('/api/posts/reset', (req, res) => {
  posts = [];
  console.log('APIトリガーにより投稿データが消滅しました。');
  res.json({ success: true, message: 'サーバー上の投稿を全て消滅させました。' });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
