const express = require('express');
const db = require('../db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get feed (all posts, newest first)
router.get('/feed', optionalAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const posts = db.prepare(`
    SELECT
      p.*,
      u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  // If user is logged in, check which posts they've liked
  if (req.user) {
    const postIds = posts.map(p => p.id);
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(',');
      const liked = db.prepare(
        `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${placeholders})`
      ).all(req.user.id, ...postIds);
      const likedSet = new Set(liked.map(l => l.post_id));
      posts.forEach(p => { p.liked_by_me = likedSet.has(p.id); });
    }
  }

  const total = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;

  res.json({ posts, page, limit, total, total_pages: Math.ceil(total / limit) });
});

// Get following feed
router.get('/following', authenticateToken, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const posts = db.prepare(`
    SELECT
      p.*,
      u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, limit, offset);

  const postIds = posts.map(p => p.id);
  if (postIds.length > 0) {
    const placeholders = postIds.map(() => '?').join(',');
    const liked = db.prepare(
      `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${placeholders})`
    ).all(req.user.id, ...postIds);
    const likedSet = new Set(liked.map(l => l.post_id));
    posts.forEach(p => { p.liked_by_me = likedSet.has(p.id); });
  }

  res.json({ posts, page, limit });
});

// Create a post (share a link)
router.post('/', authenticateToken, (req, res) => {
  const { url, title, description, image_url, comment } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const result = db.prepare(
    'INSERT INTO posts (user_id, url, title, description, image_url, comment) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, url, title || '', description || '', image_url || '', comment || '');

  const post = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar_url
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(result.lastInsertRowid);

  post.like_count = 0;
  post.comment_count = 0;
  post.liked_by_me = false;

  res.status(201).json(post);
});

// Get single post
router.get('/:id', optionalAuth, (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  if (req.user) {
    const like = db.prepare('SELECT id FROM likes WHERE user_id = ? AND post_id = ?').get(req.user.id, post.id);
    post.liked_by_me = !!like;
  }

  res.json(post);
});

// Delete a post
router.delete('/:id', authenticateToken, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Post deleted' });
});

// Like a post
router.post('/:id/like', authenticateToken, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  try {
    db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').run(req.user.id, req.params.id);
  } catch {
    // Already liked, ignore
  }

  const count = db.prepare('SELECT COUNT(*) as count FROM likes WHERE post_id = ?').get(req.params.id).count;
  res.json({ liked: true, like_count: count });
});

// Unlike a post
router.delete('/:id/like', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.user.id, req.params.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM likes WHERE post_id = ?').get(req.params.id).count;
  res.json({ liked: false, like_count: count });
});

// Get comments for a post
router.get('/:id/comments', (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar_url
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  res.json(comments);
});

// Add a comment
router.post('/:id/comments', authenticateToken, (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'Comment body is required' });
  }

  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const result = db.prepare('INSERT INTO comments (user_id, post_id, body) VALUES (?, ?, ?)').run(
    req.user.id, req.params.id, body.trim()
  );

  const comment = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar_url
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(comment);
});

// Delete a comment
router.delete('/:id/comments/:commentId', authenticateToken, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  if (comment.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.commentId);
  res.json({ message: 'Comment deleted' });
});

module.exports = router;
