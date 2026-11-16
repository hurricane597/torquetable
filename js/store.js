/* All business rules live here: ordering window, radius, minimum order, stock, statuses. The UI only asks and renders. */
const Store = (() => {
  const KEY = 'torquetable.mealprep.v2';
  let state;
  const subs = [];

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    if (!state || !state.settings) state = buildSeed();
    if (!state.seededDemo) seedDemoOrders();
    save(true);
  }
  function save(silent) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (!silent) subs.forEach(f => f());
  }
  function reset() { state = buildSeed(); seedDemoOrders(); save(); }

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
  function saveMeal(data) {
    let m = data.id && meal(data.id);
    if (!m) { m = { id: 'm' + state.nextMeal++, published: false }; state.meals.push(m); }
    Object.assign(m, {
      name: data.name.trim(), tag: data.tag.trim(), desc: data.desc.trim(), price: Math.max(0, Number(data.price) || 0),
      portion: data.portion.trim(), ingredients: data.ingredients.trim(), allergens: data.allergens.trim(), reheat: data.reheat.trim(),
      left: Math.max(0, Math.floor(Number(data.left) || 0)),
    });
    if (m.published && mealIssues(m).length) m.published = false;
    save();
    return m;
  }
  function setPublished(id, on) {
    const m = meal(id); if (!m) return { error: 'Meal not found.' };
    if (on) { const miss = mealIssues(m); if (miss.length) return { error: `Can't publish yet. Missing: ${miss.join(', ')}.` }; }
    m.published = !!on; save();
    return { ok: true };
  }
  function deleteMeal(id) { state.meals = state.meals.filter(m => m.id !== id); delete state.cart[id]; save(); }

  /* ---- Cart ---- */
  function setQty(id, qty) {
    const m = meal(id); if (!m || !m.published) { delete state.cart[id]; save(); return; }
    const q = Math.max(0, Math.min(Math.floor(qty) || 0, m.left));
    if (q) state.cart[id] = q; else delete state.cart[id];
    if (!state.checkoutKey) state.checkoutKey = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
      const used = state.orders.filter(o => active(o) && o.date === date && o.window === label).length;
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

  /* The same key always returns the same order, so a double tap or a retry can't create a second one. */
  function placeOrder(d, key) {
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
    const order = createOrder(d, ct.lines, key, Date.now());
    notify(order, `Order ${order.ref} confirmed. ${order.items.reduce((t, l) => t + l.qty, 0)} meals, cash due on delivery: €${order.total.toFixed(2)}.`);
    state.mine.unshift(order.ref);
    state.cart = {}; state.checkoutKey = null;
    state.draft = { name: d.name, phone: d.phone, address: d.address, areaId: d.areaId, channel: d.channel };
    save();
    return { order };
  }

  const order = ref => state.orders.find(o => o.ref === ref);
  function restock(o) { o.items.forEach(l => { const m = meal(l.id); if (m) m.left += l.qty; }); }

  function setStatus(ref, status) {
    const o = order(ref); if (!o) return { error: 'Order not found.' };
    if (!NEXT_STATUS[o.status].includes(status)) return { error: `An order that is "${STATUS[o.status]}" can't move to "${STATUS[status]}".` };
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
  function cancelByCustomer(ref) {
    const o = order(ref); if (!o) return { error: 'Order not found.' };
    if (o.status !== 'received') return { error: 'policy' };
    o.status = 'cancelled'; o.history.push({ status: 'cancelled', at: Date.now(), by: 'customer' });
    restock(o);
    notify(o, `Order ${o.ref} was cancelled at your request. Nothing is owed.`);
    save();
    return { ok: true };
  }

  function saveSettings(patch) {
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

  load();
  return {
    get state() { return state; },
    subscribe: f => subs.push(f), save, reset, iso, fromIso,
    cycle, meal, publishedMeals, mealIssues, saveMeal, setPublished, deleteMeal,
    setQty, cart, area, inRadius, windowsFor, validate, maskPhone,
    placeOrder, order, setStatus, cancelByCustomer, saveSettings, active,
  };
})();
