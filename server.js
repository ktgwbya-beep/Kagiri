import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5050;

// すべてのドメインからのAPIアクセスを許可する (CORS解除)
app.use(cors());

// 画像（Base64）などの大容量データを受け取るための設定
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ==================== インメモリデータ管理 ====================
const DEFAULT_POSTS = [
  {
    id: 'dummy-1',
    author: 'Kagiriコンセプト',
    time: '只今',
    text: '【Kagiriへようこそ】\n\nKagiriは、いまこの瞬間の思考や感情を誰の目も気にせずそっと書き留めるための、1日限りのSNSです。\n\nここでのすべての投稿や共有された写真は、深夜24時（0時）を迎えた瞬間に跡形もなく消え去ります。次の日には、すべてがまっさらな新しい一日から始まります。',
    images: [],
    likes: 3,
    comments: []
  },
  {
    id: 'dummy-2',
    author: 'Kagiriの楽しみ方',
    time: '只今',
    text: '【Kagiriの使い方】\n\n1. 「投稿ボタン」から、いまの気分や写真を投稿してみましょう。\n2. 素敵な投稿を見つけたら、星ボタンを押して「お気に入り」に追加できます（右下「お気に入り」タブで一覧表示されます）。\n3. 吹き出しボタンを押すと、投稿へ「返信（コメント）」して対話を楽しめます。\n4. 「シャッフル」タブで、誰かの言葉との一期一会の出会いも楽しめます。',
    images: [],
    likes: 1,
    comments: [
      {
        id: 'c1',
        author: 'Kagiriの使い方',
        text: '【返信（コメント）の見え方】\n\nこのように、投稿の下部にある「吹き出しボタン」を押すと、みんなからの返信が一覧で開いて読むことができます。あなたもこの投稿の枠内から返信を書いて練習してみてくださいね！',
        time: '只今'
      }
    ]
  },
  {
    id: 'dummy-3',
    author: 'Kagiriのルール',
    time: '只今',
    text: '【すべてが消えるルール】\n\nニックネームを含め、あなたの投稿、お気に入り登録、返信（コメント）などのすべての履歴は、毎晩深夜0時に完全に消去されます。ログも一切残りません。\n\n【非表示機能】\n\n見たくない投稿がある場合は、投稿カードの右上にある「非表示ボタン（目のスラッシュマーク）」を押すと、あなたの画面からその投稿を消すことができます。',
    images: [],
    likes: 2,
    comments: []
  }
];

let posts = [...DEFAULT_POSTS];

// ==================== 深夜0時の自動データ消滅タイマー ====================
// 30秒ごとに時間を監視し、0時0分になったらインメモリの投稿データを消去
let lastClearedDate = new Date().getDate();

setInterval(() => {
  const now = new Date();
  const currentDate = now.getDate();

  // 日付が変わったタイミングでリセット
  if (currentDate !== lastClearedDate && now.getHours() === 0 && now.getMinutes() === 0) {
    console.log('深夜0時を迎えました。すべてのインメモリ投稿をリセットします。');
    posts = [...DEFAULT_POSTS];
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
  posts = [...DEFAULT_POSTS];
  console.log('APIトリガーにより投稿データが消滅し、初期ガイド投稿がセットされました。');
  res.json({ success: true, message: 'サーバー上の投稿を全て消滅させ、ガイドをセットしました。' });
});

// ビルドされた静的ファイル（distフォルダ）を配信する
app.use(express.static(path.join(__dirname, 'dist')));

// API以外のすべてのリクエストに対して、ビルドされたHTMLを返す
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
