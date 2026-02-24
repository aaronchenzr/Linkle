const express = require('express');
const db = require('../db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get user profile
router.get('/:username', optionalAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, display_name, bio, avatar_url, created_at FROM users WHERE username = ?'
  ).get(req.params.username);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.post_count = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(user.id).count;
  user.follower_count = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(user.id).count;
  user.following_count = db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(user.id).count;

  if (req.user) {
    const follow = db.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, user.id);
    user.followed_by_me = !!follow;
  }

  res.json(user);
});

// Get user's posts
router.get('/:username/posts', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const posts = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(user.id, limit, offset);

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

  res.json({ posts, page, limit });
});

// Follow a user
router.post('/:username/follow', authenticateToken, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }

  try {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, target.id);
  } catch {
    // Already following
  }

  const count = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(target.id).count;
  res.json({ following: true, follower_count: count });
});

// Unfollow a user
router.delete('/:username/follow', authenticateToken, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, target.id);

  const count = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(target.id).count;
  res.json({ following: false, follower_count: count });
});

module.exports = router;
