// ---- State ----
let currentUser = null;
let token = null;
let currentPage = 'feed';
let feedPage = 1;
let feedTotal = 0;

// ---- Init ----
(function init() {
  const saved = localStorage.getItem('linkle_auth');
  if (saved) {
    const parsed = JSON.parse(saved);
    token = parsed.token;
    currentUser = parsed.user;
    updateAuthUI();
  }
  navigate('feed');
})();

// ---- API Helpers ----
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---- Auth ----
function updateAuthUI() {
  const authBtns = document.getElementById('auth-buttons');
  const userMenu = document.getElementById('user-menu');
  const navFollowing = document.getElementById('nav-following');

  if (currentUser) {
    authBtns.style.display = 'none';
    userMenu.style.display = 'flex';
    navFollowing.style.display = '';
    document.getElementById('user-menu-btn').textContent = currentUser.display_name || currentUser.username;
  } else {
    authBtns.style.display = 'flex';
    userMenu.style.display = 'none';
    navFollowing.style.display = 'none';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value
      })
    });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('linkle_auth', JSON.stringify({ token, user: currentUser }));
    updateAuthUI();
    closeModal();
    navigate(currentPage);
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('register-username').value,
        email: document.getElementById('register-email').value,
        display_name: document.getElementById('register-displayname').value,
        password: document.getElementById('register-password').value
      })
    });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('linkle_auth', JSON.stringify({ token, user: currentUser }));
    updateAuthUI();
    closeModal();
    navigate('feed');
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('linkle_auth');
  updateAuthUI();
  closeUserDropdown();
  navigate('feed');
}

// ---- Navigation ----
function navigate(page, data) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (navLink) navLink.classList.add('active');

  switch (page) {
    case 'feed': loadFeed(); break;
    case 'following': loadFollowingFeed(); break;
    case 'profile': loadProfile(data); break;
    case 'post': loadPostDetail(data); break;
  }
}

// ---- Feed ----
async function loadFeed(append = false) {
  if (!append) { feedPage = 1; }
  try {
    const data = await api(`/posts/feed?page=${feedPage}&limit=20`);
    const container = document.getElementById('feed-container');
    const empty = document.getElementById('feed-empty');
    const loadMore = document.getElementById('load-more-container');

    if (!append) container.innerHTML = '';

    if (data.posts.length === 0 && !append) {
      empty.style.display = 'block';
      loadMore.style.display = 'none';
    } else {
      empty.style.display = 'none';
      data.posts.forEach(post => container.appendChild(createPostCard(post)));
      feedTotal = data.total;
      loadMore.style.display = feedPage < data.total_pages ? 'block' : 'none';
    }
  } catch (err) {
    console.error('Failed to load feed:', err);
  }
}

function loadMorePosts() {
  feedPage++;
  loadFeed(true);
}

async function loadFollowingFeed() {
  if (!currentUser) return;
  try {
    const data = await api('/posts/following');
    const container = document.getElementById('following-container');
    const empty = document.getElementById('following-empty');
    container.innerHTML = '';

    if (data.posts.length === 0) {
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      data.posts.forEach(post => container.appendChild(createPostCard(post)));
    }
  } catch (err) {
    console.error('Failed to load following feed:', err);
  }
}

