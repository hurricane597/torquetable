/* All business rules live here: ordering window, radius, minimum order, stock, statuses. The UI only asks and renders.
   With a backend configured (js/config.js) the menu, settings and orders live in the shared database and the same rules
   are enforced there; without one (or with ?demo in the address) everything stays on this device as a demo. */
const Store = (() => {
  const W = typeof window !== 'undefined' ? window : {};
  const cfg = W.TT_BACKEND;
  const remote = !!(cfg && cfg.url && cfg.key && W.supabase && !/[?&]demo\b/.test(W.location ? W.location.search : ''));
  const db = remote ? W.supabase.createClient(cfg.url, cfg.key) : null;
  const KEY = remote ? 'torquetable.live.v1' : 'torquetable.mealprep.v2';
  let state;
  const subs = [];
  const live = { signedIn: false, isChef: false, email: '', counts: {}, error: null, loaded: !remote, onNewOrder: null };

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    if (!state || !state.settings) { state = buildSeed(); if (remote) { state.orders = []; state.messages = []; state.seededDemo = true; } }
    if (!state.tokens) state.tokens = {};
    if (!remote && !state.seededDemo) seedDemoOrders();
    save(true);
  }
  function save(silent) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (!silent) subs.forEach(f => f());
  }
  function reset() { if (remote) return; state = buildSeed(); state.tokens = {}; seedDemoOrders(); save(); }

  /* ---- Ordering window ----
     Orders close at the weekly cutoff and stay closed until that week's last delivery day is over. */
  function cycle(now = new Date()) {
    const s = state.settings;
    const [h, m] = s.cutoffTime.split(':').map(Number);
    const prev = new Date(now); prev.setHours(h, m, 0, 0);
    prev.setDate(prev.getDate() - ((prev.getDay() - s.cutoffDay + 7) % 7));
    if (prev > now) prev.setDate(prev.getDate() - 7);
    const deliveriesAfter = c => s.deliveryDays.map(d => {
      const x = new Date(c); x.setHours(0, 0, 0, 0);
      x.setDate(x.getDate() + (((d - x.getDay() + 7) % 7) || 7));
      return x;
    }).sort((a, b) => a - b);
    const prevDates = deliveriesAfter(prev);
    const lastEnd = new Date(prevDates[prevDates.length - 1] || prev); lastEnd.setHours(23, 59, 59, 999);
    const next = new Date(prev); next.setDate(next.getDate() + 7);
    const closedNow = now <= lastEnd && now >= prev;
    if (closedNow || s.forceClosed) {
      const reopens = new Date(lastEnd.getTime() + 1);
      return { open: false, reopens: closedNow ? reopens : null, cutoff: next, dates: deliveriesAfter(next).map(iso) };
    }
    return { open: true, cutoff: next, dates: deliveriesAfter(next).map(iso) };
  }

  /* ---- Menu ---- */
  const meal = id => state.meals.find(m => m.id === id);
  const publishedMeals = () => state.meals.filter(m => m.published);
  function mealIssues(m) {
    const miss = [];
    if (!String(m.name || '').trim()) miss.push('name');
    if (!String(m.desc || '').trim()) miss.push('description');
    if (!(Number(m.price) > 0)) miss.push('price');
    if (!String(m.portion || '').trim()) miss.push('portion');
    if (!String(m.ingredients || '').trim()) miss.push('ingredients');
    if (!String(m.allergens || '').trim()) miss.push('allergens (write "None" if there are none)');
    if (!String(m.reheat || '').trim()) miss.push('reheating instructions');
    return miss;
  }
  const cleanMeal = data => ({
    name: data.name.trim(), tag: data.tag.trim(), desc: data.desc.trim(), price: Math.max(0, Number(data.price) || 0),
    portion: data.portion.trim(), ingredients: data.ingredients.trim(), allergens: data.allergens.trim(), reheat: data.reheat.trim(),
    left: Math.max(0, Math.floor(Number(data.left) || 0)),
  });
  const mealRow = m => ({ name: m.name, price: m.price, left_count: m.left, published: !!m.published,
    details: { tag: m.tag, desc: m.desc, portion: m.portion, ingredients: m.ingredients, allergens: m.allergens, reheat: m.reheat } });

  async function saveMeal(data) {
    const existing = data.id && meal(data.id);
    const m = { ...(existing || { published: false }), ...cleanMeal(data) };
    if (m.published && mealIssues(m).length) m.published = false;
    if (remote) {
      const q = existing ? db.from('meals').update(mealRow(m)).eq('id', existing.id) : db.from('meals').insert({ ...mealRow(m), sort: state.meals.length + 1 });
      const { error } = await q; if (error) return { error: explain(error) };
      await refreshPublic(); return { ok: true };
    }
    if (existing) Object.assign(existing, m); else state.meals.push({ id: 'm' + state.nextMeal++, ...m });
    save();
    return { ok: true };
  }
  async function setPublished(id, on) {
    const m = meal(id); if (!m) return { error: 'Meal not found.' };
    if (on) { const miss = mealIssues(m); if (miss.length) return { error: `Can't publish yet. Missing: ${miss.join(', ')}.` }; }
    if (remote) {
      const { error } = await db.from('meals').update({ published: !!on }).eq('id', id); if (error) return { error: explain(error) };
      await refreshPublic(); return { ok: true };
    }
    m.published = !!on; save();
    return { ok: true };
  }
  async function setLeft(id, n) {
    const m = meal(id); if (!m) return { error: 'Meal not found.' };
    n = Math.max(0, Math.floor(n) || 0);
    m.left = n; save();
    if (remote) { const { error } = await db.from('meals').update({ left_count: n }).eq('id', id); if (error) { await refreshPublic(); return { error: explain(error) }; } }
    return { ok: true };
  }
  async function deleteMeal(id) {
    if (remote) { const { error } = await db.from('meals').delete().eq('id', id); if (error) return { error: explain(error) }; }
    state.meals = state.meals.filter(m => m.id !== id); delete state.cart[id]; save();
    return { ok: true };
  }

  /* ---- Cart (always kept on the customer's own device) ---- */
  function setQty(id, qty) {
    const m = meal(id); if (!m || !m.published) { delete state.cart[id]; save(); return; }
    const q = Math.max(0, Math.min(Math.floor(qty) || 0, m.left));
    if (q) state.cart[id] = q; else delete state.cart[id];
    if (!state.checkoutKey) state.checkoutKey = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    save();
  }
  /* Re-checks every line against what is actually left, so a stale cart can never oversell. */
  function cart() {
    const lines = [], notes = [];
    for (const [id, q] of Object.entries(state.cart)) {
      const m = meal(id);
      if (!m || !m.published || m.left <= 0) { notes.push(`${m ? m.name : 'A meal'} is no longer available and was removed.`); delete state.cart[id]; continue; }
      if (q > m.left) { notes.push(`Only ${m.left} of ${m.name} left — quantity reduced.`); state.cart[id] = m.left; }
      lines.push({ id, name: m.name, price: m.price, qty: state.cart[id] });
    }
    if (notes.length) save(true);
    const total = lines.reduce((t, l) => t + l.price * l.qty, 0);
    return { lines, notes, total, count: lines.reduce((t, l) => t + l.qty, 0), short: Math.max(0, state.settings.minOrder - total) };
  }

  /* ---- Delivery ---- */
  const area = id => state.areas.find(a => a.id === id);
  const inRadius = a => !!a && a.km <= state.settings.radiusKm;
  const active = o => o.status !== 'cancelled';
  function windowsFor(date) {
    return state.settings.windows.map(label => {
      const used = remote ? (live.counts[date + '|' + label] || 0)
        : state.orders.filter(o => active(o) && o.date === date && o.window === label).length;
      return { label, full: used >= state.settings.windowCapacity, left: Math.max(0, state.settings.windowCapacity - used) };
    });
  }

  function validate(d) {
    const e = {};
    if (String(d.name || '').trim().length < 2) e.name = 'Enter your full name.';
    const digits = String(d.phone || '').replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) e.phone = 'Enter a phone number we can reach you on.';
    if (String(d.address || '').trim().length < 5) e.address = 'Enter the street and house number.';
    const a = area(d.areaId);
    if (!d.areaId) e.areaId = 'Choose your neighbourhood.';
    else if (!a) e.areaId = 'We don\'t deliver outside the listed neighbourhoods yet.';
    else if (!inRadius(a)) e.areaId = `${a.name} is ${a.km} km away — outside the ${state.settings.radiusKm} km delivery radius.`;
    const c = cycle();
    if (!d.date || !c.dates.includes(d.date)) e.date = 'Choose a delivery day.';
    else {
      const w = windowsFor(d.date).find(x => x.label === d.window);
      if (!w) e.window = 'Choose a delivery window.';
      else if (w.full) e.window = 'That window is fully booked. Choose another.';
    }
    return e;
  }

  const maskPhone = p => { const s = String(p); const d = s.replace(/\D/g, ''); return d.length < 4 ? '•••' : '••• ••• ' + d.slice(-3); };

  function notify(order, text) {
    state.messages.unshift({ at: Date.now(), ref: order.ref, channel: order.channel, to: maskPhone(order.phone), text });
    if (state.messages.length > 200) state.messages.length = 200;
  }

  function createOrder(d, lines, key, at) {
    const a = area(d.areaId);
    const order = {
      ref: 'TT-' + state.nextRef++, key, items: lines.map(l => ({ ...l })), total: lines.reduce((t, l) => t + l.price * l.qty, 0),
      name: d.name.trim(), phone: d.phone.trim(), address: d.address.trim(), areaId: a.id, areaName: a.name,
      date: d.date, window: d.window, notes: String(d.notes || '').trim(), channel: d.channel || 'SMS',
      pay: 'Cash on delivery', cashCollected: false, status: 'received', history: [{ status: 'received', at }], createdAt: at,
    };
    lines.forEach(l => { const m = meal(l.id); if (m) m.left = Math.max(0, m.left - l.qty); });
    state.orders.unshift(order);
    return order;
  }

  function afterPlaced(o, d) {
    if (!state.mine.includes(o.ref)) state.mine.unshift(o.ref);
    state.cart = {}; state.checkoutKey = null;
    state.draft = { name: d.name, phone: d.phone, address: d.address, areaId: d.areaId, channel: d.channel };
  }

  /* The same key always returns the same order, so a double tap or a retry can't create a second one. */
  async function placeOrder(d, key) {
    const existing = key && state.orders.find(o => o.key === key);
    if (existing) return { order: existing, duplicate: true };
    const c = cycle();
    if (!c.open) return { error: 'closed' };
    const ct = cart();
    if (ct.notes.length) return { error: 'stale', notes: ct.notes };
    if (!ct.lines.length) return { error: 'empty' };
    if (ct.short > 0) return { error: 'minimum' };
    const errors = validate(d);
    if (Object.keys(errors).length) return { error: 'invalid', errors };

    if (remote) {
      const { data, error } = await db.rpc('place_order', { p: {
        key, name: d.name, phone: d.phone, address: d.address, areaId: d.areaId, date: d.date, window: d.window,
        notes: d.notes || '', channel: d.channel || 'SMS', items: ct.lines.map(l => ({ id: l.id, qty: l.qty })),
      } });
      if (error) {
        const code = (/TT:([a-zA-Z_:]+)/.exec(error.message || '') || [])[1];
        await Promise.all([refreshPublic(), refreshCounts()]);
        if (!code) return { error: 'network' };
        if (code.startsWith('invalid')) return { error: code === 'invalid:window' ? 'window' : 'invalid' };
        return { error: code };
      }
      const o = mapOrder(data);
      state.tokens[o.ref] = o.token;
      state.orders = [o, ...state.orders.filter(x => x.ref !== o.ref)];
      afterPlaced(o, d);
      save();
      refreshPublic(); refreshCounts();
      return { order: o };
    }

    const order = createOrder(d, ct.lines, key, Date.now());
    notify(order, `Order ${order.ref} confirmed. ${order.items.reduce((t, l) => t + l.qty, 0)} meals, cash due on delivery: €${order.total.toFixed(2)}.`);
    afterPlaced(order, d);
    save();
    return { order };
  }

  const order = ref => state.orders.find(o => o.ref === ref);
  function restock(o) { o.items.forEach(l => { const m = meal(l.id); if (m) m.left += l.qty; }); }

  async function setStatus(ref, status) {
    const o = order(ref); if (!o) return { error: 'Order not found.' };
    if (!NEXT_STATUS[o.status].includes(status)) return { error: `An order that is "${STATUS[o.status]}" can't move to "${STATUS[status]}".` };
    if (remote) {
      const { error } = await db.rpc('chef_set_status', { p_ref: ref, p_status: status });
      await Promise.all([refreshOrders(), refreshPublic()]);
      return error ? { error: explain(error) } : { ok: true };
    }
    o.status = status; o.history.push({ status, at: Date.now() });
    if (status === 'cancelled') restock(o);
    if (status === 'delivered') o.cashCollected = true;
    const text = {
      preparing: `${state.settings.chefName} has started preparing order ${o.ref}.`,
      out: `Order ${o.ref} is out for delivery. Please have €${o.total.toFixed(2)} in cash ready.`,
      delivered: `Order ${o.ref} was delivered. Enjoy!`,
      cancelled: `Order ${o.ref} was cancelled by the chef. Nothing is owed.`,
    }[status];
    notify(o, text);
    save();
    return { ok: true };
  }

  /* Customers may cancel only until the chef starts cooking. */
  async function cancelByCustomer(ref) {
    const o = order(ref); if (!o) return { error: 'Order not found.' };
    if (remote) {
      const token = state.tokens[ref] || o.token;
      if (!token) return { error: 'This order was not placed from this device.' };
      const { error } = await db.rpc('cancel_order', { tok: token });
      await Promise.all([refreshOrders(), refreshPublic()]);
      if (error) return { error: /TT:policy/.test(error.message || '') ? 'policy' : explain(error) };
      return { ok: true };
    }
    if (o.status !== 'received') return { error: 'policy' };
    o.status = 'cancelled'; o.history.push({ status: 'cancelled', at: Date.now(), by: 'customer' });
    restock(o);
    notify(o, `Order ${o.ref} was cancelled at your request. Nothing is owed.`);
    save();
    return { ok: true };
  }

  async function saveSettings(patch) {
    const s = state.settings;
    Object.assign(s, patch);
    s.radiusKm = Math.max(1, Math.min(50, Number(s.radiusKm) || 15));
    s.minOrder = Math.max(0, Number(s.minOrder) || 0);
    s.windowCapacity = Math.max(1, Math.floor(Number(s.windowCapacity) || 1));
    s.cutoffDay = Number(s.cutoffDay);
    if (!/^\d\d:\d\d$/.test(s.cutoffTime)) s.cutoffTime = '20:00';
    s.deliveryDays = (s.deliveryDays || []).map(Number).filter(d => d !== s.cutoffDay);
    if (!s.deliveryDays.length) s.deliveryDays = [(s.cutoffDay + 2) % 7];
    save();
    if (remote) { const { error } = await db.from('settings').update({ data: s }).eq('id', 1); if (error) { await refreshPublic(); return { error: explain(error) }; } }
    return { ok: true };
  }

  function seedDemoOrders() {
    state.seededDemo = true;
    const dates = cycle().dates;
    const base = Date.now();
    DEMO_ORDERS.forEach((d, i) => {
      const lines = d.items.map(([id, qty]) => { const m = meal(id); return { id, name: m.name, price: m.price, qty }; });
      createOrder({ ...d, date: dates[Math.min(d.day, dates.length - 1)], window: state.settings.windows[d.window] }, lines, null, base - (i + 1) * 3 * 3600e3);
    });
    state.orders.sort((a, b) => b.createdAt - a.createdAt);
  }

  /* ================= shared database ================= */
  const explain = error => {
    const code = (/TT:([a-zA-Z_:]+)/.exec((error && error.message) || '') || [])[1];
    return { forbidden: 'Only the chef can do that. Please sign in again.', transition: 'That order has already moved on.', notfound: 'Order not found.' }[code]
      || 'Could not reach the server. Check your connection and try again.';
  };
  const mapOrder = r => ({
    ref: r.ref, key: r.key, token: r.token, items: r.items, total: Number(r.total), name: r.name, phone: r.phone, address: r.address,
    areaId: r.area_id, areaName: r.area_name, date: r.delivery_date, window: r.slot, notes: r.notes || '', channel: r.channel,
    pay: 'Cash on delivery', cashCollected: r.cash_collected, status: r.status, history: r.history || [], createdAt: Date.parse(r.created_at),
  });
  const mapMeal = r => ({ id: r.id, name: r.name, price: Number(r.price), left: r.left_count, published: r.published, sort: r.sort,
    tag: '', desc: '', portion: '', ingredients: '', allergens: '', reheat: '', ...(r.details || {}) });

  async function refreshPublic() {
    if (!remote) return;
    const [s, a, m] = await Promise.all([
      db.from('settings').select('data').eq('id', 1).maybeSingle(),
      db.from('areas').select('*').order('km'),
      db.from('meals').select('*').order('sort'),
    ]);
    if (s.error || a.error || m.error || !s.data) { live.error = 'offline'; live.loaded = true; save(); return; }
    live.error = null; live.loaded = true;
    state.settings = { ...state.settings, ...s.data.data };
    state.areas = a.data.map(r => ({ id: r.id, name: r.name, km: Number(r.km), deg: Number(r.deg) }));
    state.meals = m.data.map(mapMeal);
    save();
  }
  async function refreshCounts() {
    if (!remote) return;
    const { data, error } = await db.rpc('window_counts');
    if (!error && data) { live.counts = data; save(); }
  }
  async function refreshOrders() {
    if (!remote) return;
    if (live.isChef) {
      const [o, msg] = await Promise.all([
        db.from('orders').select('*').order('created_at', { ascending: false }).limit(500),
        db.from('messages').select('*').order('at', { ascending: false }).limit(400),
      ]);
      if (o.error) return;
      state.orders = o.data.map(mapOrder);
      if (!msg.error) state.messages = msg.data.map(r => ({ at: Date.parse(r.at), ref: r.ref, channel: r.channel, to: r.to_masked, text: r.text }));
    } else {
      const tokens = Object.values(state.tokens);
      if (!tokens.length) { state.orders = []; save(); return; }
      const { data, error } = await db.rpc('get_orders', { tokens });
      if (error) return;
      state.orders = (data || []).map(mapOrder);
    }
    save();
  }

  let chan = null, pubTimer = null;
  function watch() {
    if (chan) { db.removeChannel(chan); chan = null; }
    const later = () => { clearTimeout(pubTimer); pubTimer = setTimeout(() => { refreshPublic(); refreshCounts(); }, 400); };
    chan = db.channel('tt-' + (live.isChef ? 'chef' : 'public'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, later)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, later);
    if (live.isChef) chan.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, p => {
      refreshOrders();
      if (p.eventType === 'INSERT' && live.onNewOrder) live.onNewOrder(p.new);
    });
    chan.subscribe();
  }
  async function applySession(session) {
    live.signedIn = !!session; live.email = session ? session.user.email : ''; live.isChef = false;
    if (session) { const { data } = await db.rpc('is_chef'); live.isChef = data === true; }
    watch();
    await refreshOrders();
    save();
  }
  async function signIn(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email: String(email).trim(), password });
    if (error) return { error: /invalid/i.test(error.message) ? 'Wrong email or password.' : 'Could not sign in. Check your connection and try again.' };
    await applySession(data.session);
    return live.isChef ? { ok: true } : { error: 'This account does not have chef access.' };
  }
  async function signOut() { await db.auth.signOut(); state.orders = []; state.messages = []; await applySession(null); }

  async function start() {
    if (!remote) return;
    const { data } = await db.auth.getSession();
    await Promise.all([refreshPublic(), refreshCounts(), applySession(data ? data.session : null)]);
    /* Customers have no live channel for their own orders, so their status is re-checked quietly. */
    setInterval(() => { if (!live.isChef && !document.hidden && Object.keys(state.tokens).length) refreshOrders(); }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshPublic(); refreshCounts(); refreshOrders(); } });
  }

  load();
  start();
  return {
    get state() { return state; },
    remote, live,
    subscribe: f => subs.push(f), save, reset, iso, fromIso,
    cycle, meal, publishedMeals, mealIssues, saveMeal, setPublished, setLeft, deleteMeal,
    setQty, cart, area, inRadius, windowsFor, validate, maskPhone,
    placeOrder, order, setStatus, cancelByCustomer, saveSettings, active,
    signIn, signOut, refreshCounts, refreshOrders,
  };
})();
