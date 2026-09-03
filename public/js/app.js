// Shared helpers used by every dashboard page.

const Auth = {
  save(token, user) {
    localStorage.setItem('rp_token', token);
    localStorage.setItem('rp_user', JSON.stringify(user));
  },
  token() { return localStorage.getItem('rp_token'); },
  user() {
    try { return JSON.parse(localStorage.getItem('rp_user')); } catch (e) { return null; }
  },
  logout() {
    localStorage.removeItem('rp_token');
    localStorage.removeItem('rp_user');
    window.location.href = '/index.html';
  },
  requireRole(roles) {
    const u = Auth.user();
    if (!u || !roles.includes(u.role)) {
      window.location.href = '/index.html';
      return null;
    }
    return u;
  }
};

const Api = {
  async call(method, path, body) {
    const res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(Auth.token() ? { Authorization: 'Bearer ' + Auth.token() } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  get(path) { return this.call('GET', path); },
  post(path, body) { return this.call('POST', path, body); },
  patch(path, body) { return this.call('PATCH', path, body); },
  del(path) { return this.call('DELETE', path); }
};

function toast(message) {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function connectSocket(branchId) {
  const socket = io();
  socket.on('connect', () => socket.emit('join', { branchId }));
  return socket;
}

function money(n) { return '₹' + Number(n || 0).toFixed(0); }

function statusLabel(s) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

function getPageAssistantContext() {
  const path = window.location.pathname;
  const user = Auth.user();
  const role = user && user.role ? user.role : null;
  const activeTab = document.querySelector('.tab.active');
  const tabLabel = activeTab ? activeTab.textContent.trim() : '';

  const pageMap = {
    '/index.html': {
      pageLabel: 'sign-in and access',
      scope: 'sign-in, demo accounts, and restaurant registration',
      suggestions: ['How do I sign in?', 'How do I register a restaurant?', 'Which demo accounts are available?']
    },
    '/register-restaurant.html': {
      pageLabel: 'restaurant registration',
      scope: 'restaurant setup and approval flow',
      suggestions: ['How do I submit my restaurant?', 'What happens after registration?', 'How do I sign in once approved?']
    },
    '/customer.html': {
      pageLabel: 'customer ordering',
      scope: 'restaurant discovery, menu browsing, placing orders, reservations, favorites, and reviews',
      suggestions: ['How do I place an order?', 'How do I reserve a table?', 'How do I save a favorite restaurant?']
    },
    '/waiter.html': {
      pageLabel: 'waiter operations',
      scope: 'table status, take-away tickets, guest requests, orders, reservations, and billing',
      suggestions: ['How do I open a table panel?', 'What should I do for a bill request?', 'How do I mark take-away as picked up?']
    },
    '/chef.html': {
      pageLabel: 'kitchen operations',
      scope: 'order acceptance, readiness, low-stock alerts, and kitchen submissions',
      suggestions: ['How do I accept a new order?', 'How do I mark an order ready?', 'How do I flag low stock?']
    },
    '/inventory.html': {
      pageLabel: 'inventory management',
      scope: 'stock levels, low-stock alerts, stock movement, and supplier orders',
      suggestions: ['How do I restock an item?', 'How do I view low-stock alerts?', 'How do I send an order to a supplier?']
    },
    '/subadmin.html': {
      pageLabel: 'sub-admin oversight',
      scope: 'live operations, approvals, menu control, inventory, staff, and attendance',
      suggestions: ['How do I approve a menu item?', 'How do I review live orders?', 'How do I manage staff access?']
    },
    '/admin.html': {
      pageLabel: 'admin dashboard',
      scope: 'revenue, menu control, branches, coupons, staff, and platform management',
      suggestions: ['How do I review revenue?', 'How do I manage menu items?', 'How do I manage staff or coupons?']
    }
  };

  const base = pageMap[path] || {
    pageLabel: 'this application',
    scope: 'the current page and its available actions',
    suggestions: ['What can I do here?', 'Show me the main actions on this page.', 'How do I start using this screen?']
  };

  return { ...base, role, tabLabel, path };
}

async function getAssistantLivePayload(context) {
  const source = window.__getAssistantLiveData;
  if (typeof source !== 'function') return null;
  try { return await source(); } catch (e) { return { error: e.message }; }
}

function formatItemList(items) {
  if (!items || !items.length) return 'No live data yet.';
  return items.map((item, index) => `${index + 1}. ${item.name}${item.qty !== undefined ? ` (${item.qty} sold)` : ''}${item.value !== undefined ? ` — ${money(item.value)}` : ''}`).join('\n');
}

async function buildAssistantReply(message, context) {
  const q = (message || '').toLowerCase();
  const scopeHint = `I’m scoped to ${context.pageLabel} on this page, so I’ll focus on ${context.scope}.`;
  const payload = await getAssistantLivePayload(context);

  if (q.includes('what can you do') || q.includes('help')) {
    return `${scopeHint}\nTry one of the quick actions below or ask about a specific task.`;
  }

  if (context.path === '/customer.html') {
    if ((q.includes('popular') || q.includes('frequently') || q.includes('top selling') || q.includes('best seller') || q.includes('most ordered')) && payload?.popularItems?.length) {
      return `At ${payload.restaurantName || 'this restaurant'}, the most ordered items right now are:\n${formatItemList(payload.popularItems)}`;
    }
    if (q.includes('order') || q.includes('menu')) {
      return `You’re on the customer ordering view. The live menu is available for ${payload?.restaurantName || 'the selected restaurant'}, and you can add items to the cart from the Menu tab.`;
    }
    if (q.includes('reserve') || q.includes('table')) {
      return 'Use the Reserve a Table tab to select a date and time, then confirm the booking for the restaurant.';
    }
    if (q.includes('favorite') || q.includes('review')) {
      return `You currently have ${payload?.favoritesCount ?? 0} saved favorites and ${payload?.reviewCount ?? 0} reviews in your account profile.`;
    }
    return `${scopeHint}\nFor example: ask for the most ordered items, place an order, reserve a table, or browse favorites.`;
  }

  if (context.path === '/waiter.html') {
    if ((q.includes('table') && (q.includes('need') || q.includes('attention') || q.includes('request'))) || q.includes('requests')) {
      return `Right now there are ${payload?.requestCount ?? 0} table requests, ${payload?.activeOrders ?? 0} active orders, and ${payload?.readyTakeaway ?? 0} ready take-away orders to handle.`;
    }
    if (q.includes('bill') || q.includes('payment')) {
      return 'Open the table panel and use the payment actions there to collect cash, UPI, or card payments. The bill request is also highlighted on the table tile.';
    }
    if (q.includes('take') || q.includes('pickup')) {
      return `There are ${payload?.readyTakeaway ?? 0} take-away orders ready for pickup in the current view.`;
    }
    return `${scopeHint}\nFor example: review table requests, take-away pickups, or bill requests.`;
  }

  if (context.path === '/chef.html') {
    if ((q.includes('order') && (q.includes('need') || q.includes('attention') || q.includes('pending'))) || q.includes('pending')) {
      return `There are ${payload?.pendingOrders ?? 0} orders that need kitchen attention and ${payload?.lowStockCount ?? 0} ingredients below the low-stock threshold.`;
    }
    if (q.includes('accept') || q.includes('new order')) {
      return 'In the Kitchen Display, review the New — needs accept column and use Accept to move the order forward.';
    }
    if (q.includes('ready') || q.includes('prepare')) {
      return 'Advance orders through the columns from Accepted to Preparing and finally Ready when the dish is done.';
    }
    return `${scopeHint}\nFor example: review pending orders, mark them ready, or check low-stock items.`;
  }

  if (context.path === '/inventory.html') {
    if (q.includes('low stock') || q.includes('alert')) {
      return `The current low-stock items are:\n${payload?.lowStockItems ? formatItemList(payload.lowStockItems) : 'No low-stock items reported.'}`;
    }
    if (q.includes('restock') || q.includes('stock in')) {
      return 'Open Current Stock, pick the ingredient, and use Stock in to record the delivery or adjustment.';
    }
    if (q.includes('supplier')) {
      return `You currently have ${payload?.supplierCount ?? 0} suppliers configured for this branch, and you can send purchase orders from the ingredient details view.`;
    }
    return `${scopeHint}\nFor example: review low-stock alerts, restock items, or place supplier orders.`;
  }

  if (context.path === '/subadmin.html') {
    if (q.includes('live') || q.includes('orders')) {
      return `Live operations currently show ${payload?.activeOrders ?? 0} active orders, ${payload?.occupiedTables ?? 0} occupied tables, and ${payload?.pendingApprovals ?? 0} items pending approval.`;
    }
    if (q.includes('approve') || q.includes('approval')) {
      return 'Open the Menu Approvals tab to review chef submissions and approve or reject them before they go live.';
    }
    if (q.includes('staff')) {
      return 'Use the Staff tab to add or enable team members for the branch and manage access quickly.';
    }
    return `${scopeHint}\nFor example: review live ops, approve menu items, or manage staff.`;
  }

  if (context.path === '/admin.html') {
    if (q.includes('revenue') || q.includes('sales') || q.includes('report')) {
      const summary = payload?.summary;
      if (summary) {
        return `This branch has ${money(summary.revenue.today)} in revenue today, ${money(summary.revenue.week)} this week, and ${money(summary.revenue.month)} this month. The most sold items are: ${summary.topItems.slice(0, 3).map(i => `${i.name} (${i.qty})`).join(', ') || 'not available yet.'}`;
      }
      return 'Open the Revenue & Reports tab to review daily, weekly, monthly, and yearly sales performance.';
    }
    if (q.includes('coupon') || q.includes('offer')) {
      return `You currently have ${payload?.couponCount ?? 0} active coupon offers configured for this restaurant.`;
    }
    return `${scopeHint}\nFor example: review revenue, manage menu items, or handle staff and branches.`;
  }

  if (context.path === '/index.html' || context.path === '/register-restaurant.html') {
    if (q.includes('sign') || q.includes('login')) {
      return 'Use the sign-in page to choose a demo account or enter your credentials. Once approved, you can open the role-specific dashboard.';
    }
    if (q.includes('register')) {
      return 'On the registration page, fill in your restaurant details, operating hours, and admin contact details to submit the request.';
    }
    return `${scopeHint}\nFor example: sign in, register a restaurant, or review the approval flow.`;
  }

  if (q.includes('inventory') || q.includes('staff') || q.includes('menu') || q.includes('approval') || q.includes('order')) {
    return `That sounds like a different workflow from this page. ${scopeHint}`;
  }

  return `${scopeHint}\nI can help with the current page tasks and can guide you through the next action.`;
}

async function getAssistantAiReply(message, context) {
  try {
    const payload = await getAssistantLivePayload(context);
    const res = await fetch('/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context, payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Assistant request failed');
    return data.reply || '';
  } catch (e) {
    return '';
  }
}

function createAssistantWidget() {
  if (document.getElementById('assistant-root')) return;

  const context = getPageAssistantContext();
  const root = document.createElement('div');
  root.id = 'assistant-root';
  root.innerHTML = `
    <button id="assistant-fab" class="assistant-fab" type="button" aria-label="Open page assistant">💬</button>
    <div id="assistant-panel" class="assistant-panel" role="dialog" aria-label="Page assistant">
      <div class="assistant-header">
        <div>
          <div class="assistant-title">Page Assistant</div>
          <div class="assistant-subtitle">${context.pageLabel}</div>
        </div>
        <button id="assistant-close" class="assistant-close" type="button" aria-label="Close assistant">✕</button>
      </div>
      <div class="assistant-body">
        <div class="assistant-banner">I stay focused on this page so I can give relevant help without mixing in other workflows.</div>
        <div id="assistant-messages" class="assistant-messages"></div>
        <div class="assistant-suggestions"></div>
        <div class="assistant-input-row">
          <input id="assistant-input" class="assistant-input" type="text" placeholder="Ask about this page..." />
          <button id="assistant-send" class="btn btn-primary btn-sm" type="button">Send</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const messagesEl = document.getElementById('assistant-messages');
  const suggestionsEl = document.querySelector('.assistant-suggestions');
  const inputEl = document.getElementById('assistant-input');
  const sendBtn = document.getElementById('assistant-send');
  const panel = document.getElementById('assistant-panel');
  const fab = document.getElementById('assistant-fab');
  const closeBtn = document.getElementById('assistant-close');

  const state = { context, history: [] };
  const addMessage = (text, isUser) => {
    const bubble = document.createElement('div');
    bubble.className = `assistant-bubble ${isUser ? 'assistant-bubble-user' : 'assistant-bubble-bot'}`;
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const renderSuggestions = () => {
    suggestionsEl.innerHTML = context.suggestions.map(item => `<button class="assistant-chip" type="button">${item}</button>`).join('');
    suggestionsEl.querySelectorAll('.assistant-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        inputEl.value = btn.textContent;
        sendBtn.click();
      });
    });
  };

  const send = async () => {
    const value = inputEl.value.trim();
    if (!value) return;
    addMessage(value, true);
    inputEl.value = '';
    const aiReply = await getAssistantAiReply(value, context);
    const reply = aiReply || (await buildAssistantReply(value, context));
    addMessage(reply, false);
  };

  const openPanel = () => {
    panel.classList.add('open');
    if (!state.history.length) {
      addMessage(`Hello! I can help with ${context.pageLabel}.`, false);
      state.history.push('welcome');
    }
    inputEl.focus();
  };

  const closePanel = () => panel.classList.remove('open');

  fab.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  sendBtn.addEventListener('click', () => { send(); });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  });

  renderSuggestions();
}

function initPageAssistant() {
  createAssistantWidget();
}

initPageAssistant();

function renderTopbar(roleLabel) {
  const u = Auth.user();
  return `
  <div class="topbar">
    <div class="brand"><span class="dot"></span> The Copper Fork <span class="role-pill">${roleLabel}</span></div>
    <div class="actions">
      <span id="attendanceWidget"></span>
      <span class="muted" style="color:var(--cream);opacity:0.85">${u ? u.name : ''}</span>
      <button class="btn-ghost" onclick="Auth.logout()">Log out</button>
    </div>
  </div>`;
}

// Shared shift clock-in/out, usable from any staff dashboard (waiter, chef, sub-admin, inventory manager).
// Renders into the #attendanceWidget span that renderTopbar() leaves in the topbar.
async function mountAttendanceWidget(branchId) {
  const el = document.getElementById('attendanceWidget');
  if (!el) return;
  async function refresh() {
    try {
      const status = await Api.get(`/attendance/${branchId}/me`);
      if (status.open) {
        const since = new Date(status.open.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        el.innerHTML = `<span class="muted" style="color:var(--cream);opacity:0.85">On shift since ${since}</span>
          <button class="btn-ghost" onclick="attendanceClockOut('${branchId}')">Clock out</button>`;
      } else {
        el.innerHTML = `<button class="btn-ghost" onclick="attendanceClockIn('${branchId}')">Clock in</button>`;
      }
    } catch (e) { /* attendance not available for this role — leave widget empty */ }
  }
  window._attendanceRefresh = refresh;
  await refresh();
}
async function attendanceClockIn(branchId) {
  try { await Api.post(`/attendance/${branchId}/clock-in`, {}); toast('Clocked in'); await window._attendanceRefresh(); }
  catch (e) { toast(e.message); }
}
async function attendanceClockOut(branchId) {
  try { await Api.patch(`/attendance/${branchId}/clock-out`, {}); toast('Clocked out'); await window._attendanceRefresh(); }
  catch (e) { toast(e.message); }
}