// ---- Post Card ----
function createPostCard(post) {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = `post-${post.id}`;

  const initial = (post.display_name || post.username || '?')[0].toUpperCase();
  const timeAgo = formatTimeAgo(post.created_at);
  let domain = '';
  try { domain = new URL(post.url).hostname.replace('www.', ''); } catch {}

  let imageHTML = '';
  if (post.image_url) {
    imageHTML = `<img class="card-link-image" src="${escapeHtml(post.image_url)}" alt="" onerror="this.style.display='none'">`;
  }

  let commentHTML = '';
  if (post.comment) {
    commentHTML = `<div class="card-comment">${escapeHtml(post.comment)}</div>`;
  }

  const liked = post.liked_by_me ? 'liked' : '';

  let deleteBtn = '';
  if (currentUser && currentUser.id === post.user_id) {
    deleteBtn = `<button class="action-btn card-delete" onclick="deletePost(${post.id})" title="Delete">&#128465;</button>`;
  }

  card.innerHTML = `
    <div class="card-header">
      <div class="avatar">${initial}</div>
      <div class="card-user-info">
        <a class="card-displayname" href="#" onclick="navigate('profile', '${escapeHtml(post.username)}')">${escapeHtml(post.display_name || post.username)}</a>
        <div class="card-username">@${escapeHtml(post.username)}</div>
      </div>
      <span class="card-time">${timeAgo}</span>
    </div>
    ${commentHTML}
    <a class="card-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">
      ${imageHTML}
      <div class="card-link-info">
        <div class="card-link-title">${escapeHtml(post.title || post.url)}</div>
        ${post.description ? `<div class="card-link-desc">${escapeHtml(post.description)}</div>` : ''}
        <span class="card-link-url">${escapeHtml(domain)}</span>
      </div>
    </a>
    <div class="card-actions">
      <button class="action-btn ${liked}" onclick="toggleLike(${post.id})" id="like-btn-${post.id}">
        ${post.liked_by_me ? '&#9829;' : '&#9825;'} <span id="like-count-${post.id}">${post.like_count || 0}</span>
      </button>
      <button class="action-btn" onclick="navigate('post', ${post.id})">
        &#128172; <span>${post.comment_count || 0}</span>
      </button>
      ${deleteBtn}
    </div>
  `;

  return card;
}

// ---- Like ----
async function toggleLike(postId) {
  if (!currentUser) { showModal('login'); return; }
  const btn = document.getElementById(`like-btn-${postId}`);
  const isLiked = btn.classList.contains('liked');

  try {
    const data = await api(`/posts/${postId}/like`, {
      method: isLiked ? 'DELETE' : 'POST'
    });

    if (data.liked) {
      btn.classList.add('liked');
      btn.innerHTML = `&#9829; <span id="like-count-${postId}">${data.like_count}</span>`;
    } else {
      btn.classList.remove('liked');
      btn.innerHTML = `&#9825; <span id="like-count-${postId}">${data.like_count}</span>`;
    }
  } catch (err) {
    console.error('Failed to toggle like:', err);
  }
}

// ---- New Post ----
async function handleNewPost(e) {
  e.preventDefault();
  const errEl = document.getElementById('post-error');
  errEl.textContent = '';

  try {
    await api('/posts', {
      method: 'POST',
      body: JSON.stringify({
        url: document.getElementById('post-url').value,
        title: document.getElementById('post-title').value,
        description: document.getElementById('post-description').value,
        comment: document.getElementById('post-comment').value
      })
    });
    closeModal();
    document.getElementById('post-url').value = '';
    document.getElementById('post-title').value = '';
    document.getElementById('post-description').value = '';
    document.getElementById('post-comment').value = '';
    navigate('feed');
  } catch (err) {
    errEl.textContent = err.message;
  }
}

// ---- Delete Post ----
async function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  try {
    await api(`/posts/${postId}`, { method: 'DELETE' });
    const el = document.getElementById(`post-${postId}`);
    if (el) el.remove();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Post Detail + Comments ----
async function loadPostDetail(postId) {
  try {
    const post = await api(`/posts/${postId}`);
    const detail = document.getElementById('post-detail');
    const card = createPostCard(post);
    detail.innerHTML = '';
    detail.appendChild(card);

    await loadComments(postId);
  } catch (err) {
    console.error('Failed to load post:', err);
  }
}

async function loadComments(postId) {
  const section = document.getElementById('comments-section');
  try {
    const comments = await api(`/posts/${postId}/comments`);

    let formHTML = '';
    if (currentUser) {
      formHTML = `
        <form class="comment-form" onsubmit="addComment(event, ${postId})">
          <input type="text" id="comment-input" placeholder="Write a comment..." required>
          <button class="btn btn-primary btn-sm" type="submit">Post</button>
        </form>
      `;
    }

    const commentsHTML = comments.map(c => {
      const initial = (c.display_name || c.username || '?')[0].toUpperCase();
      return `
        <div class="comment-item">
          <div class="avatar" style="width:28px;height:28px;font-size:0.7rem">${initial}</div>
          <div class="comment-body">
            <div class="comment-meta">
              <strong><a href="#" onclick="navigate('profile', '${escapeHtml(c.username)}')">${escapeHtml(c.display_name || c.username)}</a></strong>
              &middot; ${formatTimeAgo(c.created_at)}
            </div>
            <div class="comment-text">${escapeHtml(c.body)}</div>
          </div>
        </div>
      `;
    }).join('');

    section.innerHTML = `
      <div class="comments-title">Comments (${comments.length})</div>
      ${formHTML}
      ${commentsHTML || '<p style="color:var(--text-secondary);font-size:0.9rem">No comments yet.</p>'}
    `;
  } catch (err) {
    section.innerHTML = '<p>Failed to load comments.</p>';
  }
}

async function addComment(e, postId) {
  e.preventDefault();
  const input = document.getElementById('comment-input');
  const body = input.value.trim();
  if (!body) return;

  try {
    await api(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
    input.value = '';
    await loadComments(postId);
  } catch (err) {
    alert(err.message);
  }
}

// ---- Profile ----
async function loadProfile(username) {
  try {
    const user = await api(`/users/${username}`);
    const header = document.getElementById('profile-header');
    const initial = (user.display_name || user.username || '?')[0].toUpperCase();

    let followBtn = '';
    if (currentUser && currentUser.id !== user.id) {
      if (user.followed_by_me) {
        followBtn = `<button class="btn btn-outline btn-sm" onclick="toggleFollow('${escapeHtml(user.username)}', false)" id="follow-btn">Unfollow</button>`;
      } else {
        followBtn = `<button class="btn btn-primary btn-sm" onclick="toggleFollow('${escapeHtml(user.username)}', true)" id="follow-btn">Follow</button>`;
      }
    }

    header.innerHTML = `
      <div class="profile-avatar">${initial}</div>
      <div class="profile-displayname">${escapeHtml(user.display_name || user.username)}</div>
      <div class="profile-username">@${escapeHtml(user.username)}</div>
      ${user.bio ? `<div class="profile-bio">${escapeHtml(user.bio)}</div>` : ''}
      <div class="profile-stats">
        <div class="profile-stat"><div class="profile-stat-num">${user.post_count}</div><div class="profile-stat-label">Posts</div></div>
        <div class="profile-stat"><div class="profile-stat-num" id="follower-count">${user.follower_count}</div><div class="profile-stat-label">Followers</div></div>
        <div class="profile-stat"><div class="profile-stat-num">${user.following_count}</div><div class="profile-stat-label">Following</div></div>
      </div>
      ${followBtn}
    `;

    const data = await api(`/users/${username}/posts`);
    const postsContainer = document.getElementById('profile-posts');
    postsContainer.innerHTML = '';
    data.posts.forEach(post => postsContainer.appendChild(createPostCard(post)));

  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

function viewMyProfile() {
  if (currentUser) {
    closeUserDropdown();
    navigate('profile', currentUser.username);
  }
}

async function toggleFollow(username, follow) {
  if (!currentUser) { showModal('login'); return; }
  try {
    const data = await api(`/users/${username}/follow`, {
      method: follow ? 'POST' : 'DELETE'
    });
    const btn = document.getElementById('follow-btn');
    const countEl = document.getElementById('follower-count');
    if (data.following) {
      btn.className = 'btn btn-outline btn-sm';
      btn.textContent = 'Unfollow';
      btn.setAttribute('onclick', `toggleFollow('${username}', false)`);
    } else {
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = 'Follow';
      btn.setAttribute('onclick', `toggleFollow('${username}', true)`);
    }
    if (countEl) countEl.textContent = data.follower_count;
  } catch (err) {
    console.error('Failed to toggle follow:', err);
  }
}

// ---- Modals ----
function showModal(type) {
  document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
  document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
  document.getElementById(`modal-${type}`).style.display = 'block';
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ---- User Dropdown ----
function toggleUserDropdown() {
  document.getElementById('user-dropdown').classList.toggle('open');
}

function closeUserDropdown() {
  document.getElementById('user-dropdown').classList.remove('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#user-menu')) closeUserDropdown();
});

// ---- Helpers ----
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
  const diffMs = now - date;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
